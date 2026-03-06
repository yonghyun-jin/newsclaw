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
  };
}

export class NewsAPIService {
  private apiKey: string;
  private baseUrl: string;
  
  // Target news sources (these are the actual NewsAPI source IDs)
  private readonly NEWS_SOURCES = [
    'associated-press',     // apnews.com
    'cbs-news',            // cbsnews.com  
    'abc-news',            // abc7.com (closest match)
    'fox-news',            // foxla.com (closest match)
    // Note: latimes.com, ktla.com, dailynews.com, aist.com may not have direct NewsAPI IDs
    // We'll use 'domains' parameter as fallback
  ];
  
  private readonly FALLBACK_DOMAINS = [
    'latimes.com',
    'ktla.com', 
    'dailynews.com',
    'nbclosangeles.com',
    'abc7.com',
    'foxla.com'
  ];

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
    
    console.log('🗞️ Starting daily news fetch...');
    
    try {
      // Get time range (last 24 hours)
      const timeRange = this.get24HourTimeRange();
      
      // First, try to get news from specific sources
      const sourceResults = await this.fetchFromSources(timeRange);
      
      // Then, get additional articles from domains to reach 100 total
      const domainResults = await this.fetchFromDomains(timeRange, sourceResults.articles.length);
      
      // Combine results
      const allArticles = [...sourceResults.articles, ...domainResults.articles];
      const totalResults = sourceResults.totalResults + domainResults.totalResults;
      
      // Limit to 100 articles max
      const limitedArticles = allArticles.slice(0, 100);
      
      const fetchDuration = Date.now() - startTime;
      
      console.log(`✅ Fetched ${limitedArticles.length} articles in ${fetchDuration}ms`);
      
      return {
        scanTime,
        scanTimeMs,
        apiResponse: {
          status: 'ok',
          totalResults: totalResults,
          articles: limitedArticles
        },
        metadata: {
          fetchDuration,
          sourcesQueried: [...this.NEWS_SOURCES, ...this.FALLBACK_DOMAINS],
          articlesPerSource: this.countArticlesBySource(limitedArticles),
          errors: []
        }
      };
      
    } catch (error) {
      const fetchDuration = Date.now() - startTime;
      console.error('❌ News fetch failed:', error);
      
      return {
        scanTime,
        scanTimeMs,
        apiResponse: {
          status: 'error',
          totalResults: 0,
          articles: [],
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: {
          fetchDuration,
          sourcesQueried: this.NEWS_SOURCES,
          articlesPerSource: {},
          errors: [error instanceof Error ? error.message : 'Unknown error']
        }
      };
    }
  }

  private async fetchFromSources(timeRange: { from: string; to: string }): Promise<NewsAPIResponse> {
    const url = `${this.baseUrl}/everything`;
    const params = {
      sources: this.NEWS_SOURCES.join(','),
      sortBy: 'publishedAt',
      pageSize: 50, // Get 50 from sources
      language: 'en',
      from: timeRange.from,
      to: timeRange.to,
      apiKey: this.apiKey
    };

    console.log('📡 Fetching from sources:', this.NEWS_SOURCES.join(', '));
    
    const response = await axios.get<NewsAPIResponse>(url, { 
      params,
      timeout: 30000 // 30 second timeout
    });

    return response.data;
  }

  private async fetchFromDomains(timeRange: { from: string; to: string }, existingCount: number): Promise<NewsAPIResponse> {
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

    console.log(`📡 Fetching ${remaining} more articles from domains:`, this.FALLBACK_DOMAINS.join(', '));
    
    const response = await axios.get<NewsAPIResponse>(url, { 
      params,
      timeout: 30000
    });

    return response.data;
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