import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { NewsScheduler } from '@/lib/scheduler';
import { TRPCError } from '@trpc/server';

// Global scheduler instance (singleton for the app)
let globalScheduler: NewsScheduler | null = null;

function getScheduler(): NewsScheduler {
  if (!globalScheduler) {
    globalScheduler = new NewsScheduler({
      enabled: process.env.PIPELINE_ENABLED === 'true',
      timezone: process.env.PIPELINE_TIMEZONE || 'America/Los_Angeles',
      notificationWebhook: process.env.PIPELINE_WEBHOOK_URL
    });
  }
  return globalScheduler;
}

export const schedulerRouter = router({
  // Get scheduler status
  getStatus: publicProcedure
    .query(async () => {
      try {
        const scheduler = getScheduler();
        const status = scheduler.getStatus();
        
        return {
          success: true,
          status: {
            isRunning: status.isRunning,
            isScheduled: status.isScheduled,
            enabled: status.config.enabled,
            cronExpression: status.config.cronExpression,
            timezone: status.config.timezone,
            nextRun: status.nextRun?.toISOString(),
            nextRunLocal: status.nextRun?.toLocaleString('en-US', {
              timeZone: status.config.timezone,
              dateStyle: 'full',
              timeStyle: 'short'
            }),
            lastResult: status.lastResult ? {
              success: status.lastResult.success,
              timestamp: status.lastResult.timestamp,
              duration: status.lastResult.duration,
              articlesProcessed: status.lastResult.articlesProcessed,
              errors: status.lastResult.errors,
              date: new Date(status.lastResult.timestamp).toLocaleDateString()
            } : null
          }
        };
      } catch (error) {
        console.error('❌ Failed to get scheduler status:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get scheduler status: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Start the scheduler
  start: publicProcedure
    .mutation(async () => {
      try {
        console.log('🚀 Starting scheduler via API...');
        const scheduler = getScheduler();
        scheduler.start();
        
        return {
          success: true,
          message: 'Scheduler started successfully',
          status: scheduler.getStatus()
        };
      } catch (error) {
        console.error('❌ Failed to start scheduler:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to start scheduler: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Stop the scheduler
  stop: publicProcedure
    .mutation(async () => {
      try {
        console.log('🛑 Stopping scheduler via API...');
        const scheduler = getScheduler();
        scheduler.stop();
        
        return {
          success: true,
          message: 'Scheduler stopped successfully',
          status: scheduler.getStatus()
        };
      } catch (error) {
        console.error('❌ Failed to stop scheduler:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to stop scheduler: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Trigger manual fetch
  triggerManual: publicProcedure
    .mutation(async () => {
      try {
        console.log('🔧 Manual fetch triggered via API...');
        const scheduler = getScheduler();
        const result = await scheduler.triggerManualFetch();
        
        return {
          success: true,
          message: result.success ? 'Manual fetch completed successfully' : 'Manual fetch failed',
          result: {
            success: result.success,
            timestamp: result.timestamp,
            duration: result.duration,
            articlesProcessed: result.articlesProcessed,
            errors: result.errors,
            date: new Date(result.timestamp).toLocaleDateString()
          }
        };
      } catch (error) {
        console.error('❌ Manual fetch failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Manual fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Update scheduler configuration
  updateConfig: publicProcedure
    .input(z.object({
      enabled: z.boolean().optional(),
      cronExpression: z.string().optional(),
      timezone: z.string().optional(),
      notificationWebhook: z.string().url().optional().or(z.literal('')),
    }))
    .mutation(async ({ input }) => {
      try {
        console.log('🔄 Updating scheduler config via API:', input);
        const scheduler = getScheduler();
        
        // Filter out empty strings and undefined values
        const cleanConfig = Object.fromEntries(
          Object.entries(input).filter(([_, value]) => value !== undefined && value !== '')
        );
        
        scheduler.updateConfig(cleanConfig);
        
        return {
          success: true,
          message: 'Scheduler configuration updated successfully',
          config: scheduler.getStatus().config
        };
      } catch (error) {
        console.error('❌ Failed to update scheduler config:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to update config: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Get execution history (last 10 runs)
  getHistory: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10)
    }))
    .query(async ({ input }) => {
      try {
        // For now, return mock history since we don't have persistent storage yet
        // In Phase 3, this could be enhanced to read from actual execution logs
        const scheduler = getScheduler();
        const status = scheduler.getStatus();
        
        const history = [];
        if (status.lastResult) {
          history.push({
            timestamp: status.lastResult.timestamp,
            success: status.lastResult.success,
            duration: status.lastResult.duration,
            articlesProcessed: status.lastResult.articlesProcessed,
            errors: status.lastResult.errors,
            date: new Date(status.lastResult.timestamp).toLocaleDateString(),
            time: new Date(status.lastResult.timestamp).toLocaleTimeString()
          });
        }
        
        return {
          success: true,
          history,
          total: history.length
        };
      } catch (error) {
        console.error('❌ Failed to get scheduler history:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to get history: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }),

  // Health check - verifies all components
  healthCheck: publicProcedure
    .query(async () => {
      try {
        console.log('🔍 Running scheduler health check...');
        
        const scheduler = getScheduler();
        const status = scheduler.getStatus();
        
        // Test NewsAPI connection
        let newsApiHealthy = false;
        try {
          // This would test the NewsAPI connection
          newsApiHealthy = !!process.env.NEWS_API_KEY;
        } catch (error) {
          console.warn('NewsAPI health check failed:', error);
        }
        
        // Test S3 connection
        let storageHealthy = false;
        try {
          // This would test the S3 connection
          storageHealthy = !!(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID);
        } catch (error) {
          console.warn('Storage health check failed:', error);
        }
        
        const overallHealth = newsApiHealthy && storageHealthy;
        
        return {
          success: true,
          health: {
            overall: overallHealth,
            components: {
              scheduler: status.isScheduled,
              newsApi: newsApiHealthy,
              storage: storageHealthy
            },
            details: {
              schedulerEnabled: status.config.enabled,
              nextRun: status.nextRun?.toISOString(),
              lastExecution: status.lastResult ? {
                success: status.lastResult.success,
                timestamp: status.lastResult.timestamp
              } : null
            }
          }
        };
      } catch (error) {
        console.error('❌ Health check failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    })
});