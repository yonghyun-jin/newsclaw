import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { RawNewsFile } from './newsapi';

// Storage interfaces
export interface ScoredArticle {
  title: string;
  description: string;
  url: string;
  publisher: string;
  publishedAt: string;
  topic?: string;
  score: number;
  scoreBreakdown: {
    koreanRelevance: number;
    timeliness: number;
    audienceAppeal: number;
  };
}

export interface SummaryNewsFile {
  scanTime: string;
  scanTimeMs: number;
  articles: ScoredArticle[];
  statistics: {
    totalScored: number;
    averageScore: number;
    topScore: number;
    sourceBreakdown: Record<string, number>;
    topicBreakdown?: Record<string, number>;
  };
}

export interface StorageMetadata {
  timestamp: number;
  date: string;
  hasRaw: boolean;
  hasSummary: boolean;
  articleCount?: number;
}

export class NewsStorageService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    // Initialize S3 client with Supabase credentials
    this.s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true, // Required for Supabase S3
    });

    this.bucketName = process.env.S3_BUCKET_NAME || 'news-ranking-bucket';

    // Validate required environment variables
    if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
      throw new Error('Missing required S3 configuration environment variables');
    }
  }

  /**
   * Store raw NewsAPI data
   */
  async storeRawData(timestamp: number, rawData: RawNewsFile): Promise<void> {
    const key = `${timestamp}/raw.json`;
    
    console.log(`📦 Storing raw data: ${key}`);
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(rawData, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'scan-time': rawData.scanTime,
        'article-count': rawData.apiResponse.articles.length.toString(),
        'fetch-status': rawData.apiResponse.status
      }
    });

    try {
      await this.s3Client.send(command);
      console.log(`✅ Raw data stored successfully: ${key}`);
    } catch (error) {
      console.error(`❌ Failed to store raw data: ${key}`, error);
      throw new Error(`Failed to store raw data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store processed/scored articles summary
   */
  async storeSummaryData(timestamp: number, scoredArticles: ScoredArticle[]): Promise<void> {
    const key = `${timestamp}/summary.json`;
    
    const summaryFile: SummaryNewsFile = {
      scanTime: new Date(timestamp).toISOString(),
      scanTimeMs: timestamp,
      articles: scoredArticles,
      statistics: this.calculateStatistics(scoredArticles)
    };
    
    console.log(`📦 Storing summary data: ${key} (${scoredArticles.length} articles)`);
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(summaryFile, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'scan-time': summaryFile.scanTime,
        'article-count': scoredArticles.length.toString(),
        'average-score': summaryFile.statistics.averageScore.toString(),
        'top-score': summaryFile.statistics.topScore.toString()
      }
    });

    try {
      await this.s3Client.send(command);
      console.log(`✅ Summary data stored successfully: ${key}`);
    } catch (error) {
      console.error(`❌ Failed to store summary data: ${key}`, error);
      throw new Error(`Failed to store summary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve raw news data by timestamp
   */
  async getRawData(timestamp: number): Promise<RawNewsFile> {
    const key = `${timestamp}/raw.json`;
    
    console.log(`📥 Retrieving raw data: ${key}`);
    
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const response = await this.s3Client.send(command);
      const body = await response.Body?.transformToString();
      
      if (!body) {
        throw new Error('Empty response body');
      }
      
      const data = JSON.parse(body) as RawNewsFile;
      console.log(`✅ Raw data retrieved: ${key} (${data.apiResponse.articles.length} articles)`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to retrieve raw data: ${key}`, error);
      throw new Error(`Failed to retrieve raw data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve summary news data by timestamp
   */
  async getSummaryData(timestamp: number): Promise<SummaryNewsFile> {
    const key = `${timestamp}/summary.json`;
    
    console.log(`📥 Retrieving summary data: ${key}`);
    
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const response = await this.s3Client.send(command);
      const body = await response.Body?.transformToString();
      
      if (!body) {
        throw new Error('Empty response body');
      }
      
      const data = JSON.parse(body) as SummaryNewsFile;
      console.log(`✅ Summary data retrieved: ${key} (${data.articles.length} articles)`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to retrieve summary data: ${key}`, error);
      throw new Error(`Failed to retrieve summary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all available dates (timestamps)
   */
  async listAvailableDates(): Promise<StorageMetadata[]> {
    console.log('📋 Listing available news dates...');
    
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Delimiter: '/'
    });

    try {
      const response = await this.s3Client.send(command);
      const folders = response.CommonPrefixes || [];
      
      const metadataPromises = folders.map(async (folder) => {
        const timestamp = parseInt(folder.Prefix!.replace('/', ''));
        if (isNaN(timestamp)) return null;
        
        // Check what files exist in this folder
        const folderContents = await this.listFolderContents(timestamp);
        
        return {
          timestamp,
          date: new Date(timestamp).toISOString().split('T')[0],
          hasRaw: folderContents.hasRaw,
          hasSummary: folderContents.hasSummary,
          articleCount: folderContents.articleCount
        };
      });
      
      const metadata = (await Promise.all(metadataPromises))
        .filter((item): item is StorageMetadata => item !== null)
        .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
      
      console.log(`✅ Found ${metadata.length} news dates`);
      return metadata;
    } catch (error) {
      console.error('❌ Failed to list available dates', error);
      throw new Error(`Failed to list available dates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check contents of a specific timestamp folder
   */
  private async listFolderContents(timestamp: number): Promise<{ hasRaw: boolean; hasSummary: boolean; articleCount?: number }> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: `${timestamp}/`
    });

    try {
      const response = await this.s3Client.send(command);
      const objects = response.Contents || [];
      
      const hasRaw = objects.some(obj => obj.Key?.endsWith('/raw.json'));
      const hasSummary = objects.some(obj => obj.Key?.endsWith('/summary.json'));
      
      // Try to get article count from metadata if available
      let articleCount: number | undefined;
      const rawObject = objects.find(obj => obj.Key?.endsWith('/raw.json'));
      if (rawObject) {
        // Could fetch metadata or content to get article count, but for now just indicate it exists
        articleCount = undefined;
      }
      
      return { hasRaw, hasSummary, articleCount };
    } catch (error) {
      console.warn(`Warning: Could not check folder contents for ${timestamp}`, error);
      return { hasRaw: false, hasSummary: false };
    }
  }

  /**
   * Calculate statistics for scored articles
   */
  private calculateStatistics(articles: ScoredArticle[]): SummaryNewsFile['statistics'] {
    if (articles.length === 0) {
      return {
        totalScored: 0,
        averageScore: 0,
        topScore: 0,
        sourceBreakdown: {}
      };
    }

    const scores = articles.map(a => a.score);
    const totalScored = articles.length;
    const averageScore = Math.round((scores.reduce((sum, score) => sum + score, 0) / totalScored) * 10) / 10;
    const topScore = Math.max(...scores);
    
    // Count by publisher
    const sourceBreakdown: Record<string, number> = {};
    articles.forEach(article => {
      sourceBreakdown[article.publisher] = (sourceBreakdown[article.publisher] || 0) + 1;
    });

    // Count by topic if available
    const topicBreakdown: Record<string, number> = {};
    articles.forEach(article => {
      if (article.topic) {
        topicBreakdown[article.topic] = (topicBreakdown[article.topic] || 0) + 1;
      }
    });

    return {
      totalScored,
      averageScore,
      topScore,
      sourceBreakdown,
      ...(Object.keys(topicBreakdown).length > 0 && { topicBreakdown })
    };
  }

  /**
   * Delete data for a specific timestamp (cleanup utility)
   */
  async deleteTimeseriesData(timestamp: number): Promise<void> {
    const keys = [`${timestamp}/raw.json`, `${timestamp}/summary.json`];
    
    console.log(`🗑️ Deleting data for timestamp: ${timestamp}`);
    
    for (const key of keys) {
      try {
        // Note: DeleteObjectCommand not implemented here to keep it simple
        // Would need to import and use DeleteObjectCommand for cleanup
        console.log(`Would delete: ${key}`);
      } catch (error) {
        console.warn(`Warning: Could not delete ${key}`, error);
      }
    }
  }

  /**
   * Test S3 connection
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🔗 Testing S3 connection...');
      
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1
      });
      
      await this.s3Client.send(command);
      console.log('✅ S3 connection successful');
      return true;
    } catch (error) {
      console.error('❌ S3 connection failed', error);
      return false;
    }
  }
}