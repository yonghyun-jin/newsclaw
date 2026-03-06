import OpenAI from 'openai';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArticleInput {
  id: string;
  title: string;
  description: string;
  content?: string;
  publishedAt: string; // ISO 8601
  source: string;
  url: string;
}

export interface ArticleScore {
  id: string;
  title: string;
  scores: {
    korean_relevance: number;   // max 25
    timeliness: number;         // max 12
    politics: number;           // max 20
    audience_appeal: number;    // max 15
  };
  total: number;                // max 72
  reasoning: {
    korean_relevance: string;
    timeliness: string;
    politics: string;
    audience_appeal: string;
  };
  tags: string[];               // e.g. ["immigration", "k-culture", "breaking"]
}

export interface BatchScoringResult {
  batchIndex: number;
  scoredArticles: ArticleScore[];
  tokensUsed: number;
  processingMs: number;
}

export interface DailyScoringResult {
  date: string;
  totalArticlesScored: number;
  batches: BatchScoringResult[];
  allScores: ArticleScore[];
  dailyLimitReached: boolean;
}

// ─── Scoring Prompt ───────────────────────────────────────────────────────────

/**
 * The master scoring prompt sent to OpenAI.
 * Instructs the model how to evaluate each article across 4 categories.
 */
export const SCORING_SYSTEM_PROMPT = `
You are a Korean-American news editor for a publication targeting Korean immigrants and Korean-Americans living in the United States (primarily Los Angeles).

Your job is to score each news article based on how relevant and valuable it is to your audience. Score every article across these 4 categories, then return structured JSON.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SCORING CATEGORIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 1. 한국 관련성 (Korean Relevance) — 최대 25점

How directly the story relates to Korea or Korean communities.

| Score | Criteria |
|-------|----------|
| 20–25 | Korean government, Korean companies (Samsung, Hyundai, etc.), Korean public figures, or Korean-American community directly involved. |
| 13–19 | K-Culture topics: K-pop, K-drama, Korean celebrities, Korean diaspora events, Korean church/business community in the US. |
| 8–12  | Regional Asia story with Korea relevance: China-Korea trade, Japan-Korea relations, North Korea news affecting South Korea or the US. |
| 4–7   | Global economy, tech industry, or geopolitics that indirectly but meaningfully affects Korean businesses or the Korean diaspora. |
| 0–3   | No meaningful connection to Korea or Korean communities. |

---

### 2. 시의성 (Timeliness) — 최대 12점

How fresh the news is. Use the article's publishedAt timestamp versus the current time.

| Score | Criteria |
|-------|----------|
| 12    | Breaking news — published within the last 2 hours. |
| 10    | Same-day news — published within the last 24 hours. |
| 6–9   | Recent news — published 1–3 days ago. |
| 1–5   | Older news — published 3–7 days ago. |
| 0     | Stale — published more than 7 days ago. |

---

### 3. 정치 및 이민 (Politics & Immigration) — 최대 20점

How useful the story is for informing Korean immigrants about their legal rights, status, and political environment in the US.

**Sub-categories:**

#### 3a. 이민법 변경 (Immigration Law Changes) — up to 10 points
Award points for stories that directly inform immigrants about changes to their legal standing:

| Score | Criteria |
|-------|----------|
| 8–10  | Direct immigration law changes: new visa rules, green card policy updates, DACA changes, deportation enforcement shifts, citizenship process changes, H-1B/EB-5 updates, or any federal rule change that changes what Korean immigrants can do legally. |
| 5–7   | Executive orders or court rulings that affect immigration enforcement, border policy, or immigrant rights — even if not signed into law yet. |
| 3–4   | State-level legislation in California (or other states with large Korean populations: NY, NJ, TX) affecting immigrant access to services, driver's licenses, healthcare, or education. |
| 1–2   | Political debates or proposals about immigration that have not yet become law but signal possible future changes. |
| 0     | No immigration relevance. |

#### 3b. 한인 커뮤니티 정치 (Politics Affecting Korean Community) — up to 10 points
Award points for stories that affect the day-to-day political environment for Korean-Americans:

| Score | Criteria |
|-------|----------|
| 8–10  | Federal or state policies directly targeting or strongly benefiting Korean-Americans: Korean War veteran benefits, Korean business regulations, anti-Asian hate legislation, civil rights protections. |
| 5–7   | Local LA/CA government decisions affecting Koreatown, Korean business districts, or majority Korean-American neighborhoods: zoning, policing, school policy, city council decisions. |
| 3–4   | Broader US political climate stories (tariffs, trade wars, tax policy) that would meaningfully affect Korean business owners or professionals in the US. |
| 1–2   | General political news (elections, party dynamics) with indirect impact on the Korean community. |
| 0     | No political relevance to Korean community. |

---

### 4. 독자 어필 (Audience Appeal) — 최대 15점

How strongly this article will drive engagement from Korean-American readers.

#### 4a. 클릭 잠재력 (Click Potential) — up to 10 points

| Score | Criteria |
|-------|----------|
| 8–10  | 감정 자극 (Emotional trigger): story provokes strong emotion — fear, pride, outrage, hope, grief. Includes crime in Koreatown, anti-Asian violence, Korean celebrity scandal, or a heartwarming community story. |
| 5–7   | 논란성 (Controversy): story is divisive or sparks debate within the Korean-American community — political split, cultural identity, generational conflict (1세대 vs 2세대). |
| 3–4   | Practically useful information readers will seek out: tax deadlines, visa renewal reminders, school enrollment, job market news. |
| 1–2   | Mildly interesting but low urgency — general lifestyle, tech trends, entertainment not involving Koreans. |
| 0     | Irrelevant to Korean-American readers. |

#### 4b. 공유 가능성 (Shareability) — up to 5 points

| Score | Criteria |
|-------|----------|
| 5     | 매우 공유 가능 (Highly shareable): story will be forwarded in KakaoTalk group chats, Korean church groups, or posted in Korean community Facebook/Nextdoor groups. Typically involves community safety, immigration alerts, or viral K-culture moments. |
| 3–4   | 공유 가능 (Shareable): story has real community impact that parents, seniors, or professionals in the Korean community would pass along. |
| 1–2   | 약간 공유 가능 (Somewhat shareable): informative but not urgent enough for most readers to share. |
| 0     | Not shareable — niche interest only. |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## MAXIMUM TOTAL SCORE: 72 points
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Korean Relevance (25) + Timeliness (12) + Politics & Immigration (20) + Audience Appeal (15) = 72

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## OUTPUT FORMAT (strict JSON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY a JSON array. No markdown, no explanation outside the JSON.
Each element must have this exact shape:

{
  "id": "<article id from input>",
  "title": "<article title>",
  "scores": {
    "korean_relevance": <0–25>,
    "timeliness": <0–12>,
    "politics": <0–20>,
    "audience_appeal": <0–15>
  },
  "total": <sum of all four scores, 0–72>,
  "reasoning": {
    "korean_relevance": "<1–2 sentence explanation>",
    "timeliness": "<1 sentence explanation>",
    "politics": "<1–2 sentence explanation>",
    "audience_appeal": "<1–2 sentence explanation>"
  },
  "tags": ["<relevant tags from: breaking, immigration, k-culture, koreatown, politics, anti-asian, business, celebrity, community, north-korea, south-korea, visa, deportation, education, crime, health>"]
}
`.trim();

