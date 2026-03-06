import * as cron from 'node-cron';
import { NewsAPIService } from './newsapi';
import { NewsStorageService } from './s3storage';

export interface SchedulerConfig {
  timezone: string;
  enabled: boolean;
  cronExpression: string; // '0 8 * * *' for 8am daily
  maxRetries: number;
  notificationWebhook?: string;
}

export interface ScheduledJobResult {
  success: boolean;
  timestamp: number;
  duration: number;
  articlesProcessed: number;
  errors?: string[];
  nextRun?: Date;
}

export class NewsScheduler {
  private newsApi: NewsAPIService;
  private storage: NewsStorageService;
  private config: SchedulerConfig;
  private currentJob?: cron.ScheduledTask;
  private isRunning = false;
  private lastResult?: ScheduledJobResult;

  constructor(config?: Partial<SchedulerConfig>) {
    this.newsApi = new NewsAPIService();
    this.storage = new NewsStorageService();
    
    this.config = {
      timezone: 'America/Los_Angeles',
      enabled: process.env.PIPELINE_ENABLED === 'true',
      cronExpression: '0 8 * * *', // 8am daily LA time
      maxRetries: 3,
      ...config
    };

    console.log(`📅 Scheduler initialized: ${this.config.cronExpression} (${this.config.timezone})`);
  }

  /**
   * Start the scheduled news fetching (8am LA time daily)
   */
  start(): void {
    if (this.currentJob) {
      console.log('⚠️ Scheduler already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('📅 Scheduler disabled via config');
      return;
    }

    console.log(`🚀 Starting scheduler: ${this.config.cronExpression} in ${this.config.timezone}`);

    this.currentJob = cron.schedule(
      this.config.cronExpression,
      async () => {
        if (this.isRunning) {
          console.log('⚠️ Previous job still running, skipping...');
          return;
        }

        console.log('🗞️ Scheduled news fetch triggered at', new Date().toLocaleString('en-US', {
          timeZone: this.config.timezone
        }));

        await this.executeScheduledFetch();
      },
      {
        scheduled: true,
        timezone: this.config.timezone
      }
    );

    console.log('✅ Scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.currentJob) {
      this.currentJob.stop();
      this.currentJob = undefined;
      console.log('🛑 Scheduler stopped');
    }
  }

  /**
   * Execute the scheduled news fetch (Phase 1 & 2 only)
   */
  private async executeScheduledFetch(): Promise<ScheduledJobResult> {
    const startTime = Date.now();
    const timestamp = this.getToday8amLATimestamp();
    
    this.isRunning = true;

    try {
      console.log(`📡 Starting scheduled fetch for timestamp: ${timestamp}`);

      // Phase 1: Fetch news from APIs (50 latest articles from 6-hour window)
      const rawData = await this.newsApi.fetchDailyNews();

      if (rawData.apiResponse.status !== 'ok') {
        throw new Error(`News API fetch failed: ${rawData.apiResponse.message}`);
      }

      // Phase 2: Store raw data in S3
      await this.storage.storeRawData(timestamp, rawData);

      const result: ScheduledJobResult = {
        success: true,
        timestamp,
        duration: Date.now() - startTime,
        articlesProcessed: rawData.apiResponse.articles.length,
        nextRun: this.getNextRunDate()
      };

      this.lastResult = result;
      console.log(`✅ Scheduled fetch completed successfully (${result.duration}ms, ${result.articlesProcessed} articles)`);

      // Optional: Send success notification
      if (this.config.notificationWebhook) {
        await this.sendNotification(result);
      }

      return result;

    } catch (error) {
      const result: ScheduledJobResult = {
        success: false,
        timestamp,
        duration: Date.now() - startTime,
        articlesProcessed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        nextRun: this.getNextRunDate()
      };

      this.lastResult = result;
      console.error(`❌ Scheduled fetch failed (${result.duration}ms):`, error);

      // Optional: Send failure notification
      if (this.config.notificationWebhook) {
        await this.sendNotification(result);
      }

      return result;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get the next scheduled run date
   */
  private getNextRunDate(): Date {
    if (!this.currentJob) {
      return new Date();
    }

    // Calculate next 8am LA time
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);

    // Convert to LA timezone
    const laTime = new Date(tomorrow.toLocaleString('en-US', {
      timeZone: this.config.timezone
    }));

    return laTime;
  }

  /**
   * Get today's 8am LA timestamp (matches NewsAPI service)
   */
  private getToday8amLATimestamp(): number {
    const now = new Date();
    const la8am = new Date(now);
    la8am.setHours(8, 0, 0, 0);

    // Handle Pacific Time (PST/PDT)
    const month = now.getMonth() + 1;
    const isDST = month >= 3 && month <= 11;
    const offset = isDST ? 7 : 8; // UTC-7 or UTC-8
    const utc8am = new Date(la8am.getTime() + (offset * 60 * 60 * 1000));

    return utc8am.getTime();
  }

  /**
   * Send notification webhook (optional)
   */
  private async sendNotification(result: ScheduledJobResult): Promise<void> {
    if (!this.config.notificationWebhook) return;

    try {
      const payload = {
        success: result.success,
        timestamp: result.timestamp,
        articlesProcessed: result.articlesProcessed,
        duration: `${result.duration}ms`,
        nextRun: result.nextRun?.toISOString(),
        errors: result.errors,
        service: 'NewsLaw-Scheduler',
        phase: 'Phase 1 & 2 (Fetch + Store)'
      };

      const response = await fetch(this.config.notificationWebhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`);
      }

      console.log('✅ Notification sent successfully');

    } catch (error) {
      console.error('❌ Failed to send notification:', error);
    }
  }

  /**
   * Trigger manual fetch (for testing)
   */
  async triggerManualFetch(): Promise<ScheduledJobResult> {
    if (this.isRunning) {
      throw new Error('A scheduled job is currently running');
    }

    console.log('🔧 Manual fetch triggered');
    return await this.executeScheduledFetch();
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    isScheduled: boolean;
    nextRun?: Date;
    lastResult?: ScheduledJobResult;
    config: SchedulerConfig;
  } {
    return {
      isRunning: this.isRunning,
      isScheduled: !!this.currentJob,
      nextRun: this.getNextRunDate(),
      lastResult: this.lastResult,
      config: this.config
    };
  }

  /**
   * Update scheduler configuration
   */
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    const wasRunning = !!this.currentJob;
    
    // Stop current scheduler
    if (wasRunning) {
      this.stop();
    }

    // Update config
    this.config = { ...this.config, ...newConfig };
    
    // Restart if it was running
    if (wasRunning && this.config.enabled) {
      this.start();
    }

    console.log('🔄 Scheduler configuration updated');
  }
}