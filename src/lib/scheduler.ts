import * as cron from 'node-cron';
import { NewsAPIService } from './newsapi';
import { NewsStorageService, type SummaryNewsFile, type ScoredArticle } from './s3storage';
import { ScoringService, type ArticleInput } from './scoring';

export interface SchedulerConfig {
  timezone: string;
  enabled: boolean;
  cronExpression: string;
  maxRetries: number;
  notificationWebhook?: string;
}

export interface ScheduledJobResult {
  success: boolean;
  timestamp: number;
  duration: number;
  articlesProcessed: number;
  articlesScored: number;
  skippedRaw: boolean;
  skippedSummary: boolean;
  errors?: string[];
  nextRun?: Date;
}

export class NewsScheduler {
  private newsApi: NewsAPIService;
  private storage: NewsStorageService;
  private scoring: ScoringService;
  private config: SchedulerConfig;
  private currentJob?: cron.ScheduledTask;
  private isRunning = false;
  private lastResult?: ScheduledJobResult;

  constructor(config?: Partial<SchedulerConfig>) {
    this.newsApi = new NewsAPIService();
    this.storage = new NewsStorageService();
    this.scoring = new ScoringService();

    this.config = {
      timezone: 'America/Los_Angeles',
      enabled: process.env.PIPELINE_ENABLED === 'true',
      cronExpression: '0 8 * * *',
      maxRetries: 3,
      ...config,
    };

    console.log(`📅 Scheduler initialized: ${this.config.cronExpression} (${this.config.timezone})`);
  }

  start(): void {
    if (this.currentJob) {
      console.log('⚠️ Scheduler already running');
      return;
    }
    if (!this.config.enabled) {
      console.log('📅 Scheduler disabled via config');
      return;
    }

    this.currentJob = cron.schedule(
      this.config.cronExpression,
      async () => {
        if (this.isRunning) {
          console.log('⚠️ Previous job still running, skipping...');
          return;
        }
        console.log('🗞️ Scheduled fetch triggered at', new Date().toLocaleString('en-US', { timeZone: this.config.timezone }));
        await this.executeScheduledFetch();
      },
      { scheduled: true, timezone: this.config.timezone }
    );

    console.log('✅ Scheduler started');
  }

  stop(): void {
    if (this.currentJob) {
      this.currentJob.stop();
      this.currentJob = undefined;
      console.log('🛑 Scheduler stopped');
    }
  }

