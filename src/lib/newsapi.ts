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
    totalTimeouts?: number;
    successfulSources?: number;
  };
}

export class NewsAPIService {
  private apiKey: string;
  private baseUrl: string;
  
  // Target news sources - exactly 10 as specified in requirements
  private readonly NEWS_SOURCES = [
    'associated-press',     // apnews.com
    'cbs-news',            // cbsnews.com  
    'abc-news',            // abc7.com (closest match)
    'fox-news',            // foxla.com (closest match)
  ];
  
  // Fallback domains to reach our target 10 sources
  private readonly FALLBACK_DOMAINS = [
    'latimes.com',         // Los Angeles Times
    'ktla.com',           // KTLA
    'dailynews.com',      // Daily News  
    'nbclosangeles.com',  // NBC LA
    'abc7.com',           // ABC7
    'foxla.com'           // Fox LA
  ];

  // Retry configuration as per requirements
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 5000; // 5 seconds
  private readonly REQUEST_TIMEOUT_MS = 30000; // 30 seconds total as specified

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
    
    console.log('🗞️ Starting daily news fetch with retry logic...');
    console.log(`📅 Target: 100 articles from 10 sources within ${this.REQUEST_TIMEOUT_MS}ms`);
    
    const errors: string[] = [];
    
    // Retry logic as specified in requirements (3 attempts)
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${this.MAX_RETRIES}`);
        
        // Check timeout
        const elapsed = Date.now() - startTime;
        if (elapsed > this.REQUEST_TIMEOUT_MS) {
          throw new Error(`Timeout: Operation exceeded ${this.REQUEST_TIMEOUT_MS}ms limit`);
        }
        
        // Get time range (last 24 hours as specified)
        const timeRange = this.get24HourTimeRange();
        
        // Fetch from sources with 10 articles per source target
        const sourceResults = await this.fetchFromSourcesWithRetry(timeRange, attempt);
        
        // Fetch additional articles from domains to reach exactly 100
        const domainResults = await this.fetchFromDomainsWithRetry(
          timeRange, 
          sourceResults.articles.length, 
          attempt
        );
        
        // Combine and limit to exactly 100 articles as specified
        const allArticles = [...sourceResults.articles, ...domainResults.articles];
        const limitedArticles = allArticles.slice(0, 100);
        
        const fetchDuration = Date.now() - startTime;
        
        console.log(`✅ Success on attempt ${attempt}: ${limitedArticles.length} articles in ${fetchDuration}ms`);
        
        return {
          scanTime,
          scanTimeMs,
          apiResponse: {
            status: 'ok',
            totalResults: sourceResults.totalResults + domainResults.totalResults,
            articles: limitedArticles
          },
          metadata: {
            fetchDuration,
            sourcesQueried: [...this.NEWS_SOURCES, ...this.FALLBACK_DOMAINS],
            articlesPerSource: this.countArticlesBySource(limitedArticles),
            errors,
            attempt,
            rateLimitHit: false
          }
        };
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Attempt ${attempt}: ${errorMsg}`);
        
        console.warn(`⚠️ Attempt ${attempt} failed: ${errorMsg}`);
        
        // Check if it's a rate limit error
        if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
          console.log(`🚫 Rate limit detected. Waiting ${this.RETRY_DELAY_MS}ms before retry...`);
          await this.sleep(this.RETRY_DELAY_MS);
        } else if (attempt < this.MAX_RETRIES) {
          console.log(`⏳ Waiting ${this.RETRY_DELAY_MS / 1000}s before retry...`);
          await this.sleep(this.RETRY_DELAY_MS);
        }
      }
    }
    
    // All attempts failed
    const fetchDuration = Date.now() - startTime;
    console.error('❌ All fetch attempts failed');
    
    return {
      scanTime,
      scanTimeMs,
      apiResponse: {
        status: 'error',
        totalResults: 0,
        articles: [],
        message: 'All retry attempts failed'
      },
      metadata: {
        fetchDuration,
        sourcesQueried: [...this.NEWS_SOURCES, ...this.FALLBACK_DOMAINS],
        articlesPerSource: {},
        errors,
        attempt: this.MAX_RETRIES,
        rateLimitHit: errors.some(e => e.includes('429') || e.includes('rate limit'))
      }
    };
  }

  private async fetchFromSourcesWithRetry(timeRange: { from: string; to: string }, attempt: number): Promise<NewsAPIResponse> {
    const url = `${this.baseUrl}/everything`;
    const params = {
      sources: this.NEWS_SOURCES.join(','),
      sortBy: 'publishedAt',
      pageSize: 40, // 10 articles per source × 4 sources = 40
      language: 'en',
      from: timeRange.from,
      to: timeRange.to,
      apiKey: this.apiKey
    };

    console.log(`📡 Attempt ${attempt}: Fetching from NewsAPI sources:`, this.NEWS_SOURCES.join(', '));
    
    const response = await axios.get<NewsAPIResponse>(url, { 
      params,
      timeout: this.REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': 'NewsLaw-Fetcher/1.0'
      }
    });

    // Handle rate limiting
    if (response.status === 429) {
      throw new Error('Rate limit exceeded (429)');
    }

    console.log(`✅ Sources fetch: ${response.data.articles?.length || 0} articles`);
    return response.data;
  }

  private async fetchFromDomainsWithRetry(timeRange: { from: string; to: string }, existingCount: number, attempt: number): Promise<NewsAPIResponse> {
    const remaining = Math.max(0, 100 - existingCount);
    if (remaining === 0) {
      return { status: 'ok', totalResults: 0, articles: [] };
    }

    const url = `${this.baseUrl}/everything`;
    const params = {
      domains: this.FALLBACK_DOMAINS.join(','),
      sortBy: 'publishedAt',
      pageSize: remaining,
      language: 'en',
      from: timeRange.from,
      to: timeRange.to,
      apiKey: this.apiKey
    };

    console.log(`📡 Attempt ${attempt}: Fetching ${remaining} more from domains:`, this.FALLBACK_DOMAINS.join(', '));
    
    const response = await axios.get<NewsAPIResponse>(url, { 
      params,
      timeout: this.REQUEST_TIMEOUT_MS,
      headers: {
        'User-Agent': 'NewsLaw-Fetcher/1.0'
      }
    });

    // Handle rate limiting
    if (response.status === 429) {
      throw new Error('Rate limit exceeded (429)');
    }

    console.log(`✅ Domains fetch: ${response.data.articles?.length || 0} articles`);
    return response.data;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private get24HourTimeRange(): { from: string; to: string } {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    return {
      from: yesterday.toISOString(),
      to: now.toISOString()
    };
  }

  private getToday8amLATimestamp(): number {
    const now = new Date();
    const la8am = new Date(now);
    la8am.setHours(8, 0, 0, 0);
    
    // Handle Pacific Time (PST/PDT)
    const offset = this.isLosAngelesDST(now) ? 7 : 8; // UTC-7 or UTC-8
    const utc8am = new Date(la8am.getTime() + (offset * 60 * 60 * 1000));
    
    return utc8am.getTime();
  }

  private isLosAngelesDST(date: Date): boolean {
    // Simple DST check for Los Angeles (March to November)
    const month = date.getMonth() + 1; // 1-12
    return month >= 3 && month <= 11;
  }

  private countArticlesBySource(articles: NewsAPIArticle[]): Record<string, number> {
    const counts: Record<string, number> = {};
    
    articles.forEach(article => {
      const sourceName = article.source.name || article.source.id || 'unknown';
      counts[sourceName] = (counts[sourceName] || 0) + 1;
    });
    
    return counts;
  }

  // Manual fetch method for testing
  async fetchNewsManual(sources?: string[], pageSize: number = 20): Promise<NewsAPIResponse> {
    const url = `${this.baseUrl}/everything`;
    const timeRange = this.get24HourTimeRange();
    
    const params = {
      sources: sources?.join(',') || this.NEWS_SOURCES.join(','),
      sortBy: 'publishedAt',
      pageSize,
      language: 'en',
      from: timeRange.from,
      to: timeRange.to,
      apiKey: this.apiKey
    };

    const response = await axios.get<NewsAPIResponse>(url, { params, timeout: 30000 });
    return response.data;
  }
}