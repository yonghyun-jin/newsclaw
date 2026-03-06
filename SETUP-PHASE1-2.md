# Phase 1 & 2 Setup Guide

## ✅ What's Implemented

### Phase 1: News API Fetcher
- ✅ NewsAPI service integration
- ✅ Daily news fetching (100 articles)
- ✅ Multiple source strategy (NewsAPI sources + domains)
- ✅ Error handling and retry logic
- ✅ tRPC endpoints for manual testing

### Phase 2: S3 Storage System  
- ✅ Supabase S3 integration with your credentials
- ✅ Timestamp-based folder structure
- ✅ Raw data and summary data storage
- ✅ File retrieval and listing APIs
- ✅ Storage statistics and monitoring

## 🔧 Environment Setup

Your `.env.local` is configured with S3 credentials. You need to add:

```env
# Get this from https://newsapi.org/register
NEWS_API_KEY=your_newsapi_key_here
```

## 🚀 Quick Start

1. **Get NewsAPI Key**:
   - Go to https://newsapi.org/register
   - Sign up for free (1000 requests/day)
   - Copy your API key to `.env.local`

2. **Start the app**:
   ```bash
   cd /home/sean3687/Documents/newsclaw
   pnpm dev
   ```

3. **Test the system**:
   - Go to http://localhost:3000/admin
   - Check connection status (should show S3 connected)
   - Add your NewsAPI key and test news fetching

## 📊 Admin Dashboard

The admin dashboard at `/admin` provides:

- **Connection Status**: Test NewsAPI and S3 connections
- **Manual Controls**: Fetch news manually for testing  
- **Storage Stats**: See how much data is stored
- **Available Dates**: List all stored news data
- **Today's Schedule**: Shows 8am LA timestamp info

## 🎯 Current Features

### News Fetching
```typescript
// Fetch 100 articles from target sources
trpc.news.fetchDaily.mutate()

// Test with fewer articles
trpc.news.fetchManual.mutate({ 
  sources: ['associated-press'], 
  pageSize: 10 
})
```

### Storage Operations
```typescript
// Store raw news data
trpc.storage.storeRawData.mutate({
  timestamp: 1741180800000,
  rawData: newsApiResponse
})

// Retrieve stored data  
trpc.storage.getDailyNews.query({
  timestamp: 1741180800000,
  type: 'raw'
})
```

## 📁 File Structure Created

```
src/
├── lib/
│   ├── newsapi.ts          # NewsAPI service
│   └── s3storage.ts        # S3 storage service
├── server/routers/
│   ├── news.ts             # News tRPC endpoints
│   └── storage.ts          # Storage tRPC endpoints
└── app/admin/page.tsx      # Admin testing interface
```

## 🗞️ News Sources Configured

**NewsAPI Sources** (require exact source IDs):
- Associated Press (`associated-press`)
- CBS News (`cbs-news`)
- ABC News (`abc-news`) 
- Fox News (`fox-news`)

**Domain Sources** (fallback method):
- latimes.com
- ktla.com  
- dailynews.com
- nbclosangeles.com
- abc7.com
- foxla.com

## 🔍 Testing Strategy

1. **Start small**: Test with `fetchManual` (10 articles)
2. **Verify storage**: Check if files appear in S3 bucket  
3. **Full pipeline**: Run `fetchDaily` (100 articles)
4. **Monitor**: Use admin dashboard to track progress

## ⚠️ Common Issues

**NewsAPI Connection Failed**:
- Check if NEWS_API_KEY is set in `.env.local`
- Verify API key is valid at newsapi.org
- Check rate limits (1000 requests/day on free plan)

**S3 Connection Failed**: 
- Credentials are pre-configured
- Check if Supabase bucket exists
- Verify bucket permissions

## 📈 Next Steps

Once Phase 1 & 2 are working:
1. **Phase 3**: Add LLM article scoring
2. **Phase 4**: Build news visualization dashboard
3. **Phase 5**: Set up automated cron scheduling

Ready to test! 🚀