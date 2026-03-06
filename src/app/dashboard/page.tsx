'use client';

import { useState } from 'react';
import { trpc } from '../_trpc/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ─── Score bar helpers ────────────────────────────────────────────────────────

const MAX_SCORES = {
  korean_relevance: 25,
  timeliness: 12,
  politics: 20,
  audience_appeal: 15,
  total: 72,
} as const;

const SCORE_LABELS = {
  korean_relevance: '한국 관련성',
  timeliness: '시의성',
  politics: '정치 및 이민',
  audience_appeal: '독자 어필',
} as const;

const SCORE_COLORS = {
  korean_relevance: 'bg-blue-500',
  timeliness: 'bg-green-500',
  politics: 'bg-orange-500',
  audience_appeal: 'bg-purple-500',
} as const;

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 shrink-0 text-gray-500">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-gray-700 font-mono text-xs">{value}/{max}</span>
    </div>
  );
}

function TagBadge({ tag }: { tag: string }) {
  const colorMap: Record<string, string> = {
    immigration: 'bg-red-100 text-red-700',
    visa: 'bg-red-100 text-red-700',
    deportation: 'bg-red-100 text-red-700',
    breaking: 'bg-yellow-100 text-yellow-700',
    politics: 'bg-orange-100 text-orange-700',
    'k-culture': 'bg-pink-100 text-pink-700',
    'south-korea': 'bg-blue-100 text-blue-700',
    'north-korea': 'bg-gray-200 text-gray-700',
    koreatown: 'bg-blue-100 text-blue-700',
    community: 'bg-green-100 text-green-700',
    business: 'bg-indigo-100 text-indigo-700',
    education: 'bg-teal-100 text-teal-700',
    health: 'bg-emerald-100 text-emerald-700',
    crime: 'bg-red-100 text-red-700',
    'anti-asian': 'bg-red-200 text-red-800',
  };
  const cls = colorMap[tag] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {tag}
    </span>
  );
}

// ─── Article card ─────────────────────────────────────────────────────────────

type Article = {
  articleId: string;
  title: string;
  description: string;
  source: string;
  publishedAt: string;
  scores: { korean_relevance: number; timeliness: number; politics: number; audience_appeal: number };
  total: number;
  reasoning: { korean_relevance: string; timeliness: string; politics: string; audience_appeal: string };
  tags: string[];
  url: string | null;
};

function ArticleCard({ article, rank }: { article: Article; rank: number }) {
  const [showReasoning, setShowReasoning] = useState(false);
  const totalPct = Math.round((article.total / MAX_SCORES.total) * 100);

  const publishedDate = new Date(article.publishedAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return (
    <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Rank + score badge */}
            <div className="shrink-0 text-center">
              <div className="text-xs text-gray-400 font-medium">#{rank}</div>
              <div
                className={`text-lg font-bold ${totalPct >= 70 ? 'text-green-600' : totalPct >= 45 ? 'text-blue-600' : 'text-gray-500'}`}
              >
                {article.total}
              </div>
              <div className="text-xs text-gray-400">/ {MAX_SCORES.total}</div>
            </div>

            {/* Title + meta */}
            <div className="min-w-0">
              {article.url ? (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-semibold text-gray-900 hover:text-blue-600 leading-snug block"
                >
                  {article.title}
                </a>
              ) : (
                <p className="text-base font-semibold text-gray-900 leading-snug">{article.title}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {article.source} &middot; {publishedDate}
              </p>
            </div>
          </div>
        </div>

        {/* Tags */}
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {article.tags.map(tag => <TagBadge key={tag} tag={tag} />)}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0 space-y-2">
        {/* Description */}
        {article.description && (
          <p className="text-sm text-gray-600 leading-relaxed">{article.description}</p>
        )}

        {/* Score bars */}
        <div className="space-y-1.5 pt-1">
          {(Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[]).map(key => (
            <ScoreBar
              key={key}
              label={SCORE_LABELS[key]}
              value={article.scores[key]}
              max={MAX_SCORES[key]}
              color={SCORE_COLORS[key]}
            />
          ))}
        </div>

        {/* Reasoning toggle */}
        <button
          onClick={() => setShowReasoning(v => !v)}
          className="text-xs text-blue-500 hover:text-blue-700 mt-1 underline underline-offset-2"
        >
          {showReasoning ? '▲ Hide reasoning' : '▼ Show reasoning'}
        </button>

        {showReasoning && (
          <div className="text-xs text-gray-600 space-y-1 bg-gray-50 rounded p-3 border border-gray-100">
            {(Object.keys(SCORE_LABELS) as (keyof typeof SCORE_LABELS)[]).map(key => (
              <div key={key}>
                <span className="font-semibold text-gray-700">{SCORE_LABELS[key]}: </span>
                {article.reasoning[key]}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Default to today's date
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [queriedDate, setQueriedDate] = useState(today);

  const result = trpc.storage.getByDate.useQuery(
    { dateStr: queriedDate },
    { retry: false }
  );

  function handleLoad() {
    setQueriedDate(selectedDate);
  }

  const articles = result.data?.articles ?? [];
  const meta = result.data?.meta;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900 mr-auto">📰 News Dashboard</h1>

          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <Button
            onClick={handleLoad}
            disabled={result.isFetching}
            size="sm"
          >
            {result.isFetching ? 'Loading…' : 'Load'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Status bar */}
        {result.data && (
          <div className="mb-4 text-sm text-gray-600 flex items-center gap-3 flex-wrap">
            <span className="font-medium text-gray-900">
              {new Date(queriedDate + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              })}
            </span>
            {result.data.hasSummary && meta && (
              <>
                <span className="text-gray-400">·</span>
                <span>{meta.totalArticlesScored} articles scored</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-400 text-xs">
                  Generated {new Date(meta.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} via {meta.model}
                </span>
              </>
            )}
          </div>
        )}

        {/* States */}
        {result.isFetching && (
          <div className="text-center py-16 text-gray-400 text-sm">Loading articles…</div>
        )}

        {result.isError && (
          <div className="text-center py-16 text-red-500 text-sm">
            Failed to load: {result.error.message}
          </div>
        )}

        {result.data && !result.data.hasSummary && !result.isFetching && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm font-medium text-gray-500">No scored articles for {queriedDate}</p>
            {!result.data.hasRaw && (
              <p className="text-xs text-gray-400 mt-1">No data fetched for this date yet.</p>
            )}
            {result.data.hasRaw && !result.data.hasSummary && (
              <p className="text-xs text-gray-400 mt-1">Raw data exists but scoring hasn't run yet.</p>
            )}
          </div>
        )}

        {/* Article list */}
        {!result.isFetching && articles.length > 0 && (
          <div className="space-y-4">
            {articles.map((article, i) => (
              <ArticleCard key={article.articleId} article={article as Article} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
