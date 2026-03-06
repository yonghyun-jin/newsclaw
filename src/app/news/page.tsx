'use client';

import { useState } from 'react';
import { trpc } from '../_trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function NewsPage() {
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'latest'>('calendar');

  // Get available dates for calendar
  const availableDates = trpc.storage.listAvailableDates.useQuery();
  
  // Get news data for selected date
  const selectedNewsData = trpc.storage.getDailyNews.useQuery(
    { timestamp: selectedDate!, type: 'raw' },
    { enabled: !!selectedDate }
  );

  // Get summary data if available
  const selectedSummaryData = trpc.storage.getDailyNews.useQuery(
    { timestamp: selectedDate!, type: 'summary' },
    { enabled: !!selectedDate }
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return {
      full: date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      short: date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'America/Los_Angeles'
      })
    };
  };

  const getTimeWindow = (timestamp: number) => {
    const scanTime = new Date(timestamp);
    const startTime = new Date(scanTime.getTime() - 6 * 60 * 60 * 1000); // 6 hours before
    return {
      start: startTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'America/Los_Angeles'
      }),
      end: scanTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: 'America/Los_Angeles'
      })
    };
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold">📰 News Archive</h1>
            <p className="text-xl text-muted-foreground">
              Access daily news collections by date
            </p>
          </div>
          <div className="flex gap-4">
            <Link href="/admin" className="text-blue-600 hover:text-blue-800">
              Admin Dashboard
            </Link>
            <div className="flex gap-2">
              <Button 
                variant={viewMode === 'calendar' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('calendar')}
              >
                📅 Calendar
              </Button>
              <Button 
                variant={viewMode === 'latest' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('latest')}
              >
                🔥 Latest
              </Button>
            </div>
          </div>
        </div>

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <Card>
            <CardHeader>
              <CardTitle>📅 Daily News Calendar</CardTitle>
              <CardDescription>
                Select a date to view the 50 latest articles from that day's 6-hour collection window
              </CardDescription>
            </CardHeader>
            <CardContent>
              {availableDates.isLoading && (
                <div className="text-center py-8">Loading available dates...</div>
              )}

              {availableDates.data?.dates && availableDates.data.dates.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {availableDates.data.dates.map((dateInfo) => {
                      const formatted = formatDate(dateInfo.timestamp);
                      const timeWindow = getTimeWindow(dateInfo.timestamp);
                      const isSelected = selectedDate === dateInfo.timestamp;

                      return (
                        <Card 
                          key={dateInfo.timestamp} 
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                          }`}
                          onClick={() => setSelectedDate(dateInfo.timestamp)}
                        >
                          <CardContent className="p-4">
                            <div className="font-semibold text-lg">{formatted.full}</div>
                            <div className="text-sm text-muted-foreground mt-1">
                              📰 Collection Time: {formatted.time} LA<br/>
                              ⏰ Articles from: {timeWindow.start} - {timeWindow.end}<br/>
                              📊 Raw Data: {dateInfo.hasRaw ? '✅' : '❌'} | 
                              Scored: {dateInfo.hasSummary ? '✅' : '❌'}
                            </div>
                            {dateInfo.articleCount && (
                              <div className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded mt-2 inline-block">
                                {dateInfo.articleCount} articles
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {!selectedDate && (
                    <div className="text-center py-8 text-muted-foreground">
                      👆 Select a date above to view articles
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-muted-foreground">
                    No news data available yet.
                  </div>
                  <Link href="/admin" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
                    → Go to Admin Dashboard to run your first news fetch
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Selected Date Articles */}
        {selectedDate && selectedNewsData.data && (
          <Card>
            <CardHeader>
              <CardTitle>
                📰 Articles for {formatDate(selectedDate).full}
              </CardTitle>
              <CardDescription>
                Latest 50 articles collected from {getTimeWindow(selectedDate).start} - {getTimeWindow(selectedDate).end} LA time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedNewsData.data.data.apiResponse.articles.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">
                        {selectedNewsData.data.data.apiResponse.articles.length}
                      </div>
                      <div className="text-sm text-muted-foreground">Articles</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {Object.keys(selectedNewsData.data.data.metadata.articlesPerSource || {}).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Sources</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {selectedNewsData.data.data.metadata.fetchDuration}ms
                      </div>
                      <div className="text-sm text-muted-foreground">Fetch Time</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {selectedSummaryData.data ? '✅' : '⏳'}
                      </div>
                      <div className="text-sm text-muted-foreground">Scored</div>
                    </div>
                  </div>

                  {/* Article List */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">Latest Articles (Most Recent First)</h3>
                    <div className="grid gap-3">
                      {selectedNewsData.data.data.apiResponse.articles
                        .slice(0, 20) // Show first 20 articles
                        .map((article, index) => (
                        <Card key={index} className="p-4">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <h4 className="font-semibold text-lg hover:text-blue-600">
                                <a href={article.url} target="_blank" rel="noopener noreferrer">
                                  {article.title}
                                </a>
                              </h4>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {article.description}
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span className="font-medium">{article.source.name}</span>
                                <span>
                                  {new Date(article.publishedAt).toLocaleString('en-US', {
                                    timeZone: 'America/Los_Angeles',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })} LA
                                </span>
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  #{index + 1}
                                </span>
                              </div>
                            </div>
                            {article.urlToImage && (
                              <img 
                                src={article.urlToImage} 
                                alt={article.title}
                                className="w-20 h-20 object-cover rounded-md"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>

                    {selectedNewsData.data.data.apiResponse.articles.length > 20 && (
                      <div className="text-center py-4 text-muted-foreground">
                        ... and {selectedNewsData.data.data.apiResponse.articles.length - 20} more articles
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No articles found for this date
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Latest Mode - Show most recent collection */}
        {viewMode === 'latest' && availableDates.data?.dates && availableDates.data.dates.length > 0 && (
          <div>
            {/* Auto-select most recent date */}
            {!selectedDate && setSelectedDate(availableDates.data.dates[0].timestamp)}
          </div>
        )}
      </div>
    </div>
  );
}