import axios from 'axios';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface NewsAPIArticle {
  articleId: string; // index string — used to cross-reference summary.json
  title: string;
  description: string;
  url: string;
  urlToImage: string;
  publishedAt: string;
  source: {
    id: string;
    name: string;
  };
  content: string;
}

export interface NewsAPIResponse {
  status: 'ok' | 'error';
  totalResults: number;
  articles: NewsAPIArticle[];
  code?: string;
  message?: string;
}

export interface RawNewsFile {
  scanTime: string;
  scanTimeMs: number;
  apiResponse: NewsAPIResponse;
  metadata: {
    fetchDuration: number;
    sourcesQueried: string[];
    articlesPerSource: Record<string, number>;
    errors?: string[];
    attempt?: number;
    rateLimitHit?: boolean;
    strategy?: string;
    timeWindow?: string;
    targetArticles?: number;
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class NewsAPIService {
  private apiKey: string;
  private baseUrl: string;

  private readonly TOP_HEADLINE_SOURCES = [
    'associated-press',
    'cbs-news',
    'abc-news',
    'fox-news',
    'nbc-news',
    'the-washington-post',
    'the-new-york-times',
    'reuters',
    'cnn',
    'bbc-news',
  ];

  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 5000;
  private readonly REQUEST_TIMEOUT_MS = 30000;

  constructor() {
    this.apiKey = process.env.NEWS_API_KEY || '';
    this.baseUrl = process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2';

    if (!this.apiKey) {
      throw new Error('NEWS_API_KEY environment variable is required');
    }
  }

  async fetchDailyNews(): Promise<RawNewsFile> {
    const startTime = Date.now();
    const scanTime = new Date().toISOString();
    const scanTimeMs = this.getToday8amLATimestamp();
    const errors: string[] = [];

    console.log('🗞️ Starting daily news fetch (50 articles, last 6h)...');

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${this.MAX_RETRIES}`);

        const result = await this.fetchLatestArticles(50);
        console.log(`📰 Fetched ${result.articles.length} articles`);

        const fetchDuration = Date.now() - startTime;

        return {
          scanTime,
          scanTimeMs,
          apiResponse: {
            status: 'ok',
            totalResults: result.totalResults,
            articles: result.articles,
          },
          metadata: {
            fetchDuration,
            sourcesQueried: this.TOP_HEADLINE_SOURCES,
            articlesPerSource: this.countArticlesBySource(result.articles),
            errors,
            attempt,
            rateLimitHit: false,
            strategy: 'latest-6-hours',
            timeWindow: '6h',
            targetArticles: 50,
          },
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Attempt ${attempt}: ${msg}`);
        console.warn(`⚠️ Attempt ${attempt} failed: ${msg}`);
        if (attempt < this.MAX_RETRIES) await this.sleep(this.RETRY_DELAY_MS);
      }
    }

    const fetchDuration = Date.now() - startTime;
    console.error('❌ All fetch attempts failed:', errors);

    return {
      scanTime,
      scanTimeMs,
      apiResponse: { status: 'error', totalResults: 0, articles: [], message: errors.join(' | ') },
      metadata: {
        fetchDuration,
        sourcesQueried: this.TOP_HEADLINE_SOURCES,
        articlesPerSource: {},
        errors,
        attempt: this.MAX_RETRIES,
        rateLimitHit: errors.some(e => e.includes('429')),
      },
    };
  }

  /**
   * Fetch the 50 latest articles from the past 6 hours.
   * Assigns articleId as a string index for cross-referencing with summary.json.
   */
  private async fetchLatestArticles(targetCount: number): Promise<NewsAPIResponse> {
    const from = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const params = {
      sources: this.TOP_HEADLINE_SOURCES.join(','),
      sortBy: 'publishedAt',
      pageSize: targetCount,
      language: 'en',
      from,
      apiKey: this.apiKey,
    };

    console.log(`📡 Fetching /everything | from: ${from}`);

    const response = await axios.get<NewsAPIResponse>(`${this.baseUrl}/everything`, {
      params,
      timeout: this.REQUEST_TIMEOUT_MS,
    });

    if (response.data.status === 'error') {
      throw new Error(`NewsAPI error: ${response.data.code} — ${response.data.message}`);
    }

    // Sort latest first, assign articleId as stable index string
    const sorted = response.data.articles
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, targetCount)
      .map((article, i) => ({ ...article, articleId: String(i) }));

    console.log(`📊 Returning ${sorted.length} articles`);
    return { ...response.data, articles: sorted };
  }

  /**
   * Manual fetch for testing — /top-headlines, assigns articleId.
   */
  async fetchNewsManual(sources?: string[], pageSize = 20): Promise<NewsAPIResponse> {
    const params = {
      sources: (sources ?? this.TOP_HEADLINE_SOURCES).join(','),
      pageSize,
      apiKey: this.apiKey,
    };

    console.log('🔧 Manual fetch via /top-headlines, pageSize:', pageSize);

    const response = await axios.get<NewsAPIResponse>(`${this.baseUrl}/top-headlines`, {
      params,
      timeout: this.REQUEST_TIMEOUT_MS,
    });

    if (response.data.status === 'error') {
      throw new Error(`NewsAPI error: ${response.data.code} — ${response.data.message}`);
    }

    return {
      ...response.data,
      articles: response.data.articles.map((a, i) => ({ ...a, articleId: String(i) })),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  getToday8amLATimestamp(): number {
    const now = new Date();
    const la8am = new Date(now);
    la8am.setHours(8, 0, 0, 0);
    const offset = this.isLosAngelesDST(now) ? 7 : 8;
    return new Date(la8am.getTime() + offset * 60 * 60 * 1000).getTime();
  }

  private isLosAngelesDST(date: Date): boolean {
    const month = date.getMonth() + 1;
    return month >= 3 && month <= 11;
  }

  private countArticlesBySource(articles: NewsAPIArticle[]): Record<string, number> {
    const counts: Record<string, number> = {};
    articles.forEach(a => {
      const name = a.source.name || a.source.id || 'unknown';
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
