import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import type { RawNewsFile } from './newsapi';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ScoredArticle {
  articleId: string;
  title: string;
  description: string;
  source: string;
  publishedAt: string;
  scores: {
    korean_relevance: number;  // max 25
    timeliness: number;        // max 12
    politics: number;          // max 20
    audience_appeal: number;   // max 15
  };
  total: number;               // max 72
  reasoning: {
    korean_relevance: string;
    timeliness: string;
    politics: string;
    audience_appeal: string;
  };
  tags: string[];
}

export interface SummaryNewsFile {
  scanTime: string;
  scanTimeMs: number;
  generatedAt: string;
  model: string;
  totalArticlesInRaw: number;
  totalArticlesScored: number;
  articles: ScoredArticle[];   // sorted highest score first, no URL stored
}

export interface StorageMetadata {
  timestamp: number;
  date: string;
  hasRaw: boolean;
  hasSummary: boolean;
  articleCount?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class NewsStorageService {
  private s3Client: S3Client;
  private bucketName: string;

  private readonly UPLOAD_TIMEOUT_MS = 5000;
  private readonly MAX_FILE_SIZE_MB = 10;
  private readonly MAX_CONCURRENT_OPERATIONS = 5;

  private activeOperations = new Set<string>();

  constructor() {
    this.s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
      maxAttempts: 3,
      requestHandler: {
        requestTimeout: this.UPLOAD_TIMEOUT_MS
      }
    });

    this.bucketName = process.env.S3_BUCKET_NAME || 'news';

    if (!process.env.S3_ENDPOINT || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
      throw new Error('Missing required S3 configuration environment variables');
    }

