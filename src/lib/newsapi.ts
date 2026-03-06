import axios from 'axios';

// NewsAPI interfaces
export interface NewsAPIArticle {
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
    strategy?: string;          // 'latest-6-hours'
    timeWindow?: string;        // '6-hours' 
    targetArticles?: number;    // 50
  };
}

export class NewsAPIService {
  private apiKey: string;
  private baseUrl: string;

  // NewsAPI source IDs that work on the free plan with /top-headlines
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

    console.log('🗞️ Starting OPTIMIZED daily news fetch (50 articles max)...');
    console.log('⏰ Target: Last 6 hours of articles (2am-8am LA time)');

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${this.MAX_RETRIES}`);

        // SINGLE STRATEGY: Get 50 LATEST articles from last 6 hours
        const latestResults = await this.fetchLatestArticles(50);
        console.log(`📰 Latest articles returned: ${latestResults.articles.length} from last 6 hours`);

        const fetchDuration = Date.now() - startTime;
        console.log(`✅ Success on attempt ${attempt}: ${latestResults.articles.length} articles in ${fetchDuration}ms`);

        return {
          scanTime,
          scanTimeMs,
          apiResponse: {
            status: 'ok',
            totalResults: latestResults.totalResults,
            articles: latestResults.articles
          },
          metadata: {
            fetchDuration,
            sourcesQueried: this.TOP_HEADLINE_SOURCES,
            articlesPerSource: this.countArticlesBySource(latestResults.articles),
            errors,
            attempt,
            rateLimitHit: false,
            strategy: 'latest-6-hours',
            timeWindow: '6-hours',
            targetArticles: 50
          }
        };

        // Merge, deduplicate by URL, cap at 100
        const merged = deduplicateByUrl([
          ...headlineResults.articles,
          ...everythingResults.articles,
        ]).slice(0, 100);

        const fetchDuration = Date.now() - startTime;
        console.log(`✅ Attempt ${attempt} success: ${merged.length} articles in ${fetchDuration}ms`);

        return {
          scanTime,
          scanTimeMs,
          apiResponse: {
            status: 'ok',
            totalResults: merged.length,
            articles: merged,
          },
          metadata: {
            fetchDuration,
            sourcesQueried: this.TOP_HEADLINE_SOURCES,
            articlesPerSource: this.countArticlesBySource(merged),
            errors,
            attempt,
            rateLimitHit: false,
            debug: {
              topHeadlinesCount: headlineResults.articles.length,
              everythingCount: everythingResults.articles.length,
              plan: 'developer',
            },
          },
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Attempt ${attempt}: ${msg}`);
        console.warn(`⚠️ Attempt ${attempt} failed: ${msg}`);

        if (attempt < this.MAX_RETRIES) {
          await this.sleep(this.RETRY_DELAY_MS);
        }
      }
    }

    const fetchDuration = Date.now() - startTime;
    console.error('❌ All fetch attempts failed. Errors:', errors);

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
   * OPTIMIZED: Fetch the 50 LATEST articles from last 6 hours
   * Perfect for daily 8am runs - gets 2am-8am LA time articles
   */
  private async fetchLatestArticles(targetCount: number): Promise<NewsAPIResponse> {
    const url = `${this.baseUrl}/everything`;
    
    // Get articles from last 6 hours (2am-8am if run at 8am)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    
    const params = {
      sources: this.TOP_HEADLINE_SOURCES.join(','),
      sortBy: 'publishedAt',        // 👈 LATEST first
      pageSize: targetCount,        // 👈 Exactly 50 articles
      language: 'en',
      from: sixHoursAgo,           // 👈 Last 6 hours only
      apiKey: this.apiKey
    };

    console.log('📡 Fetching LATEST articles from:', this.TOP_HEADLINE_SOURCES.join(', '));
    console.log('⏰ Time window:', sixHoursAgo, '→', new Date().toISOString());
    console.log('🎯 Target articles:', targetCount);

    const response = await axios.get<NewsAPIResponse>(url, {
      params,
      timeout: this.REQUEST_TIMEOUT_MS,
    });

    if (response.data.status === 'error') {
      throw new Error(`NewsAPI error: ${response.data.code} — ${response.data.message}`);
    }

    // Sort articles by publishedAt descending to ensure we get the absolute latest
    const sortedArticles = response.data.articles.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    console.log(`📊 Received ${response.data.articles.length} articles, returning ${Math.min(targetCount, sortedArticles.length)} latest`);
    
    return {
      ...response.data,
      articles: sortedArticles.slice(0, targetCount) // Take only the latest N articles
    };
  }

  // Removed old fetchEverything method - now using fetchLatestArticles only

  /**
   * Manual fetch for testing — uses same 6-hour latest strategy
   */
  async fetchNewsManual(sources?: string[], pageSize = 10): Promise<NewsAPIResponse> {
    console.log('🔧 Manual fetch using 6-hour strategy...');
    
    const url = `${this.baseUrl}/everything`;
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    
    const params = {
      sources: (sources ?? this.TOP_HEADLINE_SOURCES).join(','),
      sortBy: 'publishedAt',       // Latest first
      pageSize,
      language: 'en',
      from: sixHoursAgo,          // Last 6 hours
      apiKey: this.apiKey
    };

    console.log(`📡 Manual query: ${pageSize} articles from last 6 hours`);
    console.log(`⏰ Time window: ${sixHoursAgo} → ${new Date().toISOString()}`);

    const response = await axios.get<NewsAPIResponse>(url, { params, timeout: this.REQUEST_TIMEOUT_MS });

    if (response.data.status === 'error') {
      throw new Error(`NewsAPI error: ${response.data.code} — ${response.data.message}`);
    }

    return response.data;
  }

  private getToday8amLATimestamp(): number {
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

function deduplicateByUrl(articles: NewsAPIArticle[]): NewsAPIArticle[] {
  const seen = new Set<string>();
  return articles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}
