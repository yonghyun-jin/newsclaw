import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

// Zod schemas for type safety
const ScoredArticleSchema = z.object({
  title: z.string(),
  description: z.string(),
  url: z.string().url(),
  publisher: z.string(),
  publishedAt: z.string(),
  topic: z.string().optional(),
  score: z.number(),
  scoreBreakdown: z.object({
    koreanRelevance: z.number(),
    timeliness: z.number(),
    audienceAppeal: z.number()
  })
});

export const storageRouter = router({
  // Store daily news (both raw and summary)
  storeDailyNews: publicProcedure
    .input(z.object({
      timestamp: z.number(),
      rawData: z.any(), // NewsAPI response - will be validated server-side
      summaryData: z.array(ScoredArticleSchema).optional()
    }))
    .mutation(async ({ input }) => {
      return {
        success: true,
        message: 'Storage endpoint - to be implemented in main app',
        timestamp: input.timestamp,
        rawDataSize: JSON.stringify(input.rawData).length,
        summaryCount: input.summaryData?.length || 0
      };
    }),

  // Get daily news data
  getDailyNews: publicProcedure
    .input(z.object({
      timestamp: z.number(),
      type: z.enum(['raw', 'summary'])
    }))
    .query(async ({ input }) => {
      return {
        success: true,
        message: 'Get daily news - to be implemented',
        timestamp: input.timestamp,
        type: input.type,
        data: null // Will return actual data when implemented
      };
    }),

  // List available dates
  listAvailableDates: publicProcedure
    .query(async () => {
      return {
        success: true,
        message: 'List dates - to be implemented',
        dates: [] // Will return StorageMetadata[] when implemented
      };
    }),

  // Test S3 connection
  testConnection: publicProcedure
    .query(async () => {
      return {
        success: true,
        message: 'S3 connection test - to be implemented',
        timestamp: Date.now()
      };
    }),

  // Get storage statistics
  getStorageStats: publicProcedure
    .query(async () => {
      return {
        success: true,
        totalDays: 0,
        totalArticles: 0,
        avgArticlesPerDay: 0,
        lastUpdate: new Date().toISOString(),
        storageUsed: '0 MB'
      };
    }),

  // Get recent news summary (last 7 days)
  getRecentSummary: publicProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7)
    }))
    .query(async ({ input }) => {
      return {
        success: true,
        message: `Get recent ${input.days} days summary - to be implemented`,
        days: input.days,
        summaries: [] // Will return actual summaries when implemented
      };
    })
});