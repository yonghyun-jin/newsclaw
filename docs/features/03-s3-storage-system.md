# S3 Storage System for News Data

## 🎯 Feature Name  
**Supabase S3 Daily News Storage & Retrieval System**

## 📋 Objective
Store daily news fetches in organized S3 buckets with timestamp-based folder structure, maintaining both raw API data and processed summaries.

## 🔧 Requirements

### Functional Requirements
- [ ] Create timestamp-based folder structure (8am LA time in UTC ms)
- [ ] Store raw NewsAPI response as `raw.json`
- [ ] Store processed/scored articles as `summary.json`  
- [ ] Provide fast retrieval by timestamp
- [ ] Handle concurrent read/write operations
- [ ] Maintain data integrity and backup strategy

### Non-Functional Requirements
- [ ] Upload files within 5 seconds
- [ ] Support up to 10MB daily files
- [ ] 99.9% data availability  
- [ ] Automatic folder organization
- [ ] Cost-effective storage strategy

## 🛠 Technical Implementation

### Backend (tRPC)
```typescript
// Storage API endpoints
router.storage.storeDailyNews.mutate({
  timestamp: number,
  rawData: NewsAPIResponse,
  summaryData: ScoredArticle[]
})

router.storage.getDailyNews.query({ 
  timestamp: number,
  type: 'raw' | 'summary' 
})

router.storage.listAvailableDates.query()

// Storage interfaces
interface DailyNewsStorage {
  scanTime: string;        // ISO timestamp
  scanTimeMs: number;      // 8am LA time in UTC ms
  totalArticles: number;
  sources: string[];
  status: 'processing' | 'completed' | 'failed';
}

interface RawNewsFile {
  scanTime: string;
  apiResponse: NewsAPIResponse;
  metadata: {
    fetchDuration: number;
    sourcesQueried: string[];
    errors?: APIError[];
  };
}

interface SummaryNewsFile {
  scanTime: string;
  articles: ScoredArticle[];
  statistics: {
    totalScored: number;
    averageScore: number;
    topScore: number;
    sourceBreakdown: Record<string, number>;
  };
}
```

### S3 Bucket Structure
```
news-ranking-bucket/
├── 1741180800000/          // 8am LA on 2026-03-05 (UTC ms)
│   ├── raw.json           // Raw NewsAPI response
│   └── summary.json       // 100 scored articles
├── 1741267200000/          // Next day
│   ├── raw.json
│   └── summary.json
├── 1741353600000/          // Day after
│   ├── raw.json
│   └── summary.json
└── index.json              // Index of all available dates
```

### Timestamp Generation
```typescript
// Convert 8am Los Angeles time to UTC milliseconds
function getLA8amTimestamp(date: Date): number {
  const la8am = new Date(date);
  la8am.setHours(8, 0, 0, 0); // 8:00:00 AM
  
  // Handle Pacific Time (PST/PDT)
  const offset = isLosAngelesDST(date) ? 7 : 8; // UTC-7 or UTC-8
  const utc8am = new Date(la8am.getTime() + (offset * 60 * 60 * 1000));
  
  return utc8am.getTime(); // Returns UTC milliseconds
}

// Examples:
// March 5, 2026 8am PST = 1741180800000 (UTC ms)
// July 5, 2026 8am PDT = 1751785200000 (UTC ms)
```

### Supabase Storage Implementation
```typescript
import { supabase } from '@/lib/supabase';

class NewsStorageService {
  private bucket = 'news-ranking-bucket';
  
  async storeRawData(timestamp: number, data: NewsAPIResponse): Promise<void> {
    const path = `${timestamp}/raw.json`;
    const file = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(path, file, { upsert: true });
      
    if (error) throw new Error(`Failed to store raw data: ${error.message}`);
  }
  
  async storeSummaryData(timestamp: number, data: ScoredArticle[]): Promise<void> {
    const summaryFile: SummaryNewsFile = {
      scanTime: new Date(timestamp).toISOString(),
      articles: data,
      statistics: this.calculateStats(data)
    };
    
    const path = `${timestamp}/summary.json`;  
    const file = new Blob([JSON.stringify(summaryFile, null, 2)], {
      type: 'application/json'
    });
    
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(path, file, { upsert: true });
      
    if (error) throw new Error(`Failed to store summary data: ${error.message}`);
  }
  
  async getDailyNews(timestamp: number, type: 'raw' | 'summary') {
    const path = `${timestamp}/${type}.json`;
    
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .download(path);
      
    if (error) throw new Error(`Failed to retrieve ${type} data: ${error.message}`);
    
    return JSON.parse(await data.text());
  }
  
  async listAvailableDates(): Promise<number[]> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .list();
      
    if (error) throw new Error(`Failed to list dates: ${error.message}`);
    
    return data
      .map(item => parseInt(item.name))
      .filter(timestamp => !isNaN(timestamp))
      .sort((a, b) => b - a); // Most recent first
  }
}
```

