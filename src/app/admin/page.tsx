'use client';

import { useState } from 'react';
import { trpc } from '../_trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminPage() {
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  // tRPC queries and mutations
  const testNewsConnection = trpc.news.testConnection.useQuery();
  const testStorageConnection = trpc.storage.testConnection.useQuery();
  const getStorageStats = trpc.storage.getStorageStats.useQuery();
  const listDates = trpc.storage.listAvailableDates.useQuery();
  const getSources = trpc.news.getSources.useQuery();
  const getTodayTimestamp = trpc.news.getTodayTimestamp.useQuery();
  
  // Scheduler queries
  const getSchedulerStatus = trpc.scheduler.getStatus.useQuery();
  const getSchedulerHealth = trpc.scheduler.healthCheck.useQuery();

  const fetchNews = trpc.news.fetchDaily.useMutation({
    onSuccess: (data) => {
      console.log('News fetch success:', data);
      // Refetch storage stats and dates
      getStorageStats.refetch();
      listDates.refetch();
    },
    onError: (error) => {
      console.error('News fetch error:', error);
    }
  });

  const fetchManualNews = trpc.news.fetchManual.useMutation({
    onSuccess: (data) => {
      console.log('Manual news fetch success:', data);
    }
  });

  const storeRawData = trpc.storage.storeRawData.useMutation({
    onSuccess: (data) => {
      console.log('Storage success:', data);
      getStorageStats.refetch();
      listDates.refetch();
    }
  });

  const createBucket = trpc.storage.createBucket.useMutation({
    onSuccess: (data) => {
      console.log('Bucket creation success:', data);
      testStorageConnection.refetch();
      getStorageStats.refetch();
    },
    onError: (error) => {
      console.error('Bucket creation error:', error);
    }
  });

  // Scheduler mutations
  const startScheduler = trpc.scheduler.start.useMutation({
    onSuccess: (data) => {
      console.log('Scheduler start success:', data);
      getSchedulerStatus.refetch();
    }
  });

  const stopScheduler = trpc.scheduler.stop.useMutation({
    onSuccess: (data) => {
      console.log('Scheduler stop success:', data);
      getSchedulerStatus.refetch();
    }
  });

  const triggerManualScheduler = trpc.scheduler.triggerManual.useMutation({
    onSuccess: (data) => {
      console.log('Manual scheduler success:', data);
      getSchedulerStatus.refetch();
      getStorageStats.refetch();
      listDates.refetch();
    }
  });

  const handleFetchNews = async () => {
    setIsLoading(prev => ({ ...prev, fetchNews: true }));
    try {
      const result = await fetchNews.mutateAsync();
      console.log('Fetch result:', result);
      
      // If successful, store the raw data
      if (result.success && result.data) {
        // Note: In a real implementation, we'd get the actual raw data from the fetch
        // For now, we'll just store a placeholder
        console.log('Would store raw data here...');
      }
    } catch (error) {
      console.error('Fetch failed:', error);
    }
    setIsLoading(prev => ({ ...prev, fetchNews: false }));
  };

  const handleManualFetch = async () => {
    setIsLoading(prev => ({ ...prev, manualFetch: true }));
    try {
      await fetchManualNews.mutateAsync({
        sources: ['associated-press'],
        pageSize: 10
      });
    } catch (error) {
      console.error('Manual fetch failed:', error);
    }
    setIsLoading(prev => ({ ...prev, manualFetch: false }));
  };

  const handleCreateBucket = async () => {
    setIsLoading(prev => ({ ...prev, createBucket: true }));
    try {
      await createBucket.mutateAsync();
    } catch (error) {
      console.error('Create bucket failed:', error);
    }
    setIsLoading(prev => ({ ...prev, createBucket: false }));
  };

  const handleStartScheduler = async () => {
    setIsLoading(prev => ({ ...prev, startScheduler: true }));
    try {
      await startScheduler.mutateAsync();
    } catch (error) {
      console.error('Start scheduler failed:', error);
    }
    setIsLoading(prev => ({ ...prev, startScheduler: false }));
  };

  const handleStopScheduler = async () => {
    setIsLoading(prev => ({ ...prev, stopScheduler: true }));
    try {
      await stopScheduler.mutateAsync();
    } catch (error) {
      console.error('Stop scheduler failed:', error);
    }
    setIsLoading(prev => ({ ...prev, stopScheduler: false }));
  };

  const handleTriggerScheduler = async () => {
    setIsLoading(prev => ({ ...prev, triggerScheduler: true }));
    try {
      await triggerManualScheduler.mutateAsync();
    } catch (error) {
      console.error('Trigger scheduler failed:', error);
    }
    setIsLoading(prev => ({ ...prev, triggerScheduler: false }));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">NewsLaw Admin Dashboard</h1>
          <p className="text-xl text-muted-foreground">
            Phase 1 & 2 Implementation: News API + S3 Storage
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Connection Status */}
          <Card>
            <CardHeader>
              <CardTitle>🔗 Connection Status</CardTitle>
              <CardDescription>Test API connections</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span>NewsAPI:</span>
                <span className={`px-2 py-1 rounded text-sm ${
                  testNewsConnection.data?.success 
                    ? 'bg-green-100 text-green-800' 
                    : testNewsConnection.error 
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                }`}>
                  {testNewsConnection.isLoading ? 'Testing...' : 
                   testNewsConnection.data?.success ? 'Connected' :
                   testNewsConnection.error ? 'Failed' : 'Unknown'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span>S3 Storage:</span>
                <span className={`px-2 py-1 rounded text-sm ${
                  testStorageConnection.data?.success 
                    ? 'bg-green-100 text-green-800' 
                    : testStorageConnection.error 
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                }`}>
                  {testStorageConnection.isLoading ? 'Testing...' : 
                   testStorageConnection.data?.success ? 'Connected' :
                   testStorageConnection.error ? 'Failed' : 'Unknown'}
                </span>
              </div>

              {testNewsConnection.error && (
                <div className="text-sm text-red-600 mt-2">
                  NewsAPI Error: {testNewsConnection.error.message}
                </div>
              )}
              
              {testStorageConnection.error && (
                <div className="text-sm text-red-600 mt-2">
                  S3 Error: {testStorageConnection.error.message}
                  <Button 
                    size="sm" 
                    className="ml-2"
                    onClick={handleCreateBucket}
                    disabled={isLoading.createBucket}
                  >
                    {isLoading.createBucket ? '⏳' : '📦'} Create Bucket
                  </Button>
                </div>
              )}

              {createBucket.data && (
                <div className="text-sm text-green-600 mt-2">
                  Bucket Result: {createBucket.data.message}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Timestamp */}
          <Card>
            <CardHeader>
              <CardTitle>📅 Today's Schedule</CardTitle>
              <CardDescription>8am Los Angeles time info</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {getTodayTimestamp.data && (
                <>
                  <div className="text-sm">
                    <strong>Timestamp:</strong> {getTodayTimestamp.data.timestamp}
                  </div>
                  <div className="text-sm">
                    <strong>UTC Time:</strong> {getTodayTimestamp.data.isoString}
                  </div>
                  <div className="text-sm">
                    <strong>LA Time:</strong> {getTodayTimestamp.data.localString}
                  </div>
                  <div className="text-sm">
                    <strong>DST Active:</strong> {getTodayTimestamp.data.isDST ? 'Yes' : 'No'}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* News Sources */}
        <Card>
          <CardHeader>
            <CardTitle>📰 News Sources</CardTitle>
            <CardDescription>Target publications for daily fetch</CardDescription>
          </CardHeader>
          <CardContent>
            {getSources.data && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">NewsAPI Sources:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {getSources.data.sources.map(source => (
                      <div key={source.id} className="text-sm">
                        <strong>{source.name}</strong> ({source.url})
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Domain Sources:</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {getSources.data.domains.map(domain => (
                      <div key={domain} className="text-sm">{domain}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scheduler Status & Controls */}
        <Card>
          <CardHeader>
            <CardTitle>⏰ Daily Scheduler (8am LA Time)</CardTitle>
            <CardDescription>Automated daily news fetching</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {getSchedulerStatus.data && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className={`font-semibold ${getSchedulerStatus.data.status.isScheduled ? 'text-green-600' : 'text-gray-600'}`}>
                    {getSchedulerStatus.data.status.isScheduled ? '✅ Active' : '⏸️ Stopped'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Next Run</div>
                  <div className="font-semibold text-sm">
                    {getSchedulerStatus.data.status.nextRunLocal || 'Not scheduled'}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              {getSchedulerStatus.data?.status.isScheduled ? (
                <Button 
                  variant="outline"
                  onClick={handleStopScheduler}
                  disabled={isLoading.stopScheduler}
                  className="flex items-center gap-2"
                >
                  {isLoading.stopScheduler ? '⏳' : '⏹️'} Stop Scheduler
                </Button>
              ) : (
                <Button 
                  onClick={handleStartScheduler}
                  disabled={isLoading.startScheduler || !testNewsConnection.data?.success || !testStorageConnection.data?.success}
                  className="flex items-center gap-2"
                >
                  {isLoading.startScheduler ? '⏳' : '▶️'} Start Scheduler
                </Button>
              )}
              
              <Button 
                variant="outline"
                onClick={handleTriggerScheduler}
                disabled={isLoading.triggerScheduler || !testNewsConnection.data?.success || !testStorageConnection.data?.success}
                className="flex items-center gap-2"
              >
                {isLoading.triggerScheduler ? '⏳' : '🚀'} Run Now (Manual)
              </Button>
            </div>

            {getSchedulerStatus.data?.status.lastResult && (
              <div className={`p-3 rounded-md text-sm ${getSchedulerStatus.data.status.lastResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <strong>Last Scheduled Run:</strong><br/>
                {getSchedulerStatus.data.status.lastResult.success ? '✅' : '❌'} {getSchedulerStatus.data.status.lastResult.date}<br/>
                Articles: {getSchedulerStatus.data.status.lastResult.articlesProcessed}<br/>
                Duration: {getSchedulerStatus.data.status.lastResult.duration}ms
                {getSchedulerStatus.data.status.lastResult.errors && (
                  <><br/>Errors: {getSchedulerStatus.data.status.lastResult.errors.join(', ')}</>
                )}
              </div>
            )}

            {triggerManualScheduler.data && (
              <div className={`p-3 rounded-md text-sm ${triggerManualScheduler.data.result.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <strong>Manual Run Result:</strong><br/>
                {triggerManualScheduler.data.message}<br/>
                Articles: {triggerManualScheduler.data.result.articlesProcessed}<br/>
                Duration: {triggerManualScheduler.data.result.duration}ms
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Controls */}
        <Card>
          <CardHeader>
            <CardTitle>🎮 Manual Controls</CardTitle>
            <CardDescription>Test news fetching and storage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button 
                onClick={handleFetchNews}
                disabled={isLoading.fetchNews || !testNewsConnection.data?.success}
                className="flex items-center gap-2"
              >
                {isLoading.fetchNews ? '⏳' : '🗞️'} Fetch Daily News (100)
              </Button>
              
              <Button 
                variant="outline"
                onClick={handleManualFetch}
                disabled={isLoading.manualFetch || !testNewsConnection.data?.success}
                className="flex items-center gap-2"
              >
                {isLoading.manualFetch ? '⏳' : '🔧'} Test Fetch (10)
              </Button>
            </div>

            {fetchNews.data && (
              <div className="p-3 bg-green-50 rounded-md text-sm">
                <strong>Last Fetch Result:</strong><br/>
                {fetchNews.data.message}<br/>
                Articles: {fetchNews.data.data?.articlesCount}<br/>
                Duration: {fetchNews.data.data?.fetchDuration}ms
              </div>
            )}

            {fetchManualNews.data && (
              <div className="p-3 bg-blue-50 rounded-md text-sm">
                <strong>Manual Fetch Result:</strong><br/>
                {fetchManualNews.data.message}<br/>
                Articles: {fetchManualNews.data.data?.articlesCount}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storage Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>📊 Storage Statistics</CardTitle>
            <CardDescription>S3 bucket contents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {getStorageStats.data && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold">{getStorageStats.data.totalDays}</div>
                  <div className="text-sm text-muted-foreground">Total Days</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{getStorageStats.data.totalRawFiles}</div>
                  <div className="text-sm text-muted-foreground">Raw Files</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{getStorageStats.data.totalSummaryFiles}</div>
                  <div className="text-sm text-muted-foreground">Summary Files</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{getStorageStats.data.storageUsed}</div>
                  <div className="text-sm text-muted-foreground">Storage Used</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Dates */}
        <Card>
          <CardHeader>
            <CardTitle>📅 Available Data</CardTitle>
            <CardDescription>Stored news data by date</CardDescription>
          </CardHeader>
          <CardContent>
            {listDates.data?.dates && listDates.data.dates.length > 0 ? (
              <div className="space-y-2">
                {listDates.data.dates.map(date => (
                  <div key={date.timestamp} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <strong>{date.displayDate}</strong>
                      <div className="text-sm text-muted-foreground">
                        Timestamp: {date.timestamp}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        date.hasRaw ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {date.hasRaw ? 'RAW ✓' : 'RAW ✗'}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        date.hasSummary ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {date.hasSummary ? 'SUMMARY ✓' : 'SUMMARY ✗'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No data stored yet. Run a news fetch to see results here.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}