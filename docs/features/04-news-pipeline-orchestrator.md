# News Discovery Pipeline Orchestrator

## 🎯 Feature Name
**Complete News Pipeline: Fetch → Store → Score → Visualize**

## 📋 Objective  
Orchestrate the entire news discovery workflow that runs daily, combining NewsAPI fetching, S3 storage, LLM scoring, and provides a unified system for journalists to access ranked news stories.

## 🔧 Requirements

### Functional Requirements
- [ ] Coordinate daily pipeline execution at 8am Los Angeles time
- [ ] Handle step-by-step workflow: Fetch → Store Raw → Score → Store Summary
- [ ] Provide pipeline status monitoring and error handling
- [ ] Enable manual pipeline triggers for testing/backfills
- [ ] Support pipeline recovery from failures
- [ ] Log comprehensive execution metrics

### Non-Functional Requirements  
- [ ] Complete full pipeline within 5 minutes
- [ ] Handle up to 100 articles per day reliably
- [ ] Provide real-time status updates
- [ ] Maintain 99% pipeline success rate
- [ ] Support concurrent pipeline monitoring

## 🛠 Technical Implementation

### Backend (tRPC Pipeline Router)
```typescript
// Main pipeline orchestration endpoints
router.pipeline.runDaily.mutate()
router.pipeline.getStatus.query({ date?: string })
router.pipeline.runManual.mutate({ date: string, steps?: string[] })
router.pipeline.getHistory.query({ limit?: number })

// Pipeline state management
interface PipelineExecution {
  id: string;
  date: string;
  timestamp: number;          // 8am LA time in UTC ms
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  currentStep: PipelineStep;
  steps: PipelineStepResult[];
  startTime: number;
  endTime?: number;
  totalArticles?: number;
  errors: PipelineError[];
}

enum PipelineStep {
  FETCH_NEWS = 'fetch_news',
  STORE_RAW = 'store_raw', 
  SCORE_ARTICLES = 'score_articles',
  STORE_SUMMARY = 'store_summary',
  COMPLETED = 'completed'
}

interface PipelineStepResult {
  step: PipelineStep;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime: number;
  endTime?: number;
  duration?: number;
  data?: any;
  error?: string;
}
```

### Pipeline Orchestrator Class
```typescript
class NewsPipelineOrchestrator {
  private newsApiService: NewsAPIService;
  private storageService: NewsStorageService;
  private scoringService: ArticleScoringService;
  
  async runDailyPipeline(): Promise<PipelineExecution> {
    const timestamp = this.getToday8amLATimestamp();
    const execution: PipelineExecution = {
      id: `pipeline-${timestamp}`,
      date: new Date(timestamp).toISOString().split('T')[0],
      timestamp,
      status: 'running',
      currentStep: PipelineStep.FETCH_NEWS,
      steps: [],
      startTime: Date.now(),
      errors: []
    };
    
    try {
      // Step 1: Fetch News
      const rawData = await this.executeStep(
        execution, 
        PipelineStep.FETCH_NEWS,
        () => this.newsApiService.fetchDailyNews()
      );
      
      // Step 2: Store Raw Data
      await this.executeStep(
        execution,
        PipelineStep.STORE_RAW, 
        () => this.storageService.storeRawData(timestamp, rawData)
      );
      
      // Step 3: Score Articles
      const scoredArticles = await this.executeStep(
        execution,
        PipelineStep.SCORE_ARTICLES,
        () => this.scoringService.scoreArticles(rawData.articles)
      );
      
      // Step 4: Store Summary
      await this.executeStep(
        execution,
        PipelineStep.STORE_SUMMARY,
        () => this.storageService.storeSummaryData(timestamp, scoredArticles)
      );
      
      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.totalArticles = scoredArticles.length;
      
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.errors.push({
        step: execution.currentStep,
        message: error.message,
        timestamp: Date.now()
      });
    }
    
    return execution;
  }
  
  private async executeStep<T>(
    execution: PipelineExecution,
    step: PipelineStep,
    operation: () => Promise<T>
  ): Promise<T> {
    execution.currentStep = step;
    
    const stepResult: PipelineStepResult = {
      step,
      status: 'running',
      startTime: Date.now()
    };
    
    try {
      const result = await operation();
      stepResult.status = 'completed';
      stepResult.endTime = Date.now();
      stepResult.duration = stepResult.endTime - stepResult.startTime;
      stepResult.data = result;
      
      execution.steps.push(stepResult);
      return result;
      
    } catch (error) {
      stepResult.status = 'failed';
      stepResult.endTime = Date.now();
      stepResult.duration = stepResult.endTime - stepResult.startTime;
      stepResult.error = error.message;
      
      execution.steps.push(stepResult);
      throw error;
    }
  }
  
  private getToday8amLATimestamp(): number {
    const now = new Date();
    const la8am = new Date(now);
    la8am.setHours(8, 0, 0, 0);
    
    // Convert to UTC based on LA timezone
    const offset = this.isLosAngelesDST(now) ? 7 : 8;
    return la8am.getTime() + (offset * 60 * 60 * 1000);
  }
}
```

