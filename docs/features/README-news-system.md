# News Discovery & Ranking System - Feature Overview

## 🎯 System Architecture

This system consists of 3 main components that work together to provide journalists with automatically ranked, relevant news stories.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  News API       │    │  S3 Storage     │    │  Pipeline       │
│  Fetcher        │───▶│  System         │◄───│  Orchestrator   │
│                 │    │                 │    │                 │
│ • NewsAPI calls │    │ • Raw data      │    │ • Scheduling    │
│ • 10 sources    │    │ • Processed     │    │ • Error handling│
│ • 100 articles  │    │ • Timestamps    │    │ • Monitoring    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Implementation Sequence

### Phase 1: Core Infrastructure (Week 1)
1. **[Feature 02: News API Fetcher](./02-news-api-fetcher.md)**
   - Set up NewsAPI integration
   - Research correct source IDs for target publications
   - Implement basic fetching logic

### Phase 2: Data Storage (Week 1-2)  
2. **[Feature 03: S3 Storage System](./03-s3-storage-system.md)**
   - Configure Supabase S3 bucket
   - Implement timestamp-based folder structure
   - Create storage/retrieval APIs

### Phase 3: Orchestration (Week 2)
3. **[Feature 04: Pipeline Orchestrator](./04-news-pipeline-orchestrator.md)**
   - Build pipeline coordination logic
   - Set up cron scheduling
   - Add monitoring and error recovery

## 🔧 Technical Stack Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| **API** | NewsAPI.org | Fetch news from 10 sources |
| **Storage** | Supabase S3 | Store raw & processed data |
| **Orchestration** | tRPC + Cron | Coordinate daily pipeline |
| **Scheduling** | OpenClaw Cron or Railway | Daily 8am LA time triggers |
| **Monitoring** | tRPC + WebSocket | Real-time status updates |

## 📊 Data Flow

```
Daily at 8am LA Time:
1. NewsAPI Fetcher → Fetch 100 articles from 10 sources
2. S3 Storage → Store as raw.json (timestamp folder)
3. [Future] LLM Scoring → Score articles based on criteria
4. S3 Storage → Store as summary.json (scored articles)
5. [Future] Dashboard → Display ranked news to journalists
```

## 🗂 File Structure After Implementation

```
newsclaw/
├── src/
│   ├── app/
│   │   ├── admin/pipeline/     # Pipeline monitoring UI
│   │   └── news/               # News display UI (future)
│   ├── lib/
│   │   ├── newsapi.ts          # NewsAPI service
│   │   ├── storage.ts          # S3 storage service  
│   │   └── pipeline.ts         # Pipeline orchestrator
│   └── server/routers/
│       ├── news.ts             # News fetching endpoints
│       ├── storage.ts          # Storage endpoints
│       └── pipeline.ts         # Pipeline endpoints
├── docs/features/              # ✅ Feature specifications
└── cron-jobs/                  # Pipeline scheduling
```

## 🎯 Key Decisions Made

### NewsAPI Sources
Target publications (need to research actual NewsAPI source IDs):
- Associated Press (apnews.com) 
- Los Angeles Times (latimes.com)
- CBS News (cbsnews.com)
- NBC LA (nbclosangeles.com)
- ABC7 (abc7.com)
- Fox LA (foxla.com)
- KTLA (ktla.com)
- Daily News (dailynews.com)
- AIST (aist.com) - *may not be available*

### Storage Structure
- **Folder naming**: UTC milliseconds of 8am LA time
- **File format**: JSON with consistent schemas  
- **Data retention**: 1 year (configurable)
- **Backup strategy**: Supabase automatic backups

### Scheduling Strategy
- **Trigger time**: 8am Los Angeles (handles DST automatically)
- **Execution limit**: 5 minutes total pipeline
- **Recovery**: Automatic retries with exponential backoff
- **Monitoring**: Real-time status via WebSocket

## 🚀 Next Steps

1. **Research NewsAPI sources** - Verify which target publications are available
2. **Set up accounts** - NewsAPI, ensure Supabase storage is configured
3. **Start with Feature 02** - Basic news fetching functionality
4. **Build incrementally** - Test each component before integration

## 📝 Environment Setup Required

```env
# Add to .env.local
NEWS_API_KEY=your_newsapi_key_here
SUPABASE_STORAGE_BUCKET=news-ranking-bucket
PIPELINE_TIMEZONE=America/Los_Angeles
```

Ready to start implementation! 🚀