  async triggerManualFetch(): Promise<ScheduledJobResult> {
    if (this.isRunning) throw new Error('A job is currently running');
    console.log('🔧 Manual fetch triggered');
    return this.executeScheduledFetch();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: !!this.currentJob,
      nextRun: this.getNextRunDate(),
      lastResult: this.lastResult,
      config: this.config,
    };
  }

  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    const wasRunning = !!this.currentJob;
    if (wasRunning) this.stop();
    this.config = { ...this.config, ...newConfig };
    if (wasRunning && this.config.enabled) this.start();
    console.log('🔄 Scheduler config updated');
  }

  // ─── Core Pipeline ───────────────────────────────────────────────────────────

  private async executeScheduledFetch(): Promise<ScheduledJobResult> {
    const startTime = Date.now();
    const timestamp = this.newsApi.getToday8amLATimestamp();
    this.isRunning = true;

    let skippedRaw = false;
    let skippedSummary = false;
    let articlesProcessed = 0;
    let articlesScored = 0;

    try {
      // ── Step 0: Check what already exists ────────────────────────────────────
      const existing = await this.storage.checkDayExists(timestamp);
      console.log(`🔍 Existing data for ${timestamp}: raw=${existing.hasRaw}, summary=${existing.hasSummary}`);

      if (existing.hasRaw && existing.hasSummary) {
        console.log('✅ Both raw and summary already exist for today — skipping all steps');
        skippedRaw = true;
        skippedSummary = true;
        const summary = await this.storage.getSummaryData(timestamp);
        articlesProcessed = summary.totalArticlesInRaw;
        articlesScored = summary.totalArticlesScored;
      } else {
        // ── Step 1: Fetch + save raw.json ───────────────────────────────────────
        let rawData;
        if (existing.hasRaw) {
          console.log('⏭️  raw.json already exists — loading from S3');
          rawData = await this.storage.getRawData(timestamp);
          skippedRaw = true;
        } else {
          console.log('📡 Step 1: Fetching articles from NewsAPI...');
          rawData = await this.newsApi.fetchDailyNews();

          if (rawData.apiResponse.status !== 'ok') {
            throw new Error(`NewsAPI fetch failed: ${rawData.apiResponse.message}`);
          }

          await this.storage.storeRawData(timestamp, rawData);
          console.log(`✅ Step 1 done: ${rawData.apiResponse.articles.length} articles stored in raw.json`);
        }

        articlesProcessed = rawData.apiResponse.articles.length;

        // ── Step 2: Score + save summary.json ──────────────────────────────────
        if (existing.hasSummary) {
          console.log('⏭️  summary.json already exists — skipping scoring');
          skippedSummary = true;
          const summary = await this.storage.getSummaryData(timestamp);
          articlesScored = summary.totalArticlesScored;
        } else {
          console.log('🤖 Step 2: Scoring articles via OpenAI...');

          const articleInputs: ArticleInput[] = rawData.apiResponse.articles.map(a => ({
            id: a.articleId,
            title: a.title,
            description: a.description ?? '',
            content: a.content,
            publishedAt: a.publishedAt,
            source: a.source.name,
            // url intentionally omitted — not sent to OpenAI
          }));

          const scoringResult = await this.scoring.scoreDailyArticles(articleInputs);

          // Map scoring output → ScoredArticle (no URL)
          const scoredArticles: ScoredArticle[] = scoringResult.allScores.map(s => ({
            articleId: s.id,
            title: s.title,
            description: rawData.apiResponse.articles.find(a => a.articleId === s.id)?.description ?? '',
            source: rawData.apiResponse.articles.find(a => a.articleId === s.id)?.source.name ?? '',
            publishedAt: rawData.apiResponse.articles.find(a => a.articleId === s.id)?.publishedAt ?? '',
            scores: s.scores,
            total: s.total,
            reasoning: s.reasoning,
            tags: s.tags,
          }));

          // Sort by total score descending
          scoredArticles.sort((a, b) => b.total - a.total);

          const summaryFile: SummaryNewsFile = {
            scanTime: rawData.scanTime,
            scanTimeMs: timestamp,
            generatedAt: new Date().toISOString(),
            model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
            totalArticlesInRaw: rawData.apiResponse.articles.length,
            totalArticlesScored: scoredArticles.length,
            articles: scoredArticles,
          };

          await this.storage.storeSummaryData(timestamp, summaryFile);
          articlesScored = scoredArticles.length;
          console.log(`✅ Step 2 done: ${articlesScored} articles scored and saved in summary.json`);
        }
      }

      const result: ScheduledJobResult = {
        success: true,
        timestamp,
        duration: Date.now() - startTime,
        articlesProcessed,
        articlesScored,
        skippedRaw,
        skippedSummary,
        nextRun: this.getNextRunDate(),
      };

      this.lastResult = result;
      console.log(`🎉 Pipeline complete (${result.duration}ms) — raw: ${skippedRaw ? 'skipped' : 'done'}, summary: ${skippedSummary ? 'skipped' : 'done'}`);

      if (this.config.notificationWebhook) await this.sendNotification(result);
      return result;

    } catch (error) {
      const result: ScheduledJobResult = {
        success: false,
        timestamp,
        duration: Date.now() - startTime,
        articlesProcessed,
        articlesScored,
        skippedRaw,
        skippedSummary,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        nextRun: this.getNextRunDate(),
      };

      this.lastResult = result;
      console.error(`❌ Pipeline failed (${result.duration}ms):`, error);

      if (this.config.notificationWebhook) await this.sendNotification(result);
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private getNextRunDate(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    return tomorrow;
  }

  private async sendNotification(result: ScheduledJobResult): Promise<void> {
    if (!this.config.notificationWebhook) return;
    try {
      await fetch(this.config.notificationWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result, service: 'NewsClaw-Scheduler' }),
      });
    } catch (error) {
      console.error('❌ Failed to send notification:', error);
    }
  }
}
