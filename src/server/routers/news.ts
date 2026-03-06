import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { NewsAPIService } from '@/lib/newsapi';
import { TRPCError } from '@trpc/server';

const newsApiService = new NewsAPIService();

export const newsRouter = router({
  // Fetch daily news manually (for testing)
  fetchDaily: publicProcedure
    .mutation(async () => {
      try {
        console.log('🚀 Manual daily news fetch triggered...');
        const result = await newsApiService.fetchDailyNews();
        
        return {
          success: true,
          message: `Successfully fetched ${result.apiResponse.articles.length} articles`,
          timestamp: result.scanTimeMs,
          data: {
            scanTime: result.scanTime,
            articlesCount: result.apiResponse.articles.length,
            fetchDuration: result.metadata.fetchDuration,
            sourcesQueried: result.metadata.sourcesQueried,
            articlesPerSource: result.metadata.articlesPerSource,
            status: result.apiResponse.status,
            errors: result.metadata.errors
          }
        };
      } catch (error) {
        console.error('❌ News fetch failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch news: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Fetch news manually with custom parameters
  fetchManual: publicProcedure
    .input(z.object({
      sources: z.array(z.string()).optional(),
      pageSize: z.number().min(1).max(100).default(20)
    }))
    .mutation(async ({ input }) => {
      try {
        console.log('🔧 Manual news fetch with custom params:', input);
        const result = await newsApiService.fetchNewsManual(input.sources, input.pageSize);
        
        return {
          success: true,
          message: `Fetched ${result.articles.length} articles`,
          data: {
            totalResults: result.totalResults,
            articlesCount: result.articles.length,
            status: result.status,
            articles: result.articles.map(article => ({
              title: article.title,
              source: article.source.name,
              publishedAt: article.publishedAt,
              url: article.url
            }))
          }
        };
      } catch (error) {
        console.error('❌ Manual news fetch failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch news: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Test NewsAPI connection
  testConnection: publicProcedure
    .query(async () => {
      try {
        console.log('🔗 Testing NewsAPI connection...');
        const result = await newsApiService.fetchNewsManual(['associated-press'], 1);
        
        return {
          success: true,
          message: 'NewsAPI connection successful',
          timestamp: Date.now(),
          testResult: {
            status: result.status,
            articlesFound: result.articles.length,
            totalResults: result.totalResults
          }
        };
      } catch (error) {
        console.error('❌ NewsAPI connection test failed:', error);
        
        // Check if it's an API key issue
        if (error instanceof Error && error.message.includes('apiKey')) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Invalid NewsAPI key. Please check your NEWS_API_KEY environment variable.'
          });
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `NewsAPI connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Get available news sources
  getSources: publicProcedure
    .query(async () => {
      return {
        sources: [
          { id: 'associated-press', name: 'Associated Press', url: 'apnews.com' },
          { id: 'cbs-news', name: 'CBS News', url: 'cbsnews.com' },
          { id: 'abc-news', name: 'ABC News', url: 'abc7.com' },
          { id: 'fox-news', name: 'Fox News', url: 'foxla.com' }
        ],
        domains: [
          'latimes.com',
          'ktla.com',
          'dailynews.com',
          'nbclosangeles.com',
          'abc7.com',
          'foxla.com'
        ],
        message: 'These are the target news sources for our daily fetch'
      };
    }),

  // Get today's 8am LA timestamp (utility)
  getTodayTimestamp: publicProcedure
    .query(() => {
      const now = new Date();
      const la8am = new Date(now);
      la8am.setHours(8, 0, 0, 0);
      
      // Handle Pacific Time (PST/PDT)  
      const month = now.getMonth() + 1;
      const isDST = month >= 3 && month <= 11;
      const offset = isDST ? 7 : 8; // UTC-7 or UTC-8
      const utc8am = new Date(la8am.getTime() + (offset * 60 * 60 * 1000));
      
      return {
        timestamp: utc8am.getTime(),
        isoString: utc8am.toISOString(),
        localString: la8am.toLocaleString('en-US', { 
          timeZone: 'America/Los_Angeles',
          dateStyle: 'full',
          timeStyle: 'short'
        }),
        isDST
      };
    })
});