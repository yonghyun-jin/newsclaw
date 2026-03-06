import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import axios from 'axios';

export const debugRouter = router({
  // Test different NewsAPI endpoints to find working sources
  testNewsAPI: publicProcedure
    .input(z.object({
      endpoint: z.enum(['everything', 'top-headlines', 'sources']),
      params: z.record(z.string()).optional()
    }))
    .query(async ({ input }) => {
      try {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
          throw new Error('NEWS_API_KEY not found');
        }

        const baseUrl = 'https://newsapi.org/v2';
        const url = `${baseUrl}/${input.endpoint}`;
        
        console.log(`🔍 Testing NewsAPI: ${input.endpoint}`);
        console.log(`📡 URL: ${url}`);
        console.log(`📋 Params:`, input.params);

        const response = await axios.get(url, {
          params: {
            ...input.params,
            apiKey
          },
          timeout: 30000
        });

        console.log(`✅ Response status: ${response.status}`);
        console.log(`📊 Response data keys:`, Object.keys(response.data));

        return {
          success: true,
          status: response.status,
          data: response.data,
          articlesCount: response.data.articles?.length || 0,
          totalResults: response.data.totalResults || 0
        };

      } catch (error: any) {
        console.error('❌ NewsAPI test failed:', error);
        
        return {
          success: false,
          error: error.response?.data || error.message,
          status: error.response?.status,
          message: error.message
        };
      }
    }),

  // Get available news sources from NewsAPI
  getAvailableSources: publicProcedure
    .query(async () => {
      try {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
          throw new Error('NEWS_API_KEY not found');
        }

        console.log('📰 Fetching available NewsAPI sources...');

        const response = await axios.get('https://newsapi.org/v2/sources', {
          params: {
            language: 'en',
            country: 'us',
            apiKey
          }
        });

        const sources = response.data.sources || [];
        console.log(`📋 Found ${sources.length} US English sources`);

        // Filter for news sources we care about
        const relevantSources = sources.filter((source: any) => {
          const name = source.name.toLowerCase();
          const id = source.id.toLowerCase();
          return (
            name.includes('associated press') ||
            name.includes('cbs') ||
            name.includes('abc') ||
            name.includes('fox') ||
            name.includes('nbc') ||
            id.includes('associated-press') ||
            id.includes('cbs') ||
            id.includes('abc') ||
            id.includes('fox') ||
            id.includes('nbc')
          );
        });

        return {
          success: true,
          allSourcesCount: sources.length,
          relevantSourcesCount: relevantSources.length,
          relevantSources: relevantSources.map((source: any) => ({
            id: source.id,
            name: source.name,
            description: source.description,
            url: source.url,
            category: source.category
          })),
          allSources: sources.slice(0, 20).map((source: any) => ({
            id: source.id,
            name: source.name,
            category: source.category
          }))
        };

      } catch (error: any) {
        console.error('❌ Failed to get sources:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get sources: ${error.response?.data?.message || error.message}`
        });
      }
    }),

  // Test specific search queries
  testQueries: publicProcedure
    .query(async () => {
      try {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
          throw new Error('NEWS_API_KEY not found');
        }

        const testCases = [
          {
            name: 'General Everything Query',
            params: {
              q: 'news',
              language: 'en',
              sortBy: 'publishedAt',
              pageSize: 10
            }
          },
          {
            name: 'Top Headlines US',
            endpoint: 'top-headlines',
            params: {
              country: 'us',
              pageSize: 10
            }
          },
          {
            name: 'Domain Search (LA Times)',
            params: {
              domains: 'latimes.com',
              language: 'en',
              sortBy: 'publishedAt',
              pageSize: 10
            }
          },
          {
            name: 'Associated Press Source',
            params: {
              sources: 'associated-press',
              pageSize: 10
            }
          }
        ];

        const results = [];

        for (const testCase of testCases) {
          try {
            const endpoint = testCase.endpoint || 'everything';
            const url = `https://newsapi.org/v2/${endpoint}`;
            
            console.log(`🧪 Testing: ${testCase.name}`);
            
            const response = await axios.get(url, {
              params: {
                ...testCase.params,
                apiKey
              },
              timeout: 10000
            });

            results.push({
              name: testCase.name,
              success: true,
              articlesCount: response.data.articles?.length || 0,
              totalResults: response.data.totalResults || 0,
              status: response.data.status
            });

          } catch (error: any) {
            results.push({
              name: testCase.name,
              success: false,
              error: error.response?.data || error.message,
              status: error.response?.status
            });
          }
        }

        return {
          success: true,
          results,
          summary: {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
          }
        };

      } catch (error: any) {
        console.error('❌ Test queries failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Test queries failed: ${error.message}`
        });
      }
    })
});