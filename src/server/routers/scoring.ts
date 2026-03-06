import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { ScoringService, type ArticleInput } from '@/lib/scoring';

const scoringService = new ScoringService();

// Zod schema matching ArticleInput
const ArticleInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  content: z.string().optional(),
  publishedAt: z.string(), // ISO 8601
  source: z.string(),
  url: z.string()
});

export const scoringRouter = router({
  /**
   * Score a single batch of up to 10 articles.
   * Used for on-demand scoring.
   */
  scoreBatch: publicProcedure
    .input(
      z.object({
        articles: z.array(ArticleInputSchema).min(1).max(10)
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log(`🤖 scoreBatch called with ${input.articles.length} articles`);
        const result = await scoringService.scoreBatch(input.articles as ArticleInput[], 0);

        return {
          success: true,
          scoredArticles: result.scoredArticles,
          tokensUsed: result.tokensUsed,
          processingMs: result.processingMs
        };
      } catch (error) {
        console.error('❌ scoreBatch failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  /**
   * Score up to 50 articles for the day (5 batches of 10).
   * Intended to be called once per day after the news fetch.
   */
  scoreDaily: publicProcedure
    .input(
      z.object({
        articles: z.array(ArticleInputSchema).min(1).max(100)
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log(`📅 scoreDaily called with ${input.articles.length} articles (limit: 50)`);
        const result = await scoringService.scoreDailyArticles(input.articles as ArticleInput[]);

        return {
          success: true,
          date: result.date,
          totalArticlesScored: result.totalArticlesScored,
          dailyLimitReached: result.dailyLimitReached,
          allScores: result.allScores,
          batchSummaries: result.batches.map(b => ({
            batchIndex: b.batchIndex,
            articlesInBatch: b.scoredArticles.length,
            tokensUsed: b.tokensUsed,
            processingMs: b.processingMs
          })),
          totalTokensUsed: result.batches.reduce((sum, b) => sum + b.tokensUsed, 0),
          totalProcessingMs: result.batches.reduce((sum, b) => sum + b.processingMs, 0)
        };
      } catch (error) {
        console.error('❌ scoreDaily failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Daily scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  /**
   * Preview the scoring prompt without making an OpenAI call.
   * Useful for reviewing and tuning the prompt.
   */
  getPrompt: publicProcedure.query(() => {
    const { SCORING_SYSTEM_PROMPT } = require('@/lib/scoring');
    return {
      prompt: SCORING_SYSTEM_PROMPT,
      scoringCategories: [
        { name: 'korean_relevance', label: '한국 관련성', maxPoints: 25 },
        { name: 'timeliness', label: '시의성', maxPoints: 12 },
        { name: 'politics', label: '정치 및 이민', maxPoints: 20 },
        { name: 'audience_appeal', label: '독자 어필', maxPoints: 15 }
      ],
      maxTotalScore: 72,
      batchSize: parseInt(process.env.OPENAI_BATCH_SIZE ?? '10', 10),
      dailyLimit: parseInt(process.env.OPENAI_DAILY_LIMIT ?? '50', 10),
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    };
  })
});
