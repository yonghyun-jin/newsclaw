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