'use client';

import { useState } from 'react';
import { trpc } from '../../_trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function DebugPage() {
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  // Debug queries
  const getAvailableSources = trpc.debug.getAvailableSources.useQuery();
  const testQueries = trpc.debug.testQueries.useQuery();

  const testNewsAPI = trpc.debug.testNewsAPI.useMutation();

  const handleTestEndpoint = async (endpoint: 'everything' | 'top-headlines' | 'sources', params?: Record<string, string>) => {
    setIsLoading(prev => ({ ...prev, [endpoint]: true }));
    try {
      const result = await testNewsAPI.mutateAsync({ endpoint, params });
      console.log(`${endpoint} test result:`, result);
    } catch (error) {
      console.error(`${endpoint} test failed:`, error);
    }
    setIsLoading(prev => ({ ...prev, [endpoint]: false }));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">NewsAPI Debug Console</h1>
            <p className="text-xl text-muted-foreground">
              Troubleshoot NewsAPI connection and source issues
            </p>
          </div>
          <Link href="/admin" className="text-blue-600 hover:text-blue-800">
            ← Back to Admin
          </Link>
        </div>

        {/* Quick Test Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>🧪 Quick Tests</CardTitle>
            <CardDescription>Test different NewsAPI endpoints</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 flex-wrap">
              <Button 
                onClick={() => handleTestEndpoint('everything', { q: 'news', language: 'en', pageSize: '10' })}
                disabled={isLoading.everything}
                variant="outline"
              >
                {isLoading.everything ? '⏳' : '📰'} Test Everything API
              </Button>
              
              <Button 
                onClick={() => handleTestEndpoint('top-headlines', { country: 'us', pageSize: '10' })}
                disabled={isLoading['top-headlines']}
                variant="outline"
              >
                {isLoading['top-headlines'] ? '⏳' : '🔥'} Test Top Headlines
              </Button>
              
              <Button 
                onClick={() => handleTestEndpoint('sources')}
                disabled={isLoading.sources}
                variant="outline"
              >
                {isLoading.sources ? '⏳' : '📋'} Test Sources List
              </Button>
            </div>

            {testNewsAPI.data && (
              <div className={`p-4 rounded-md ${testNewsAPI.data.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="text-sm font-mono">
                  <strong>Last Test Result:</strong><br/>
                  Success: {testNewsAPI.data.success ? '✅' : '❌'}<br/>
                  {testNewsAPI.data.success ? (
                    <>
                      Articles: {testNewsAPI.data.articlesCount}<br/>
                      Total Results: {testNewsAPI.data.totalResults}<br/>
                      Status: {testNewsAPI.data.status}
                    </>
                  ) : (
                    <>
                      Error: {JSON.stringify(testNewsAPI.data.error, null, 2)}<br/>
                      Message: {testNewsAPI.data.message}
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Sources */}
        <Card>
          <CardHeader>
            <CardTitle>📰 Available NewsAPI Sources</CardTitle>
            <CardDescription>Sources available in your NewsAPI plan</CardDescription>
          </CardHeader>
          <CardContent>
            {getAvailableSources.isLoading && (
              <div className="text-center py-4">Loading sources...</div>
            )}
            
            {getAvailableSources.error && (
              <div className="p-4 bg-red-50 rounded-md text-sm">
                <strong>Error loading sources:</strong><br/>
                {getAvailableSources.error.message}
              </div>
            )}

            {getAvailableSources.data && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{getAvailableSources.data.allSourcesCount}</div>
                    <div className="text-sm text-muted-foreground">Total US Sources</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{getAvailableSources.data.relevantSourcesCount}</div>
                    <div className="text-sm text-muted-foreground">Relevant Sources</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {getAvailableSources.data.success ? '✅' : '❌'}
                    </div>
                    <div className="text-sm text-muted-foreground">API Status</div>
                  </div>
                </div>

                {getAvailableSources.data.relevantSourcesCount > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">🎯 Relevant Sources for Our Use Case:</h4>
                    <div className="grid gap-2">
                      {getAvailableSources.data.relevantSources.map((source) => (
                        <div key={source.id} className="p-3 border rounded-md">
                          <div className="flex justify-between items-start">
                            <div>
                              <strong>{source.name}</strong> 
                              <span className="ml-2 text-sm text-gray-600">({source.id})</span>
                              <div className="text-sm text-gray-600 mt-1">{source.description}</div>
                            </div>
                            <div className="text-xs bg-gray-100 px-2 py-1 rounded">
                              {source.category}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <details className="border rounded-md p-4">
                  <summary className="cursor-pointer font-semibold">
                    📋 All Available Sources (First 20)
                  </summary>
                  <div className="mt-3 grid gap-1">
                    {getAvailableSources.data.allSources.map((source) => (
                      <div key={source.id} className="text-sm flex justify-between">
                        <span><strong>{source.name}</strong> ({source.id})</span>
                        <span className="text-gray-500">{source.category}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test Queries Results */}
        <Card>
          <CardHeader>
            <CardTitle>🔍 Comprehensive Query Tests</CardTitle>
            <CardDescription>Results of different search strategies</CardDescription>
          </CardHeader>
          <CardContent>
            {testQueries.isLoading && (
              <div className="text-center py-4">Running test queries...</div>
            )}
            
            {testQueries.error && (
              <div className="p-4 bg-red-50 rounded-md text-sm">
                <strong>Error running test queries:</strong><br/>
                {testQueries.error.message}
              </div>
            )}

            {testQueries.data && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{testQueries.data.summary.total}</div>
                    <div className="text-sm text-muted-foreground">Total Tests</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{testQueries.data.summary.successful}</div>
                    <div className="text-sm text-muted-foreground">Successful</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{testQueries.data.summary.failed}</div>
                    <div className="text-sm text-muted-foreground">Failed</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {testQueries.data.results.map((result, index) => (
                    <div key={index} className={`p-4 rounded-md border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <strong>{result.success ? '✅' : '❌'} {result.name}</strong>
                          {result.success ? (
                            <div className="text-sm mt-1">
                              Articles: <strong>{result.articlesCount}</strong> | 
                              Total Results: <strong>{result.totalResults}</strong>
                            </div>
                          ) : (
                            <div className="text-sm mt-1 text-red-600">
                              Error: {typeof result.error === 'string' ? result.error : JSON.stringify(result.error)}
                            </div>
                          )}
                        </div>
                        <div className="text-xs bg-gray-100 px-2 py-1 rounded">
                          Status: {result.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card>
          <CardHeader>
            <CardTitle>🔧 Troubleshooting Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 rounded-md">
                <strong>💡 Common Issues:</strong>
                <ul className="mt-2 space-y-1 text-sm list-disc list-inside">
                  <li><strong>0 articles returned:</strong> Sources might not exist or have no recent content</li>
                  <li><strong>API errors:</strong> Check your NewsAPI key is valid and has remaining quota</li>
                  <li><strong>Source not found:</strong> Use the "Available Sources" list above to find correct source IDs</li>
                  <li><strong>Rate limiting:</strong> Free plan has 1000 requests/day limit</li>
                </ul>
              </div>

              <div className="p-3 bg-yellow-50 rounded-md">
                <strong>🎯 Recommended Fix:</strong>
                <div className="mt-2 text-sm">
                  Use the "Relevant Sources" found above instead of our hardcoded ones. 
                  Update <code>src/lib/newsapi.ts</code> with actual working source IDs.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}