    console.log(`📦 Storage service initialized: ${this.bucketName}`);
  }

  // ─── Skip-logic check ───────────────────────────────────────────────────────

  /**
   * Check whether raw.json and/or summary.json already exist for a timestamp.
   * Used by the scheduler to skip steps that are already complete.
   */
  async checkDayExists(timestamp: number): Promise<{ hasRaw: boolean; hasSummary: boolean }> {
    return this.listFolderContents(timestamp);
  }

  // ─── Write ──────────────────────────────────────────────────────────────────

  async storeRawData(timestamp: number, rawData: RawNewsFile): Promise<void> {
    const operationId = `store-raw-${timestamp}`;
    const key = `${timestamp}/raw.json`;
    const startTime = Date.now();

    if (this.activeOperations.size >= this.MAX_CONCURRENT_OPERATIONS) {
      throw new Error(`Concurrent operation limit reached (${this.MAX_CONCURRENT_OPERATIONS})`);
    }

    this.activeOperations.add(operationId);

    try {
      console.log(`📦 Storing raw data: ${key}`);

      const jsonContent = JSON.stringify(rawData, null, 2);
      const fileSizeMB = Buffer.byteLength(jsonContent, 'utf8') / (1024 * 1024);

      if (fileSizeMB > this.MAX_FILE_SIZE_MB) {
        throw new Error(`File size ${fileSizeMB.toFixed(2)}MB exceeds ${this.MAX_FILE_SIZE_MB}MB limit`);
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
        }
      });

      await Promise.race([
        this.s3Client.send(command),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timeout')), this.UPLOAD_TIMEOUT_MS))
      ]);

      console.log(`✅ Raw data stored: ${key} (${Date.now() - startTime}ms, ${fileSizeMB.toFixed(2)}MB)`);
    } catch (error) {
      console.error(`❌ Failed to store raw data: ${key}`, error);
      throw new Error(`Failed to store raw data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  async storeSummaryData(timestamp: number, summaryFile: SummaryNewsFile): Promise<void> {
    const operationId = `store-summary-${timestamp}`;
    const key = `${timestamp}/summary.json`;
    const startTime = Date.now();

    if (this.activeOperations.size >= this.MAX_CONCURRENT_OPERATIONS) {
      throw new Error(`Concurrent operation limit reached (${this.MAX_CONCURRENT_OPERATIONS})`);
    }

    this.activeOperations.add(operationId);

    try {
      console.log(`📦 Storing summary data: ${key} (${summaryFile.totalArticlesScored} articles)`);

      const jsonContent = JSON.stringify(summaryFile, null, 2);
      const fileSizeMB = Buffer.byteLength(jsonContent, 'utf8') / (1024 * 1024);

      if (fileSizeMB > this.MAX_FILE_SIZE_MB) {
        throw new Error(`Summary file size ${fileSizeMB.toFixed(2)}MB exceeds ${this.MAX_FILE_SIZE_MB}MB limit`);
      }

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: jsonContent,
        ContentType: 'application/json',
        Metadata: {
          'scan-time': summaryFile.scanTime,
          'generated-at': summaryFile.generatedAt,
          'article-count': summaryFile.totalArticlesScored.toString(),
          'model': summaryFile.model,
        }
      });

      await Promise.race([
        this.s3Client.send(command),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timeout')), this.UPLOAD_TIMEOUT_MS))
      ]);

      console.log(`✅ Summary data stored: ${key} (${Date.now() - startTime}ms)`);
    } catch (error) {
      console.error(`❌ Failed to store summary data: ${key}`, error);
      throw new Error(`Failed to store summary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  async getRawData(timestamp: number): Promise<RawNewsFile> {
    const key = `${timestamp}/raw.json`;
    console.log(`📥 Retrieving raw data: ${key}`);

    try {
      const response = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: key }));
      const body = await response.Body?.transformToString();
      if (!body) throw new Error('Empty response body');
      const data = JSON.parse(body) as RawNewsFile;
      console.log(`✅ Raw data retrieved: ${key} (${data.apiResponse.articles.length} articles)`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to retrieve raw data: ${key}`, error);
      throw new Error(`Failed to retrieve raw data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getSummaryData(timestamp: number): Promise<SummaryNewsFile> {
    const key = `${timestamp}/summary.json`;
    console.log(`📥 Retrieving summary data: ${key}`);

    try {
      const response = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: key }));
      const body = await response.Body?.transformToString();
      if (!body) throw new Error('Empty response body');
      const data = JSON.parse(body) as SummaryNewsFile;
      console.log(`✅ Summary data retrieved: ${key} (${data.articles.length} articles)`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to retrieve summary data: ${key}`, error);
      throw new Error(`Failed to retrieve summary data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ─── List / Metadata ─────────────────────────────────────────────────────────

  async listAvailableDates(): Promise<StorageMetadata[]> {
    console.log('📋 Listing available news dates...');

    try {
      const response = await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Delimiter: '/'
      }));

      const folders = response.CommonPrefixes || [];

      const metadataList = await Promise.all(
        folders.map(async (folder) => {
          const timestamp = parseInt(folder.Prefix!.replace('/', ''));
          if (isNaN(timestamp)) return null;
          const contents = await this.listFolderContents(timestamp);
          return {
            timestamp,
            date: new Date(timestamp).toISOString().split('T')[0],
            ...contents
          };
        })
      );

      return (metadataList.filter(Boolean) as StorageMetadata[])
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('❌ Failed to list available dates', error);
      throw new Error(`Failed to list available dates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async listFolderContents(timestamp: number): Promise<{ hasRaw: boolean; hasSummary: boolean; articleCount?: number }> {
    try {
      const response = await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${timestamp}/`
      }));
      const objects = response.Contents || [];
      return {
        hasRaw: objects.some(obj => obj.Key?.endsWith('/raw.json')),
        hasSummary: objects.some(obj => obj.Key?.endsWith('/summary.json')),
      };
    } catch {
      return { hasRaw: false, hasSummary: false };
    }
  }

  // ─── Bucket management ───────────────────────────────────────────────────────

  async createBucketIfNotExists(): Promise<{ exists: boolean; created: boolean }> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
      console.log(`✅ Bucket '${this.bucketName}' already exists`);
      return { exists: true, created: false };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucketName }));
        console.log(`✅ Bucket '${this.bucketName}' created`);
        return { exists: false, created: true };
      }
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.s3Client.send(new ListObjectsV2Command({ Bucket: this.bucketName, MaxKeys: 1 }));
      return true;
    } catch {
      return false;
    }
  }

  async getStorageHealth(): Promise<{ available: boolean; responseTime: number; bucketExists: boolean }> {
    const startTime = Date.now();
    try {
      await this.s3Client.send(new ListObjectsV2Command({ Bucket: this.bucketName, MaxKeys: 1 }));
      return { available: true, responseTime: Date.now() - startTime, bucketExists: true };
    } catch {
      return { available: false, responseTime: Date.now() - startTime, bucketExists: false };
    }
  }
}
