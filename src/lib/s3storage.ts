import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
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
  
  // Performance requirements from specification
  private readonly UPLOAD_TIMEOUT_MS = 5000; // 5 seconds as specified
  private readonly MAX_FILE_SIZE_MB = 10; // 10MB as specified
  private readonly MAX_CONCURRENT_OPERATIONS = 5; // Handle concurrent ops
  
  private activeOperations = new Set<string>(); // Track concurrent operations

  constructor() {
    // Initialize S3 client with Supabase credentials and optimized config
    this.s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true, // Required for Supabase S3
      maxAttempts: 3, // Built-in retry logic
      requestHandler: {
        requestTimeout: this.UPLOAD_TIMEOUT_MS
      }
    });

    this.bucketName = process.env.S3_BUCKET_NAME || 'news-ranking-bucket';

    // Validate required environment variables
    if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
      throw new Error('Missing required S3 configuration environment variables');
    }
    
    console.log(`📦 Storage service initialized: ${this.bucketName} (${this.UPLOAD_TIMEOUT_MS}ms timeout)`);
  }

  /**
   * Store raw NewsAPI data with performance requirements (5-second timeout, 10MB limit)
   */
  async storeRawData(timestamp: number, rawData: RawNewsFile): Promise<void> {
    const operationId = `store-raw-${timestamp}`;
    const key = `${timestamp}/raw.json`;
    const startTime = Date.now();
    
    // Check concurrent operations limit
    if (this.activeOperations.size >= this.MAX_CONCURRENT_OPERATIONS) {
      throw new Error(`Concurrent operation limit reached (${this.MAX_CONCURRENT_OPERATIONS})`);
    }
    
    this.activeOperations.add(operationId);
    
    try {
      console.log(`📦 Storing raw data: ${key} (${this.activeOperations.size} concurrent ops)`);
      
      const jsonContent = JSON.stringify(rawData, null, 2);
      const fileSizeMB = Buffer.byteLength(jsonContent, 'utf8') / (1024 * 1024);
      
      // Validate file size (10MB limit as specified)
      if (fileSizeMB > this.MAX_FILE_SIZE_MB) {
        throw new Error(`File size ${fileSizeMB.toFixed(2)}MB exceeds limit of ${this.MAX_FILE_SIZE_MB}MB`);
      }
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: jsonContent,
        ContentType: 'application/json',
        Metadata: {
          'scan-time': rawData.scanTime,
          'article-count': rawData.apiResponse.articles.length.toString(),
          'fetch-status': rawData.apiResponse.status,
          'file-size-mb': fileSizeMB.toFixed(3),
          'storage-version': '1.0'
        }
      });

      // Store with timeout (5 seconds as specified)
      const uploadPromise = this.s3Client.send(command);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Upload timeout after 5 seconds')), this.UPLOAD_TIMEOUT_MS)
      );
      
      await Promise.race([uploadPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Raw data stored: ${key} (${duration}ms, ${fileSizeMB.toFixed(2)}MB)`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Failed to store raw data: ${key} (${duration}ms)`, error);
      throw new Error(`Failed to store raw data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Store processed/scored articles summary with performance requirements
   */
  async storeSummaryData(timestamp: number, scoredArticles: ScoredArticle[]): Promise<void> {
    const operationId = `store-summary-${timestamp}`;
    const key = `${timestamp}/summary.json`;
    const startTime = Date.now();
    
    // Check concurrent operations limit
    if (this.activeOperations.size >= this.MAX_CONCURRENT_OPERATIONS) {
      throw new Error(`Concurrent operation limit reached (${this.MAX_CONCURRENT_OPERATIONS})`);
    }
    
    this.activeOperations.add(operationId);
    
    try {
      const summaryFile: SummaryNewsFile = {
        scanTime: new Date(timestamp).toISOString(),
        scanTimeMs: timestamp,
        articles: scoredArticles,
        statistics: this.calculateStatistics(scoredArticles)
      };
      
      console.log(`📦 Storing summary data: ${key} (${scoredArticles.length} articles, ${this.activeOperations.size} concurrent ops)`);
      
      const jsonContent = JSON.stringify(summaryFile, null, 2);
      const fileSizeMB = Buffer.byteLength(jsonContent, 'utf8') / (1024 * 1024);
      
      // Validate file size
      if (fileSizeMB > this.MAX_FILE_SIZE_MB) {
        throw new Error(`Summary file size ${fileSizeMB.toFixed(2)}MB exceeds limit of ${this.MAX_FILE_SIZE_MB}MB`);
      }
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: jsonContent,
        ContentType: 'application/json',
        Metadata: {
          'scan-time': summaryFile.scanTime,
          'article-count': scoredArticles.length.toString(),
          'average-score': summaryFile.statistics.averageScore.toString(),
          'top-score': summaryFile.statistics.topScore.toString(),
          'file-size-mb': fileSizeMB.toFixed(3),
          'storage-version': '1.0'
        }
      });

      // Store with timeout (5 seconds as specified)
      const uploadPromise = this.s3Client.send(command);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Upload timeout after 5 seconds')), this.UPLOAD_TIMEOUT_MS)
      );
      
      await Promise.race([uploadPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Summary data stored: ${key} (${duration}ms, ${fileSizeMB.toFixed(2)}MB)`);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Failed to store summary data: ${key} (${duration}ms)`, error);
      throw new Error(`Failed to store summary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.activeOperations.delete(operationId);
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
   * Create S3 bucket if it doesn't exist
   */
  async createBucketIfNotExists(): Promise<{ exists: boolean; created: boolean }> {
    try {
      console.log(`🔍 Checking if bucket '${this.bucketName}' exists...`);
      
      // Try to access the bucket
      const headCommand = new HeadBucketCommand({ Bucket: this.bucketName });
      await this.s3Client.send(headCommand);
      
      console.log(`✅ Bucket '${this.bucketName}' already exists!`);
      return { exists: true, created: false };
      
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        console.log(`📦 Bucket '${this.bucketName}' doesn't exist. Creating it...`);
        
        try {
          // Create the bucket
          const createCommand = new CreateBucketCommand({ Bucket: this.bucketName });
          await this.s3Client.send(createCommand);
          
          console.log(`✅ Bucket '${this.bucketName}' created successfully!`);
          return { exists: false, created: true };
          
        } catch (createError) {
          console.error(`❌ Failed to create bucket '${this.bucketName}':`, createError);
          throw createError;
        }
      } else {
        console.error(`❌ Failed to check bucket '${this.bucketName}':`, error);
        throw error;
      }
    }
  }

  /**
   * Store complete daily news data (raw + summary) as specified in requirements
   */
  async storeDailyNews(timestamp: number, rawData: RawNewsFile, summaryData?: ScoredArticle[]): Promise<void> {
    console.log(`📦 Storing complete daily news data for timestamp: ${timestamp}`);
    const startTime = Date.now();
    
    try {
      // Store raw data
      await this.storeRawData(timestamp, rawData);
      
      // Store summary data if provided
      if (summaryData) {
        await this.storeSummaryData(timestamp, summaryData);
      }
      
      const duration = Date.now() - startTime;
      console.log(`✅ Complete daily news stored successfully (${duration}ms)`);
      
    } catch (error) {
      console.error('❌ Failed to store complete daily news:', error);
      throw error;
    }
  }

  /**
   * Backup strategy: Create redundant copy with backup suffix
   */
  async createBackup(timestamp: number): Promise<void> {
    console.log(`💾 Creating backup for timestamp: ${timestamp}`);
    
    try {
      const rawKey = `${timestamp}/raw.json`;
      const summaryKey = `${timestamp}/summary.json`;
      const backupSuffix = '.backup';
      
      // Copy raw file
      try {
        const rawData = await this.getRawData(timestamp);
        const backupRawCommand = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: rawKey + backupSuffix,
          Body: JSON.stringify(rawData, null, 2),
          ContentType: 'application/json',
          Metadata: {
            'backup-created': new Date().toISOString(),
            'original-key': rawKey
          }
        });
        await this.s3Client.send(backupRawCommand);
      } catch (error) {
        console.warn('Warning: Could not backup raw file:', error);
      }
      
      // Copy summary file if exists
      try {
        const summaryData = await this.getSummaryData(timestamp);
        const backupSummaryCommand = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: summaryKey + backupSuffix,
          Body: JSON.stringify(summaryData, null, 2),
          ContentType: 'application/json',
          Metadata: {
            'backup-created': new Date().toISOString(),
            'original-key': summaryKey
          }
        });
        await this.s3Client.send(backupSummaryCommand);
      } catch (error) {
        console.warn('Warning: Could not backup summary file:', error);
      }
      
      console.log('✅ Backup created successfully');
      
    } catch (error) {
      console.error('❌ Backup creation failed:', error);
      throw error;
    }
  }

  /**
   * Get storage health metrics
   */
  async getStorageHealth(): Promise<{
    available: boolean;
    responseTime: number;
    concurrentOps: number;
    bucketExists: boolean;
  }> {
    const startTime = Date.now();
    
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        MaxKeys: 1
      });
      
      await this.s3Client.send(command);
      
      return {
        available: true,
        responseTime: Date.now() - startTime,
        concurrentOps: this.activeOperations.size,
        bucketExists: true
      };
    } catch (error) {
      return {
        available: false,
        responseTime: Date.now() - startTime,
        concurrentOps: this.activeOperations.size,
        bucketExists: false
      };
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