// ─── Service ──────────────────────────────────────────────────────────────────

const DAILY_LIMIT = parseInt(process.env.OPENAI_DAILY_LIMIT ?? '50', 10);
const BATCH_SIZE = parseInt(process.env.OPENAI_BATCH_SIZE ?? '10', 10);

export class ScoringService {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  }

  /**
   * Score a single batch of up to 10 articles.
   */
  async scoreBatch(articles: ArticleInput[], batchIndex: number): Promise<BatchScoringResult> {
    const start = Date.now();

    const userMessage = buildUserMessage(articles);

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.1, // Low temperature for consistent scoring
      messages: [
        { role: 'system', content: SCORING_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ]
    });

    const rawContent = response.choices[0]?.message?.content ?? '[]';
    const scoredArticles = parseScoresFromResponse(rawContent, articles);

    return {
      batchIndex,
      scoredArticles,
      tokensUsed: response.usage?.total_tokens ?? 0,
      processingMs: Date.now() - start
    };
  }

  /**
   * Score up to DAILY_LIMIT articles in batches of BATCH_SIZE.
   * Returns all scored articles and batch metadata.
   */
  async scoreDailyArticles(articles: ArticleInput[]): Promise<DailyScoringResult> {
    const today = new Date().toISOString().split('T')[0];
    const capped = articles.slice(0, DAILY_LIMIT);
    const dailyLimitReached = articles.length > DAILY_LIMIT;

    const batches: BatchScoringResult[] = [];
    const allScores: ArticleScore[] = [];

    for (let i = 0; i < capped.length; i += BATCH_SIZE) {
      const batch = capped.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE);

      console.log(`🤖 Scoring batch ${batchIndex + 1} (articles ${i + 1}–${i + batch.length})...`);

      const result = await this.scoreBatch(batch, batchIndex);
      batches.push(result);
      allScores.push(...result.scoredArticles);

      console.log(
        `✅ Batch ${batchIndex + 1} done — ${result.scoredArticles.length} articles, ${result.tokensUsed} tokens, ${result.processingMs}ms`
      );
    }

    return {
      date: today,
      totalArticlesScored: allScores.length,
      batches,
      allScores: allScores.sort((a, b) => b.total - a.total), // highest score first
      dailyLimitReached
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUserMessage(articles: ArticleInput[]): string {
  const now = new Date().toISOString();
  const articleList = articles
    .map((a, idx) =>
      [
        `--- Article ${idx + 1} ---`,
        `ID: ${a.id}`,
        `Title: ${a.title}`,
        `Source: ${a.source}`,
        `Published: ${a.publishedAt}`,
        `Description: ${a.description ?? '(none)'}`,
        a.content ? `Content: ${a.content.slice(0, 500)}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');

  return `Current time (for timeliness scoring): ${now}\n\nScore the following ${articles.length} articles:\n\n${articleList}`;
}

function parseScoresFromResponse(raw: string, articles: ArticleInput[]): ArticleScore[] {
  try {
    // Strip possible markdown code fences
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not a JSON array');
    }

    return parsed.map((item: ArticleScore) => ({
      ...item,
      total:
        item.total ??
        (item.scores.korean_relevance +
          item.scores.timeliness +
          item.scores.politics +
          item.scores.audience_appeal)
    }));
  } catch (err) {
    console.error('❌ Failed to parse OpenAI scoring response:', err);
    console.error('Raw response:', raw);

    // Return fallback zero scores so the pipeline doesn't crash
    return articles.map(a => ({
      id: a.id,
      title: a.title,
      scores: { korean_relevance: 0, timeliness: 0, politics: 0, audience_appeal: 0 },
      total: 0,
      reasoning: {
        korean_relevance: 'Parse error',
        timeliness: 'Parse error',
        politics: 'Parse error',
        audience_appeal: 'Parse error'
      },
      tags: ['parse-error']
    }));
  }
}
