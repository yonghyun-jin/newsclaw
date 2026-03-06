# News API Fetcher Service

## 🎯 Feature Name
**NewsAPI Integration & Daily News Fetching System**

## 📋 Objective
Automatically fetch 100 recent news articles daily from 10 selected publishers using NewsAPI, triggered every 8am Los Angeles time.

## 🔧 Requirements

### Functional Requirements
- [ ] Connect to NewsAPI with proper authentication
- [ ] Query 10 specific news sources for last 24 hours
- [ ] Fetch exactly 100 articles total (10 per source)
- [ ] Handle API rate limits and errors gracefully
- [ ] Trigger automatically at 8am Los Angeles time daily
- [ ] Store raw API responses in structured format

### Non-Functional Requirements  
- [ ] API calls complete within 30 seconds total
- [ ] Retry logic for failed requests (3 attempts)
- [ ] Proper error logging and monitoring
- [ ] Handle NewsAPI rate limits (1000 requests/day)

## 🛠 Technical Implementation

### Backend (tRPC)
```typescript
// API endpoints needed
router.news.fetchDaily.mutate()
router.news.getStatus.query() 
router.news.getRawData.query({ timestamp: number })

// NewsAPI Integration
interface NewsAPIConfig {
  apiKey: string;
  baseUrl: 'https://newsapi.org/v2';
  sources: string[];
  articlesPerSource: 10;
}

interface NewsArticle {
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
```

### NewsAPI Query Strategy
```typescript
// Target Sources (NewsAPI IDs to research)
const NEWS_SOURCES = [
  'aist.com',           // Need to find NewsAPI source ID
  'dailynews.com',      // Need to find NewsAPI source ID  
  'cbs-news',           // cbsnews.com
  'nbc-los-angeles',    // nbclosangeles.com
  'abc7-los-angeles',   // abc7.com
  'fox-los-angeles',    // foxla.com
  'associated-press',   // apnews.com
  'los-angeles-times',  // latimes.com
  'ktla'                // ktla.com
];

// Query Parameters
const fetchQuery = {
  sources: NEWS_SOURCES.join(','),
  sortBy: 'publishedAt',
  pageSize: 100,
  language: 'en',
  from: get24HoursAgo(), // ISO string
  to: getCurrentTime(),   // ISO string
  apiKey: process.env.NEWS_API_KEY
};
```

### Cron Job Setup
```typescript
// Schedule: Every day at 8am Los Angeles time (UTC-8 or UTC-7)
const CRON_SCHEDULE = '0 16 * * *'; // 8am LA = 4pm UTC (standard time)
// Note: Adjust for daylight saving time

interface FetchJob {
  triggerTime: number; // 8am LA in UTC milliseconds  
  status: 'pending' | 'running' | 'completed' | 'failed';
  articlesFound: number;
  errors?: string[];
}
```

## 📡 NewsAPI Integration Details

### API Endpoint Structure
```http
GET https://newsapi.org/v2/everything
?sources=associated-press,cbs-news,los-angeles-times
&sortBy=publishedAt
&pageSize=100
&language=en  
&from=2026-03-04T16:00:00Z
&to=2026-03-05T16:00:00Z
&apiKey=YOUR_API_KEY
```

### Response Handling
```typescript
interface NewsAPIResponse {
  status: 'ok' | 'error';
  totalResults: number;
  articles: NewsArticle[];
}

// Error handling for common issues
const handleNewsAPIErrors = {
  rateLimitExceeded: () => scheduleRetry(3600000), // 1 hour
  apiKeyInvalid: () => alertAdmin(),
  noResults: () => logWarning('No articles found'),
  serverError: () => retryWithBackoff()
};
```

## 🚀 Deployment & Environment

### Environment Variables
```env
# NewsAPI Configuration
NEWS_API_KEY=your_newsapi_key_here
NEWS_API_BASE_URL=https://newsapi.org/v2

# Timing Configuration  
FETCH_SCHEDULE_CRON=0 16 * * *
TIMEZONE=America/Los_Angeles

# Rate Limiting
MAX_RETRIES=3
RETRY_DELAY_MS=5000
REQUEST_TIMEOUT_MS=30000
```

### Railway Cron Job
```json
// railway.json addition for cron
{
  "build": {
    "builder": "NIXPACKS"
  },
  "cron": [
    {
      "command": "npm run fetch-news",
      "schedule": "0 16 * * *"
    }
  ]
}
```

## ✅ Acceptance Criteria
- [ ] Successfully fetch from all 10 news sources
- [ ] Collect exactly 100 articles total  
- [ ] Trigger automatically at 8am LA time daily
- [ ] Handle API failures gracefully with retries
- [ ] Complete all API calls within 30 seconds
- [ ] Store raw JSON response for processing
- [ ] Log all fetch attempts with status/errors

## 🔍 NewsAPI Source Research Needed
```bash
# TODO: Research actual NewsAPI source IDs for:
# 1. aist.com (may not be available)
# 2. dailynews.com (may not be available)  
# 3. cbsnews.com -> 'cbs-news'
# 4. nbclosangeles.com -> find correct ID
# 5. abc7.com -> find correct ID
# 6. foxla.com -> find correct ID
# 7. apnews.com -> 'associated-press'
# 8. latimes.com -> find correct ID  
# 9. ktla.com -> find correct ID

# Alternative: Use domains parameter if sources not available
```

## 🔗 Related Features
- **S3 Storage System** (stores fetched data)
- **Article Scoring System** (processes fetched articles)
- **Admin Dashboard** (monitors fetch status)

---

**Next Steps:**
1. Sign up for NewsAPI account
2. Research actual source IDs for target publications
3. Set up cron job scheduling system  
4. Implement error handling and retry logic
5. Create monitoring dashboard for fetch status