### Cron Job Integration
```typescript
// Using OpenClaw cron system for scheduling
const DAILY_PIPELINE_CRON = {
  name: "Daily News Pipeline",
  schedule: {
    kind: "cron",
    expr: "0 16 * * *", // 4pm UTC = 8am LA (standard time)
    tz: "America/Los_Angeles"
  },
  payload: {
    kind: "agentTurn",
    message: "Run the daily news pipeline for today",
    model: "anthropic/claude-sonnet-3.5",
    timeoutSeconds: 600 // 10 minutes max
  },
  sessionTarget: "isolated",
  enabled: true
};

// Alternative: Railway cron job
const railwayPipelineCron = {
  command: "npm run pipeline:daily",
  schedule: "0 16 * * *" // Adjust for daylight saving
};
```

## 📊 Pipeline Monitoring & Status

### Real-time Status API
```typescript
router.pipeline.getLiveStatus.query()
  .subscription() // WebSocket for real-time updates

interface LivePipelineStatus {
  isRunning: boolean;
  currentExecution?: PipelineExecution;
  lastSuccessful?: {
    date: string;
    timestamp: number;
    articlesProcessed: number;
    duration: number;
  };
  upcomingSchedule: {
    nextRun: number; // timestamp
    hoursUntilNext: number;
  };
  systemHealth: {
    newsApiStatus: 'healthy' | 'degraded' | 'down';
    storageStatus: 'healthy' | 'degraded' | 'down';
    scoringStatus: 'healthy' | 'degraded' | 'down';
  };
}
```

### Error Recovery System
```typescript
interface PipelineRecovery {
  retryFailedStep(executionId: string, step: PipelineStep): Promise<void>;
  rerunFromStep(date: string, fromStep: PipelineStep): Promise<PipelineExecution>;
  backfillMissingDays(startDate: string, endDate: string): Promise<PipelineExecution[]>;
}

// Automatic recovery strategies
const RECOVERY_STRATEGIES = {
  [PipelineStep.FETCH_NEWS]: {
    maxRetries: 3,
    retryDelay: 300000, // 5 minutes
    fallbackSources: ['backup-news-source']
  },
  [PipelineStep.STORE_RAW]: {
    maxRetries: 5,
    retryDelay: 60000, // 1 minute  
    alternativeStorage: 'local-backup'
  },
  [PipelineStep.SCORE_ARTICLES]: {
    maxRetries: 2,
    retryDelay: 120000, // 2 minutes
    fallbackModel: 'gpt-4o-mini'
  }
};
```

## 🎨 Admin Dashboard Components

### Frontend Components Needed
```typescript
// Pipeline status dashboard
<PipelineStatusCard />
<PipelineHistoryTable />
<PipelineMetricsChart />
<ManualPipelineControls />

// Real-time monitoring
<LiveStatusIndicator />
<StepProgressBar />
<ErrorLogViewer />
<SystemHealthIndicators />

// Manual controls
<RunPipelineButton />
<BackfillDateRange />
<RetryFailedStepButton />
```

### shadcn/ui Components to Add
```bash
pnpm dlx shadcn@latest add badge progress alert-dialog 
pnpm dlx shadcn@latest add tabs table calendar date-picker
pnpm dlx shadcn@latest add chart tooltip popover
```

## 🚀 Deployment & Environment

### Environment Variables
```env
# Pipeline Configuration
PIPELINE_ENABLED=true
PIPELINE_TIMEZONE=America/Los_Angeles
PIPELINE_MAX_DURATION_MS=300000  # 5 minutes
PIPELINE_RETRY_ATTEMPTS=3

# Service Integration
NEWS_API_KEY=your_newsapi_key
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key  # for scoring

# Monitoring
PIPELINE_WEBHOOK_URL=https://hooks.slack.com/...  # for alerts
LOG_LEVEL=info
METRICS_ENABLED=true
```

### Railway Deployment
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false
  },
  "cron": [
    {
      "command": "npm run pipeline:daily",
      "schedule": "0 16 * * *"
    }
  ]
}
```

## ✅ Acceptance Criteria
- [ ] Pipeline runs automatically every day at 8am LA time
- [ ] Successfully processes 100 news articles per day
- [ ] Completes entire workflow within 5 minutes
- [ ] Stores both raw and processed data correctly
- [ ] Provides real-time status updates during execution
- [ ] Recovers gracefully from individual step failures
- [ ] Sends alerts for pipeline failures or degraded performance
- [ ] Supports manual pipeline triggers for testing
- [ ] Maintains execution history for monitoring
- [ ] Handles timezone changes (DST) automatically

## 📈 Success Metrics
- **Pipeline Success Rate**: >99% daily completion
- **Average Execution Time**: <3 minutes
- **Article Processing Rate**: 100 articles/day
- **Error Recovery Rate**: <5% manual intervention needed
- **System Uptime**: >99.9% availability

## 🔗 Related Features
- **News API Fetcher** (Step 1 of pipeline)
- **S3 Storage System** (Steps 2 & 4 of pipeline)
- **Article Scoring System** (Step 3 of pipeline)
- **News Visualization Dashboard** (consumes pipeline output)
- **Admin Monitoring** (observes pipeline health)

---

**Implementation Priority:**
1. **High**: Core pipeline orchestration
2. **High**: Error handling and recovery  
3. **Medium**: Real-time status monitoring
4. **Medium**: Manual pipeline controls
5. **Low**: Advanced metrics and analytics

**Estimated Development Time**: 5-7 days