## 📡 Supabase Configuration

### Bucket Setup
```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('news-ranking-bucket', 'news-ranking-bucket', false);

-- Set up RLS policies
CREATE POLICY "Allow authenticated uploads" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'news-ranking-bucket');

CREATE POLICY "Allow authenticated downloads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'news-ranking-bucket');
```

### Environment Variables
```env
# Supabase Storage
SUPABASE_STORAGE_BUCKET=news-ranking-bucket
SUPABASE_MAX_FILE_SIZE=10485760  # 10MB

# Storage Configuration
STORAGE_RETENTION_DAYS=365
BACKUP_ENABLED=true
COMPRESSION_ENABLED=true
```

## 🗂 File Format Standards

### raw.json Format
```json
{
  "scanTime": "2026-03-05T16:00:00.000Z",
  "scanTimeMs": 1741180800000,
  "apiResponse": {
    "status": "ok",
    "totalResults": 97,
    "articles": [
      {
        "title": "Breaking: Major Story Title",
        "description": "Article description...",
        "url": "https://apnews.com/article/...",
        "urlToImage": "https://...",
        "publishedAt": "2026-03-05T14:30:00Z",
        "source": {
          "id": "associated-press",
          "name": "Associated Press"
        },
        "content": "Full article content..."
      }
    ]
  },
  "metadata": {
    "fetchDuration": 12547,
    "sourcesQueried": ["associated-press", "cbs-news", "los-angeles-times"],
    "articlesPerSource": {
      "associated-press": 10,
      "cbs-news": 10,
      "los-angeles-times": 9
    }
  }
}
```

### summary.json Format  
```json
{
  "scanTime": "2026-03-05T16:00:00.000Z",
  "scanTimeMs": 1741180800000,
  "articles": [
    {
      "title": "Breaking: Major Story Title",
      "description": "Article description...",
      "url": "https://apnews.com/article/...",
      "publisher": "Associated Press", 
      "publishedAt": "2026-03-05T14:30:00Z",
      "topic": "Politics",
      "score": 32,
      "scoreBreakdown": {
        "koreanRelevance": 15,
        "timeliness": 10,
        "audienceAppeal": 7
      }
    }
  ],
  "statistics": {
    "totalScored": 97,
    "averageScore": 18.5,
    "topScore": 42,
    "sourceBreakdown": {
      "Associated Press": 15,
      "CBS News": 12,
      "Los Angeles Times": 11
    },
    "topicBreakdown": {
      "Politics": 25,
      "Entertainment": 18,
      "Sports": 15
    }
  }
}
```

## ✅ Acceptance Criteria
- [ ] Store both raw and summary data daily at 8am LA time
- [ ] Folder names use correct UTC millisecond timestamps
- [ ] Files upload successfully within 5 seconds
- [ ] Retrieve data by timestamp efficiently  
- [ ] List all available dates for UI display
- [ ] Handle storage errors gracefully
- [ ] Maintain consistent JSON format standards
- [ ] Support concurrent operations without data corruption

## 🔗 Related Features
- **News API Fetcher** (provides data to store)
- **Article Scoring System** (creates summary data)
- **Admin Dashboard** (displays storage statistics)
- **News Visualization** (retrieves stored data)

---

**Next Steps:**
1. Set up Supabase storage bucket and policies
2. Implement timestamp generation logic
3. Create storage service class
4. Add error handling and retry logic
5. Test concurrent read/write operations
6. Set up monitoring for storage usage