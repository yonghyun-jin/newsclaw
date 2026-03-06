import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { NewsStorageService } from '@/lib/s3storage';
import { TRPCError } from '@trpc/server';

const storageService = new NewsStorageService();

/** Convert a YYYY-MM-DD string to the 8am LA time UTC timestamp in ms. */
function get8amLATimestamp(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  // LA DST: March–November = PDT (UTC-7), else PST (UTC-8)
  const isDST = month >= 3 && month <= 11;
  const offsetHours = isDST ? 7 : 8;
  // 8am local + offset = UTC equivalent (matches scheduler calculation)
  return Date.UTC(year, month - 1, day, 8 + offsetHours, 0, 0, 0);
}

export const storageRouter = router({
  // ─── Core read endpoints ──────────────────────────────────────────────────

  /**
   * Fetch scored articles for a selected date.
   * Summary articles (no URL) are enriched with URLs from raw.json by articleId.
   * Articles are returned sorted by total score descending.
   */
  getByDate: publicProcedure
    .input(z.object({
      dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD')
    }))
    .query(async ({ input }) => {
      const timestamp = get8amLATimestamp(input.dateStr);

      try {
        const { hasRaw, hasSummary } = await storageService.checkDayExists(timestamp);

        if (!hasSummary) {
          return {
            success: false,
            dateStr: input.dateStr,
            timestamp,
            hasRaw,
            hasSummary: false,
            articles: [],
            meta: null,
          };
        }

        // Fetch both files concurrently
        const [summary, raw] = await Promise.all([
          storageService.getSummaryData(timestamp),
          hasRaw ? storageService.getRawData(timestamp) : null,
        ]);

        // Build a lookup map: articleId → url from raw.json
        const urlMap = new Map<string, string>();
        if (raw) {
          raw.apiResponse.articles.forEach(a => urlMap.set(a.articleId, a.url));
        }

        // Enrich summary articles with URL and ensure sorted by score desc
        const articles = summary.articles
          .sort((a, b) => b.total - a.total)
          .map(a => ({
            ...a,
            url: urlMap.get(a.articleId) ?? null,
          }));

        return {
          success: true,
          dateStr: input.dateStr,
          timestamp,
          hasRaw,
          hasSummary: true,
          articles,
          meta: {
            scanTime: summary.scanTime,
            generatedAt: summary.generatedAt,
            model: summary.model,
            totalArticlesInRaw: summary.totalArticlesInRaw,
            totalArticlesScored: summary.totalArticlesScored,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to load data for ${input.dateStr}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  /** Check whether raw.json and summary.json exist for a given date. */
  checkDayExists: publicProcedure
    .input(z.object({ dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input }) => {
      const timestamp = get8amLATimestamp(input.dateStr);
      const exists = await storageService.checkDayExists(timestamp);
      return { ...exists, timestamp, dateStr: input.dateStr };
    }),

  // ─── Raw storage mutations (admin / manual) ───────────────────────────────

  storeRawData: publicProcedure
    .input(z.object({
      timestamp: z.number(),
      rawData: z.any()
    }))
    .mutation(async ({ input }) => {
      try {
        await storageService.storeRawData(input.timestamp, input.rawData);
        return {
          success: true,
          message: 'Raw data stored successfully',
          timestamp: input.timestamp,
          key: `${input.timestamp}/raw.json`,
          articleCount: input.rawData.apiResponse?.articles?.length ?? 0,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to store raw data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // ─── List / metadata ──────────────────────────────────────────────────────

  listAvailableDates: publicProcedure
    .query(async () => {
      try {
        const dates = await storageService.listAvailableDates();
        return {
          success: true,
          count: dates.length,
          dates: dates.map(d => ({
            timestamp: d.timestamp,
            date: d.date,
            hasRaw: d.hasRaw,
            hasSummary: d.hasSummary,
            displayDate: new Date(d.timestamp).toLocaleDateString('en-US', {
              weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            }),
          })),
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list available dates: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  getStorageStats: publicProcedure
    .query(async () => {
      try {
        const dates = await storageService.listAvailableDates();
        const lastUpdate = dates.length > 0
          ? new Date(Math.max(...dates.map(d => d.timestamp))).toISOString()
          : null;
        const totalDays = dates.length;
        const totalRawFiles = dates.filter(d => d.hasRaw).length;
        const totalSummaryFiles = dates.filter(d => d.hasSummary).length;
        return {
          success: true,
          totalDays,
          totalRawFiles,
          totalSummaryFiles,
          lastUpdate,
          storageUsed: `~${Math.round(totalDays * 0.5)} MB`,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get storage stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  // ─── Infrastructure ───────────────────────────────────────────────────────

  testConnection: publicProcedure
    .query(async () => {
      try {
        const ok = await storageService.testConnection();
        if (!ok) throw new Error('Connection test returned false');
        return {
          success: true,
          message: 'S3 connection successful',
          timestamp: Date.now(),
          endpoint: process.env.S3_ENDPOINT,
          bucket: process.env.S3_BUCKET_NAME,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `S3 connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),

  createBucket: publicProcedure
    .mutation(async () => {
      try {
        const result = await storageService.createBucketIfNotExists();
        return {
          success: true,
          message: result.created ? 'Bucket created' : 'Bucket already exists',
          bucketName: process.env.S3_BUCKET_NAME,
          ...result,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create bucket: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }),
});
