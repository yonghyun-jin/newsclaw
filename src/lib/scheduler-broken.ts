// eslint-disable-next-line @typescript-eslint/no-require-imports
const cron = require('node-cron');
import { NewsAPIService } from './newsapi';
import { NewsStorageService } from './s3storage';
import { ScoringService } from './scoring';
import type { SummaryNewsFile, ScoredArticle } from './s3storage';
import type { ArticleInput } from './scoring';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentJob?: any;
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

    console.log(`Scheduler initialized: ${this.config.cronExpression} (${this.config.timezone})`);
  }

  start(): void {
    if (this.currentJob) { console.log('Scheduler already running'); return; }
    if (!this.config.enabled) { console.log('Scheduler disabled'); return; }

    this.currentJob = cron.schedule(
      this.config.cronExpression,
      async () => {
        if (this.isRunning) { console.log('Previous job still running, skipping'); return; }
        await this.executeScheduledFetch();
      },
      { timezone: this.config.timezone }
    );

    console.log('Scheduler started');
  }

  stop(): void {
    if (this.currentJob) { this.currentJob.stop(); this.currentJob = undefined; }
  }

  async triggerManualFetch(): Promise<ScheduledJobResult> {
    if (this.isRunning) throw new Error('A job is currently running');
    return this.executeScheduledFetch();
  }

  getStatus() {
    return { isRunning: this.isRunning, isScheduled: !!this.currentJob, nextRun: this.getNextRunDate(), lastResult: this.lastResult, config: this.config };
  }

  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    const wasRunning = !!this.currentJob;
    if (wasRunning) this.stop();
    this.config = { ...this.config, ...newConfig };
    if (wasRunning && this.config.enabled) this.start();
  }

  private async executeScheduledFetch(): Promise<ScheduledJobResult> {
    const startTime = Date.now();
    const timestamp = this.newsApi.getToday8amLATimestamp();
    this.isRunning = true;
    let skippedRaw = false, skippedSummary = false, articlesProcessed = 0, articlesScored = 0;

    try {
      const existing = await this.storage.checkDayExists(timestamp);

      if (existing.hasRaw && existing.hasSummary) {
        skippedRaw = true; skippedSummary = true;
        const summary = await this.storage.getSummaryData(timestamp);
        articlesProcessed = summary.totalArticlesInRaw;
        articlesScored = summary.totalArticlesScored;
      } else {
        let rawData;
        if (existing.hasRaw) {
          rawData = await this.storage.getRawData(timestamp);
          skippedRaw = true;
        } else {
          rawData = await this.newsApi.fetchDailyNews();
          if (rawData.apiResponse.status !== 'ok') throw new Error(`NewsAPI fetch failed: ${rawData.apiResponse.message}`);
          await this.storage.storeRawData(timestamp, rawData);
        }
        articlesProcessed = rawData.apiResponse.articles.length;

        if (existing.hasSummary) {
          skippedSummary = true;
          const summary = await this.storage.getSummaryData(timestamp);
          articlesScored = summary.totalArticlesScored;
        } else {
          const articleInputs: ArticleInput[] = rawData.apiResponse.articles.map(a => ({
            id: a.articleId, title: a.title, description: a.description ?? '',
            content: a.content, publishedAt: a.publishedAt, source: a.source.name,
          }));

          const scoringResult = await this.scoring.scoreDailyArticles(articleInputs);
          const rawLookup = new Map(rawData.apiResponse.articles.map(a => [a.articleId, a]));

          const scoredArticles: ScoredArticle[] = scoringResult.allScores.map(s => {
            const raw = rawLookup.get(s.id);
            return { articleId: s.id, title: s.title, description: raw?.description ?? '', source: raw?.source.name ?? '', publishedAt: raw?.publishedAt ?? '', scores: s.scores, total: s.total, reasoning: s.reasoning, tags: s.tags };
          });
          scoredArticles.sort((a, b) => b.total - a.total);

          const summaryFile: SummaryNewsFile = {
            scanTime: rawData.scanTime, scanTimeMs: timestamp,
            generatedAt: new Date().toISOString(),
            model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
            totalArticlesInRaw: rawData.apiResponse.articles.length,
            totalArticlesScored: scoredArticles.length, articles: scoredArticles,
          };

          await this.storage.storeSummaryData(timestamp, summaryFile);
          articlesScored = scoredArticles.length;
        }
      }

      const result: ScheduledJobResult = { success: true, timestamp, duration: Date.now() - startTime, articlesProcessed, articlesScored, skippedRaw, skippedSummary, nextRun: this.getNextRunDate() };
      this.lastResult = result;
      if (this.config.notificationWebhook) await this.sendNotification(result);
      return result;

    } catch (error) {
      const result: ScheduledJobResult = { success: false, timestamp, duration: Date.now() - startTime, articlesProcessed, articlesScored, skippedRaw, skippedSummary, errors: [error instanceof Error ? error.message : 'Unknown error'], nextRun: this.getNextRunDate() };
      this.lastResult = result;
      if (this.config.notificationWebhook) await this.sendNotification(result);
      return result;
    } finally {
      this.isRunning = false;
    }
  }

  private getNextRunDate(): Date {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d;
  }

  private async sendNotification(result: ScheduledJobResult): Promise<void> {
    if (!this.config.notificationWebhook) return;
    try {
      await fetch(this.config.notificationWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...result, service: 'NewsClaw-Scheduler' }) });
    } catch (e) { console.error('Failed to send notification:', e); }
  }
}
