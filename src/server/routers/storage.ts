import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { NewsStorageService, type ScoredArticle } from '@/lib/s3storage';
import { TRPCError } from '@trpc/server';

const storageService = new NewsStorageService();

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
  // Store daily news (raw data only for now)
  storeRawData: publicProcedure
    .input(z.object({
      timestamp: z.number(),
      rawData: z.any() // NewsAPI response - validated by our service
    }))
    .mutation(async ({ input }) => {
      try {
        console.log(`📦 Storing raw data for timestamp: ${input.timestamp}`);
        await storageService.storeRawData(input.timestamp, input.rawData);
        
        return {
          success: true,
          message: 'Raw data stored successfully',
          timestamp: input.timestamp,
          key: `${input.timestamp}/raw.json`,
          articleCount: input.rawData.apiResponse?.articles?.length || 0
        };
      } catch (error) {
        console.error('❌ Failed to store raw data:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to store raw data: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Store summary data (scored articles)
  storeSummaryData: publicProcedure
    .input(z.object({
      timestamp: z.number(),
      summaryData: z.array(ScoredArticleSchema)
    }))
    .mutation(async ({ input }) => {
      try {
        console.log(`📦 Storing summary data for timestamp: ${input.timestamp}`);
        await storageService.storeSummaryData(input.timestamp, input.summaryData);
        
        return {
          success: true,
          message: 'Summary data stored successfully',
          timestamp: input.timestamp,
          key: `${input.timestamp}/summary.json`,
          articleCount: input.summaryData.length
        };
      } catch (error) {
        console.error('❌ Failed to store summary data:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to store summary data: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Get daily news data
  getDailyNews: publicProcedure
    .input(z.object({
      timestamp: z.number(),
      type: z.enum(['raw', 'summary'])
    }))
    .query(async ({ input }) => {
      try {
        console.log(`📥 Retrieving ${input.type} data for timestamp: ${input.timestamp}`);
        
        let data;
        if (input.type === 'raw') {
          data = await storageService.getRawData(input.timestamp);
        } else {
          data = await storageService.getSummaryData(input.timestamp);
        }
        
        return {
          success: true,
          timestamp: input.timestamp,
          type: input.type,
          data
        };
      } catch (error) {
        console.error(`❌ Failed to retrieve ${input.type} data:`, error);
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Failed to retrieve ${input.type} data: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // List available dates
  listAvailableDates: publicProcedure
    .query(async () => {
      try {
        console.log('📋 Listing available dates...');
        const dates = await storageService.listAvailableDates();
        
        return {
          success: true,
          count: dates.length,
          dates: dates.map(metadata => ({
            timestamp: metadata.timestamp,
            date: metadata.date,
            hasRaw: metadata.hasRaw,
            hasSummary: metadata.hasSummary,
            articleCount: metadata.articleCount,
            displayDate: new Date(metadata.timestamp).toLocaleDateString('en-US', {
              weekday: 'short',
              year: 'numeric', 
              month: 'short',
              day: 'numeric'
            })
          }))
        };
      } catch (error) {
        console.error('❌ Failed to list available dates:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to list available dates: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Test S3 connection
  testConnection: publicProcedure
    .query(async () => {
      try {
        console.log('🔗 Testing S3 connection...');
        const isConnected = await storageService.testConnection();
        
        if (!isConnected) {
          throw new Error('S3 connection test returned false');
        }
        
        return {
          success: true,
          message: 'S3 connection successful',
          timestamp: Date.now(),
          endpoint: process.env.S3_ENDPOINT,
          bucket: process.env.S3_BUCKET_NAME,
          region: process.env.S3_REGION
        };
      } catch (error) {
        console.error('❌ S3 connection test failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `S3 connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Create S3 bucket if it doesn't exist
  createBucket: publicProcedure
    .mutation(async () => {
      try {
        console.log('📦 Creating S3 bucket...');
        const result = await storageService.createBucketIfNotExists();
        
        return {
          success: true,
          message: result.created ? 'Bucket created successfully' : 'Bucket already exists',
          bucketName: process.env.S3_BUCKET_NAME,
          created: result.created,
          exists: result.exists
        };
      } catch (error) {
        console.error('❌ Failed to create bucket:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create bucket: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Get storage statistics
  getStorageStats: publicProcedure
    .query(async () => {
      try {
        console.log('📊 Getting storage statistics...');
        const dates = await storageService.listAvailableDates();
        
        const totalDays = dates.length;
        const totalRawFiles = dates.filter(d => d.hasRaw).length;
        const totalSummaryFiles = dates.filter(d => d.hasSummary).length;
        
        // Calculate total articles (would need to read files for exact count)
        const avgArticlesPerDay = 100; // Estimate based on our target
        const totalArticles = totalDays * avgArticlesPerDay;
        
        const lastUpdate = dates.length > 0 ? 
          new Date(Math.max(...dates.map(d => d.timestamp))).toISOString() :
          null;
        
        return {
          success: true,
          totalDays,
          totalRawFiles,
          totalSummaryFiles,
          totalArticles,
          avgArticlesPerDay,
          lastUpdate,
          storageUsed: `~${Math.round(totalDays * 0.5)} MB`, // Rough estimate
          oldestDate: dates.length > 0 ? 
            new Date(Math.min(...dates.map(d => d.timestamp))).toLocaleDateString() : 
            null,
          newestDate: dates.length > 0 ?
            new Date(Math.max(...dates.map(d => d.timestamp))).toLocaleDateString() :
            null
        };
      } catch (error) {
        console.error('❌ Failed to get storage stats:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get storage statistics: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Get recent news summary (last N days)
  getRecentSummary: publicProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7)
    }))
    .query(async ({ input }) => {
      try {
        console.log(`📅 Getting recent ${input.days} days summary...`);
        const allDates = await storageService.listAvailableDates();
        
        // Get the most recent N days that have summary data
        const recentDates = allDates
          .filter(d => d.hasSummary)
          .slice(0, input.days);
        
        const summariesPromises = recentDates.map(async (dateInfo) => {
          try {
            const summaryData = await storageService.getSummaryData(dateInfo.timestamp);
            return {
              date: dateInfo.date,
              timestamp: dateInfo.timestamp,
              articleCount: summaryData.articles.length,
              averageScore: summaryData.statistics.averageScore,
              topScore: summaryData.statistics.topScore,
              topSources: Object.entries(summaryData.statistics.sourceBreakdown)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([source, count]) => ({ source, count })),
              topArticles: summaryData.articles
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map(article => ({
                  title: article.title,
                  publisher: article.publisher,
                  score: article.score,
                  url: article.url
                }))
            };
          } catch (error) {
            console.warn(`Warning: Could not load summary for ${dateInfo.date}:`, error);
            return {
              date: dateInfo.date,
              timestamp: dateInfo.timestamp,
              error: 'Failed to load summary data'
            };
          }
        });
        
        const summaries = await Promise.all(summariesPromises);
        
        return {
          success: true,
          days: input.days,
          foundDays: summaries.length,
          summaries
        };
      } catch (error) {
        console.error('❌ Failed to get recent summary:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get recent summary: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    })
});