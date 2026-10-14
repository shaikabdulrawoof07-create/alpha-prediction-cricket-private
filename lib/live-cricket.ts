export type CricketFormat = "t20" | "odi" | "hundred" | "test" | "other";

export type RawWidgetMatch = {
  id: string;
  u: string;
  d: string;
  t: string;
  s: string;
  toss?: string;
  ms: string;
  t1: string;
  t2: string;
  t1n?: string;
  t2n?: string;
  t1s?: string;
  t2s?: string;
  t1i?: string;
  t2i?: string;
  bpo?: number;
  maxBalls?: number;
  target?: number;
  inningsNumber?: number;
  battingTeamIndex?: 1 | 2;
  venue?: string;
  recentRunRate?: number;
  recentWickets?: number;
  battingStrikeRate?: number;
  bowlerEconomy?: number;
  actualMilestoneScores?: Record<number, { runs: number; wickets: number }>;
  feedUpdatedAt?: string;
};

export type ParsedScore = {
  runs: number;
  wickets: number;
  ballsElapsed: number;
  oversText: string;
  display: string;
};

export type MilestoneForecast = {
  over: number;
  label: string;
  predicted: number;
  low: number;
  high: number;
  /** The first prediction captured for this milestone in the current innings. */
  initialPrediction?: number;
  initialLow?: number;
  initialHigh?: number;
  /** The smoothed live prediction currently shown for this milestone. */
  currentPrediction?: number;
  currentLow?: number;
  currentHigh?: number;
  /** Wider uncertainty band (approximately 80% of simulated outcomes). */
  range80Low?: number;
  range80High?: number;
  /** Populated when the checkpoint is locked with a provider-reported score. */
  actualScore?: number;
  initialError?: number;
  finalError?: number;
  accuracy?: number;
  stability?: number;
  /** Original model band retained when a completed checkpoint is replaced by its actual score. */
  predictedLow?: number;
  predictedHigh?: number;
  /** Set for legacy entries where the original pre-checkpoint band was not reliable. */
  predictionRangeStatus?: "captured" | "unavailable";
  state: "upcoming" | "locked" | "baseline" | "actual";
  actualWickets?: number;
};

export type InningsSummary = {
  number: 1 | 2;
  team: string;
  shortName: string;
  score: string;
  isCurrent: boolean;
  target: number | null;
};

export type LiveMatchPrediction = {
  id: string;
  title: string;
  format: CricketFormat;
  formatLabel: string;
  status: string;
  liveLabel: string;
  battingTeam: string;
  bowlingTeam: string;
  battingShortName: string;
  bowlingShortName: string;
  currentScore: string;
  currentRuns: number;
  currentWickets: number;
  currentBalls: number;
  ballsPerOver: number;
  inningsLimitOvers: number;
  currentRunRate: number;
  requiredRunRate: number | null;
  target: number | null;
  innings: InningsSummary[];
  winProbability: {
    battingTeam: string;
    bowlingTeam: string;
    battingTeamPercent: number;
    bowlingTeamPercent: number;
  };
  initialWinProbability?: {
    battingTeamPercent: number;
    bowlingTeamPercent: number;
  };
  wicketProbability: number;
  confidence: number;
  scoreForecasts: MilestoneForecast[];
  finalScore: {
    predicted: number;
    low: number;
    high: number;
  };
  initialFinalScore?: {
    predicted: number;
    low: number;
    high: number;
  };
  uncertainty?: {
    p50Low: number;
    p50High: number;
    p80Low: number;
    p80High: number;
  };
  eventShock?: {
    level: "normal" | "strong-over" | "wicket" | "collapse" | "chase-pressure";
    label: string;
    liveTrust: number;
    historicalTrust: number;
  };
  predictionStability?: number;
  ensemble: {
    modelCount: number;
    agreement: number;
    signals: string[];
  };
  venue: string | null;
  feedUpdatedAt: string | null;
};

export type LiveScoreMatch = {
  id: string;
  title: string;
  format: string;
  status: string;
  scoreLine: string;
  venue: string | null;
  feedUpdatedAt: string | null;
};

export type LiveMatchesPayload = {
  generatedAt: string;
  source: {
    provider: string;
    url: string;
  };
  feedHealth: {
    providerStatus: "CONNECTED" | "DEGRADED" | "ERROR";
    lastRequestAt: string;
    lastSuccessfulUpdate: string | null;
    matchesReceived: number;
    pagesFetched: number;
    activeMatches: number;
    supportedMatches: number;
    scoreOnlyMatches: number;
    filteredUnsupported: number;
    formatCounts: Record<CricketFormat, number>;
    lastScoreUpdate: string | null;
    httpStatus: string | null;
    errorMessage: string | null;
  };
  liveMatches: LiveMatchPrediction[];
  scoreOnlyMatches: LiveScoreMatch[];
  modelPerformance?: {
    modelVersion: string;
    snapshotCount: number;
    averageConfidence: number;
    averageRangeWidth: number;
    lastSnapshotAt: string | null;
    historicalAccuracy?: number | null;
    scoreMae?: number | null;
    completedPredictions?: number;
    winnerAccuracy?: number | null;
    winnerBrierScore?: number | null;
    predictionStability?: number | null;
    stageMae?: Record<string, number | null>;
    calibration?: number | null;
  };
  error?: string;
};

type EspnCandidateCache = {
  expiresAt: number;
  ids: string[];
};

type FeedFetchResult<T> =
  | { ok: true; value: T; httpStatus: number | null; metrics: FeedMetrics }
  | { ok: false; error: Error; httpStatus: number | null };

type FeedMetrics = {
  matchesReceived: number;
  activeMatches: number;
  pagesFetched: number;
};

type ProviderLiveMatches = {
  predictions: LiveMatchPrediction[];
  scoreOnlyMatches: LiveScoreMatch[];
};

let espnCandidateCache: EspnCandidateCache | null = null;

const FORMAT_CONFIG: Record<
  CricketFormat,
  {
    maxBalls: number;
    baselineRunRate: number;
    parScore: number;
    milestones: number[];
  }
> = {
  t20: {
    maxBalls: 120,
    baselineRunRate: 8.4,
    parScore: 170,
    milestones: [6, 10, 15, 20],
  },
  odi: {
    maxBalls: 300,
    baselineRunRate: 5.5,
    parScore: 285,
    milestones: [10, 20, 25, 30, 35, 40, 45, 50],
  },
  hundred: {
    maxBalls: 100,
    baselineRunRate: 7.8,
    parScore: 140,
    // The Hundred is displayed in five-ball sets, not six-ball overs.
    milestones: [5, 10, 15, 20],
  },
  test: {
    // A Test innings has no fixed end-point. We forecast the current
    // 90-over innings horizon so every live Test retains a useful card.
    maxBalls: 540,
    baselineRunRate: 3.35,
    parScore: 300,
    milestones: [10, 20, 30, 40, 50, 60, 70, 80, 90],
  },
  other: {
    // Keep unknown but active fixtures visible with a conservative
    // short-innings forecast rather than dropping the match from Alpha.
    maxBalls: 120,
    baselineRunRate: 6.8,
    parScore: 135,
    milestones: [6, 10, 15, 20],
  },
};

type SimulationSummary = {
  finalScores: number[];
  nextOverWicketHits: number;
  milestoneScores: Map<number, number[]>;
  battingWins: number;
};

type ModelEstimate = {
  name: string;
  score: number;
  weight: number;
};

type ScoreEnsemble = {
  predicted: number;
  low: number;
  high: number;
  estimates: ModelEstimate[];
  agreement: number;
  range80Low: number;
  range80High: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value);
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(estimates: ModelEstimate[]): number {
  const totalWeight = estimates.reduce((sum, estimate) => sum + estimate.weight, 0);
  if (totalWeight <= 0) return 0;

  return estimates.reduce(
    (sum, estimate) => sum + estimate.score * estimate.weight,
    0,
  ) / totalWeight;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(
    average(values.map((value) => (value - mean) ** 2)),
  );
}

function quantile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return sorted[lower];

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function canonicalize(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeScoreText(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll("\u2215", "/")
    .replaceAll("\uFF65", ".")
    .replaceAll("\u3002", ".")
    .replaceAll("\uFF0E", ".")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatOvers(
  ballsElapsed: number,
  ballsPerOver = 6,
): string {
  const wholeOvers = Math.floor(ballsElapsed / ballsPerOver);
  const balls = ballsElapsed % ballsPerOver;
  return balls === 0 ? `${wholeOvers}` : `${wholeOvers}.${balls}`;
}

function formatScoreLabel(
  score: ParsedScore,
  format: CricketFormat,
  ballsPerOver: number,
): string {
  if (format === "hundred") {
    return `${score.runs}/${score.wickets} - ${score.ballsElapsed} balls`;
  }

  return `${score.runs}/${score.wickets} - ${formatOvers(score.ballsElapsed, ballsPerOver)} overs`;
}

function parseBallsElapsed(text: string, ballsPerOver: number): number | null {
  const normalized = text.replace(/\s+/g, "").replace(",", ".");
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;

  const overs = Number.parseInt(match[1], 10);
  const balls = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (
    Number.isNaN(overs) ||
    Number.isNaN(balls) ||
    balls >= ballsPerOver
  ) {
    return null;
  }

  return overs * ballsPerOver + balls;
}

export function parseScoreText(
  value?: string,
  _format: CricketFormat = "t20",
  ballsPerOver = 6,
): ParsedScore | null {
  void _format;
  if (!value || !value.trim()) return null;

  const normalized = normalizeScoreText(value);
  const scoreMatch = normalized.match(/(\d+)\s*\/\s*(\d+)/);
  const scoreIndex = scoreMatch?.index ?? -1;
  const afterScore =
    scoreIndex >= 0
      ? normalized.slice(scoreIndex + scoreMatch[0].length).trim()
      : normalized;
  const oversText =
    afterScore
      .match(/(\d+(?:\s*[.,]\s*\d+)?)/)?.[1]
      ?.replace(/\s+/g, "")
      .replace(",", ".") ?? "";
  const scoreRuns = scoreMatch ? Number.parseInt(scoreMatch[1], 10) : 0;
  const ballsElapsed = oversText
    ? parseBallsElapsed(oversText, ballsPerOver)
    : null;

  // A score without a valid over is unsafe to project because it resets the
  // simulation to the start of the innings.
  if (!scoreMatch || ballsElapsed === null) return null;

  return {
    runs: scoreRuns,
    wickets: scoreMatch ? Number.parseInt(scoreMatch[2], 10) : 0,
    ballsElapsed,
    oversText,
    display: normalized,
  };
}

export function parseWidgetMatches(payload: unknown): RawWidgetMatch[] {
  const arrayLike = Array.isArray(payload)
    ? payload
    : isObject(payload) && Array.isArray(payload.data)
      ? payload.data
      : isObject(payload) && Array.isArray(payload.matches)
        ? payload.matches
        : [];

  return arrayLike.filter((item): item is RawWidgetMatch => {
    if (!isObject(item)) return false;

    return (
      typeof item.id === "string" &&
      typeof item.u === "string" &&
      typeof item.d === "string" &&
      typeof item.t === "string" &&
      typeof item.s === "string" &&
      typeof item.ms === "string" &&
      typeof item.t1 === "string" &&
      typeof item.t2 === "string"
    );
  });
}

function normalizeFormat(value: string): CricketFormat {
  const normalized = value.trim().toLowerCase();
  if (/hundred|100[\s-]?ball/.test(normalized)) return "hundred";
  if (/\b(?:t[- ]?20i?|twenty[ -]?20)\b/.test(normalized)) return "t20";
  if (/\b(?:odi|od)\b|one[ -]?day|list\s*a/.test(normalized)) return "odi";
  if (/\b(?:test|first[ -]?class|fc|multi[ -]?day)\b/.test(normalized)) return "test";
  return "other";
}

function resolveFormat(raw: RawWidgetMatch): CricketFormat {
  const descriptor = `${raw.t} ${raw.u} ${raw.s}`.toLowerCase();
  if (/hundred|100[\s-]?ball/.test(descriptor) || raw.bpo === 5 || raw.maxBalls === 100) {
    return "hundred";
  }
  const declaredFormat = normalizeFormat(raw.t);
  return raw.t.trim() ? declaredFormat : normalizeFormat(descriptor);
}

function milestoneLabel(format: CricketFormat, checkpoint: number, ballsPerOver: number): string {
  return format === "hundred"
    ? `${checkpoint * ballsPerOver} balls`
    : `${checkpoint} overs`;
}

function formatMilestones(
  format: CricketFormat,
  currentBalls: number,
  maxBalls: number,
  ballsPerOver: number,
): number[] {
  if (format === "t20" || format === "odi" || format === "hundred") {
    return FORMAT_CONFIG[format].milestones;
  }

  const nextTenOverMark = Math.ceil((currentBalls + 1) / (ballsPerOver * 10)) * 10;
  const finalOver = Math.floor(maxBalls / ballsPerOver);
  const marks: number[] = [];
  for (let over = Math.max(10, nextTenOverMark); over <= finalOver; over += 10) {
    marks.push(over);
  }
  return marks;
}

function parseTeamMentionIndex(text: string, raw: RawWidgetMatch): 1 | 2 | null {
  const normalizedText = canonicalize(text);
  if (!normalizedText) return null;

  const candidates: Array<{ index: 1 | 2; names: string[] }> = [
    {
      index: 1,
      names: [raw.t1n ?? "", raw.t1],
    },
    {
      index: 2,
      names: [raw.t2n ?? "", raw.t2],
    },
  ];

  for (const candidate of candidates) {
    for (const name of candidate.names) {
      const canonicalName = canonicalize(name);
      if (canonicalName && normalizedText.includes(canonicalName)) {
        return candidate.index;
      }
    }
  }

  return null;
}

function inferBattingTeamIndex(
  raw: RawWidgetMatch,
  current: ParsedScore,
  completed: ParsedScore | null,
): 1 | 2 {
  const statusText = `${raw.s} ${raw.toss ?? ""}`.trim();
  const normalizedStatus = canonicalize(statusText);
  const mentionedTeam = parseTeamMentionIndex(statusText, raw);

  if (normalizedStatus.includes("need") || normalizedStatus.includes("chase")) {
    if (mentionedTeam) return mentionedTeam;
  }

  if (normalizedStatus.includes("opttobowl") || normalizedStatus.includes("choosetobowl")) {
    if (mentionedTeam) return mentionedTeam === 1 ? 2 : 1;
  }

  if (normalizedStatus.includes("opttobat") || normalizedStatus.includes("choosetobat")) {
    if (mentionedTeam) return mentionedTeam;
  }

  if (completed) {
    const completedMention = parseTeamMentionIndex(raw.s, raw);
    if (completedMention) {
      return completedMention === 1 ? 2 : 1;
    }
  }

  if (current && current.ballsElapsed > 0) {
    return mentionedTeam ?? 1;
  }

  return mentionedTeam ?? 1;
}

function parseRunsNeededFromStatus(status: string): number | null {
  const needMatch = status.match(
    /(?:need|requires?)(?:\s+another)?\s+(\d+)\s+runs?/i,
  );
  if (needMatch) return Number.parseInt(needMatch[1], 10);

  return null;
}

function parseTargetFromStatus(status: string): number | null {
  const match = status.match(/\btarget\s*[:=-]?\s*(\d+)\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseBallsRemainingFromStatus(status: string): number | null {
  const match = status.match(
    /(?:(?:in|from)\s+(\d+)\s+balls?|(?:with\s+)?(\d+)\s+balls?\s+remaining)/i,
  );
  return match ? Number.parseInt(match[1] ?? match[2], 10) : null;
}

function parseScheduledBalls(
  status: string,
  format: CricketFormat,
  ballsPerOver: number,
): number {
  const defaultMaxBalls = FORMAT_CONFIG[format].maxBalls;
  const patterns = [
    /\b(\d{1,2})\s*overs?\s+(?:a\s+side\s+)?(?:game|match)\b/i,
    /\breduced\s+to\s+(\d{1,2})\s*overs?\b/i,
  ];

  for (const pattern of patterns) {
    const match = status.match(pattern);
    if (!match) continue;

    const overs = Number.parseInt(match[1], 10);
    const balls = overs * ballsPerOver;
    if (balls > 0 && balls <= defaultMaxBalls) {
      return balls;
    }
  }

  return defaultMaxBalls;
}

function parseVenue(raw: RawWidgetMatch): string | null {
  const venueMatch = raw.s.match(/\bat\s+([^,]+?)(?:\s+need|\s+won|\s+opt|\s+to\b|,|$)/i);
  return venueMatch?.[1]?.trim() ?? null;
}

/**
 * Small, deliberately conservative venue prior. The live feed does not yet
 * provide a historical venue table, so only well-known scoring tendencies
 * receive a bounded adjustment; unknown grounds stay at the format baseline.
 */
function venueRunRateMultiplier(format: CricketFormat, venue: string | null | undefined): number {
  if (!venue || format === "test" || format === "other") return 1;
  const name = canonicalize(venue);
  const highScoring = [
    "wankhede",
    "eden gardens",
    "narendramodi",
    "brisbane",
    "centurion",
    "wanderers",
    "arun jaitley",
  ].some((ground) => name.includes(canonicalize(ground)));
  const lowScoring = [
    "chepauk",
    "ekana",
    "sawai mansingh",
    "greenfield",
    "cardiff",
    "grange",
  ].some((ground) => name.includes(canonicalize(ground)));
  if (highScoring) return format === "t20" || format === "hundred" ? 1.06 : 1.035;
  if (lowScoring) return format === "t20" || format === "hundred" ? 0.95 : 0.97;
  return 1;
}

type EventShock = {
  level: "normal" | "strong-over" | "wicket" | "collapse" | "chase-pressure";
  label: string;
  liveTrust: number;
  historicalTrust: number;
};

function detectEventShock(params: {
  format: CricketFormat;
  currentBalls: number;
  maxBalls: number;
  currentRuns: number;
  target: number | null;
  recentRunRate?: number;
  recentWickets?: number;
}): EventShock {
  const baseline = FORMAT_CONFIG[params.format].baselineRunRate;
  const recentRate = params.recentRunRate ?? baseline;
  const wickets = params.recentWickets ?? 0;
  const liveTrust = clamp(
    0.2 + (params.currentBalls / Math.max(params.maxBalls, 1)) * 0.68,
    0.2,
    0.88,
  );
  if (wickets >= 2) {
    return {
      level: "collapse",
      label: "Rapid wicket correction",
      liveTrust: clamp(liveTrust + 0.1, 0, 0.95),
      historicalTrust: clamp(1 - liveTrust - 0.1, 0.05, 0.8),
    };
  }
  if (wickets === 1) {
    return {
      level: "wicket",
      label: "Wicket resource adjustment",
      liveTrust: clamp(liveTrust + 0.06, 0, 0.94),
      historicalTrust: clamp(1 - liveTrust - 0.06, 0.05, 0.8),
    };
  }
  if (recentRate >= baseline * 1.55 || (recentRate > 0 && recentRate <= baseline * 0.45)) {
    return {
      level: "strong-over",
      label: recentRate >= baseline ? "Strong over detected" : "Quiet over detected",
      liveTrust: clamp(liveTrust + 0.04, 0, 0.92),
      historicalTrust: clamp(1 - liveTrust - 0.04, 0.08, 0.8),
    };
  }
  if (params.target !== null && params.currentBalls < params.maxBalls) {
    const remaining = params.maxBalls - params.currentBalls;
    const requiredRate = (params.target - params.currentRuns) / (remaining / Math.max(ballsPerOverForFormat(params.format), 1));
    if (requiredRate > baseline * 1.35 || requiredRate < baseline * 0.55) {
      return {
        level: "chase-pressure",
        label: "Chase pressure adjustment",
        liveTrust: clamp(liveTrust + 0.05, 0, 0.93),
        historicalTrust: clamp(1 - liveTrust - 0.05, 0.07, 0.8),
      };
    }
  }
  return {
    level: "normal",
    label: "Normal live weighting",
    liveTrust,
    historicalTrust: 1 - liveTrust,
  };
}

function ballsPerOverForFormat(format: CricketFormat): number {
  return format === "hundred" ? 5 : 6;
}

function baseProfile(
  format: CricketFormat,
  ballsElapsed: number,
  maxBalls: number,
) {
  const isShortFormat = format === "t20" || format === "hundred";
  const powerplayCutoff = maxBalls * (isShortFormat ? 0.3 : 0.2);
  const deathCutoff = maxBalls * (isShortFormat ? 0.75 : 0.8);

  if (ballsElapsed < powerplayCutoff) {
    return isShortFormat
      ? { dot: 0.28, one: 0.32, two: 0.11, three: 0.01, four: 0.17, six: 0.07, wicket: 0.04 }
      : { dot: 0.3, one: 0.36, two: 0.1, three: 0.01, four: 0.13, six: 0.03, wicket: 0.07 };
  }

  if (ballsElapsed < deathCutoff) {
    return isShortFormat
      ? { dot: 0.32, one: 0.3, two: 0.1, three: 0.01, four: 0.16, six: 0.04, wicket: 0.07 }
      : { dot: 0.37, one: 0.31, two: 0.1, three: 0.01, four: 0.13, six: 0.02, wicket: 0.06 };
  }

  return isShortFormat
    ? { dot: 0.21, one: 0.26, two: 0.08, three: 0.01, four: 0.24, six: 0.13, wicket: 0.07 }
    : { dot: 0.24, one: 0.25, two: 0.08, three: 0.01, four: 0.22, six: 0.08, wicket: 0.12 };
}

function createSeededRandom(seedText: string) {
  let seed = 0x811c9dc5;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 0x01000193);
  }

  return function random() {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleBallOutcome(params: {
  format: CricketFormat;
  ballsElapsed: number;
  wickets: number;
  runs: number;
  target: number | null;
  maxBalls: number;
  ballsPerOver: number;
  recentRunRate?: number;
  recentWickets?: number;
  battingStrikeRate?: number;
  bowlerEconomy?: number;
  random: () => number;
}): { runs: number; wicket: boolean } {
  const profile = baseProfile(
    params.format,
    params.ballsElapsed,
    params.maxBalls,
  );
  const config = FORMAT_CONFIG[params.format];
  const referenceRunsPerBall = params.target
    ? params.target && params.maxBalls > params.ballsElapsed
      ? Math.max(
          0,
          (params.target - params.runs) /
            (params.maxBalls - params.ballsElapsed),
        )
      : config.baselineRunRate / params.ballsPerOver
    : params.ballsElapsed > 0
      ? params.runs / params.ballsElapsed
      : 0;

  const pressure = clamp(
    (referenceRunsPerBall - config.baselineRunRate / params.ballsPerOver) /
      (config.baselineRunRate / params.ballsPerOver),
    -0.5,
    1.2,
  );
  const phase = params.ballsElapsed / params.maxBalls;
  const wicketsLoad = clamp(params.wickets / 7, 0, 1);
  const chaseHeat = params.target
    ? clamp((params.target - params.runs) / Math.max(params.target, 1), 0, 1)
    : 0;
  const baselineRunsPerBall = config.baselineRunRate / params.ballsPerOver;
  const liveRates = [
    params.recentRunRate === undefined
      ? null
      : params.recentRunRate / params.ballsPerOver,
    params.battingStrikeRate === undefined
      ? null
      : params.battingStrikeRate / 100,
    params.bowlerEconomy === undefined
      ? null
      : params.bowlerEconomy / params.ballsPerOver,
  ].filter((value): value is number => value !== null && Number.isFinite(value));
  // Keep the calibration bounded: live form should refine the base profile,
  // never replace it after a single unusually expensive over.
  const liveForm = liveRates.length
    ? clamp((average(liveRates) - baselineRunsPerBall) / baselineRunsPerBall, -0.28, 0.32)
    : 0;
  const recentWicketPressure = clamp((params.recentWickets ?? 0) * 0.06, 0, 0.24);

  const adjusted = {
    dot: profile.dot * (1 + pressure * 0.35 + wicketsLoad * 0.1 - phase * 0.08 - liveForm * 0.22),
    one: profile.one * (1 - pressure * 0.05 + phase * 0.04),
    two: profile.two * (1 - pressure * 0.03 + phase * 0.02),
    three: profile.three * (1 - pressure * 0.02),
    four: profile.four * (1 + pressure * 0.28 + phase * 0.14 + chaseHeat * 0.08 + liveForm * 0.42),
    six: profile.six * (1 + pressure * 0.35 + phase * 0.18 + chaseHeat * 0.1 + liveForm * 0.5),
    wicket:
      profile.wicket * (1 + Math.max(pressure, 0) * 0.45 + wicketsLoad * 0.22 + phase * 0.16 + recentWicketPressure - liveForm * 0.14),
  };

  const weights = [
    [0, Math.max(0.001, adjusted.dot), false],
    [1, Math.max(0.001, adjusted.one), false],
    [2, Math.max(0.001, adjusted.two), false],
    [3, Math.max(0.001, adjusted.three), false],
    [4, Math.max(0.001, adjusted.four), false],
    [6, Math.max(0.001, adjusted.six), false],
    [0, Math.max(0.001, adjusted.wicket), true],
  ] as const;

  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = params.random() * total;

  for (const [runs, weight, wicket] of weights) {
    cursor -= weight;
    if (cursor <= 0) {
      return { runs, wicket };
    }
  }

  return { runs: 1, wicket: false };
}

function simulateMatch(params: {
  format: CricketFormat;
  currentRuns: number;
  currentWickets: number;
  currentBalls: number;
  maxBalls: number;
  ballsPerOver: number;
  target: number | null;
  recentRunRate?: number;
  recentWickets?: number;
  battingStrikeRate?: number;
  bowlerEconomy?: number;
  simCount: number;
  seed: string;
}) {
  const config = FORMAT_CONFIG[params.format];
  const milestoneBalls = formatMilestones(
    params.format,
    params.currentBalls,
    params.maxBalls,
    params.ballsPerOver,
  )
    .filter(
      (over) =>
        over * params.ballsPerOver > params.currentBalls &&
        over * params.ballsPerOver <= params.maxBalls,
    )
    .map((over) => over * params.ballsPerOver);

  const milestoneScores = new Map<number, number[]>(
    milestoneBalls.map((balls) => [balls, []]),
  );
  const finalScores: number[] = [];
  let battingWins = 0;
  let wicketByNextOverHits = 0;
  const random = createSeededRandom(params.seed);

  for (let iteration = 0; iteration < params.simCount; iteration += 1) {
    let runs = params.currentRuns;
    let wickets = params.currentWickets;
    let balls = params.currentBalls;
    const captured = new Set<number>();
    let nextOverWicket = false;

    while (balls < params.maxBalls && wickets < 10) {
      const outcome = sampleBallOutcome({
        format: params.format,
        ballsElapsed: balls,
        wickets,
        runs,
        target: params.target,
        maxBalls: params.maxBalls,
        ballsPerOver: params.ballsPerOver,
        recentRunRate: params.recentRunRate,
        recentWickets: params.recentWickets,
        battingStrikeRate: params.battingStrikeRate,
        bowlerEconomy: params.bowlerEconomy,
        random,
      });

      balls += 1;
      runs += outcome.runs;
      if (outcome.wicket) {
        wickets += 1;
        if (balls - params.currentBalls <= params.ballsPerOver * 2) {
          nextOverWicket = true;
        }
      }

      for (const milestone of milestoneBalls) {
        if (balls >= milestone && !captured.has(milestone)) {
          milestoneScores.get(milestone)?.push(runs);
          captured.add(milestone);
        }
      }

      if (params.target && runs >= params.target) {
        break;
      }
    }

    for (const milestone of milestoneBalls) {
      if (!captured.has(milestone)) {
        milestoneScores.get(milestone)?.push(runs);
      }
    }

    finalScores.push(runs);

    if (params.target) {
      if (runs >= params.target) battingWins += 1;
    } else if (
      runs >= config.parScore * (params.maxBalls / config.maxBalls)
    ) {
      battingWins += 1;
    }

    if (nextOverWicket) wicketByNextOverHits += 1;
  }

  return {
    finalScores,
    battingWins,
    wicketByNextOverHits,
    milestoneScores,
  } satisfies SimulationSummary;
}

function capProjectedScore(
  score: number,
  currentRuns: number,
  target: number | null,
): number {
  return clamp(score, currentRuns, target ?? Number.POSITIVE_INFINITY);
}

function buildModelEstimates(params: {
  format: CricketFormat;
  currentRuns: number;
  currentWickets: number;
  currentBalls: number;
  maxBalls: number;
  ballsPerOver: number;
  horizonBalls: number;
  target: number | null;
  simulationMedian: number;
  recentRunRate?: number;
  recentWickets?: number;
  battingStrikeRate?: number;
  bowlerEconomy?: number;
  venue?: string | null;
}): ModelEstimate[] {
  const config = FORMAT_CONFIG[params.format];
  const isShortFormat = params.format === "t20" || params.format === "hundred";
  const remainingBalls = Math.max(0, params.horizonBalls - params.currentBalls);
  const venueMultiplier = venueRunRateMultiplier(params.format, params.venue);
  const baselineRunsPerBall =
    (config.baselineRunRate * venueMultiplier) / params.ballsPerOver;
  const currentRunsPerBall =
    params.currentBalls > 0
      ? params.currentRuns / params.currentBalls
      : baselineRunsPerBall;
  const progress = clamp(params.currentBalls / params.maxBalls, 0, 1);
  const observationWeight = clamp(
    params.currentBalls /
      (params.format === "odi" ? 180 : params.format === "hundred" ? 60 : 72),
    0.18,
    0.78,
  );
  const rateTrend =
    currentRunsPerBall * observationWeight +
    baselineRunsPerBall * (1 - observationWeight);
  const wicketsRemaining = 10 - params.currentWickets;
  const wicketStability = clamp(0.72 + wicketsRemaining * 0.028, 0.72, 1);
  const phaseBoost =
    1 + progress * (params.format === "odi" ? 0.11 : 0.2);
  const requiredRunsPerBall =
    params.target && params.maxBalls > params.currentBalls
      ? Math.max(
          0,
          (params.target - params.currentRuns) /
            (params.maxBalls - params.currentBalls),
        )
      : null;
  const chaseAdjustedRate = (naturalRate: number) =>
    requiredRunsPerBall === null
      ? naturalRate
      : naturalRate * 0.68 +
        Math.min(requiredRunsPerBall, naturalRate * 1.7) * 0.32;
  const project = (runsPerBall: number, stability = 1) =>
    capProjectedScore(
      params.currentRuns + remainingBalls * runsPerBall * stability,
      params.currentRuns,
      params.target,
    );
  // A Bayesian rate prior prevents a short burst (or a single quiet over)
  // from dominating the forecast. The prior contributes a format-specific
  // sample of historical balls and is gradually replaced by observed live
  // scoring as the innings progresses.
  const priorBalls = params.format === "t20"
    ? 24
    : params.format === "hundred"
      ? 20
      : params.format === "odi"
        ? 48
        : 60;
  const smoothedRate =
    (params.currentRuns + baselineRunsPerBall * priorBalls) /
    Math.max(params.currentBalls + priorBalls, 1);
  const estimates: ModelEstimate[] = [
    {
      name: "Monte Carlo",
      score: params.simulationMedian,
      weight: 0.4,
    },
    {
      name: "Rate trend",
      score: project(chaseAdjustedRate(rateTrend), wicketStability),
      weight: 0.2,
    },
    {
      name: "Wicket resources",
      score: project(
        chaseAdjustedRate(baselineRunsPerBall * phaseBoost),
        clamp(wicketStability - params.currentWickets * 0.012, 0.62, 1),
      ),
      weight: 0.16,
    },
    {
      name: "Bayesian rate",
      score: project(
        chaseAdjustedRate(smoothedRate),
        clamp(wicketStability - params.currentWickets * 0.008, 0.68, 1),
      ),
      weight: 0.12,
    },
    {
      name: "Venue prior",
      score: project(
        chaseAdjustedRate(baselineRunsPerBall * (1 + (venueMultiplier - 1) * 0.8)),
        wicketStability,
      ),
      weight: venueMultiplier === 1 ? 0.04 : 0.08,
    },
  ];

  // Anchor every format to the observed innings pace. The historical prior
  // remains useful early, but once enough legal balls are available this
  // prevents the ensemble from drifting far away from the live score.
  const paceEvidence = clamp(
    params.currentBalls / Math.max(params.maxBalls * 0.5, 1),
    0.15,
    0.82,
  );
  let anchoredRate =
    currentRunsPerBall * paceEvidence +
    baselineRunsPerBall * (1 - paceEvidence);
  if (params.recentRunRate !== undefined) {
    anchoredRate =
      anchoredRate * 0.7 +
      (params.recentRunRate / params.ballsPerOver) * 0.3;
  }
  estimates.push({
    name: "Live pace anchor",
    score: project(
      chaseAdjustedRate(anchoredRate),
      clamp(wicketStability - params.currentWickets * 0.012, 0.62, 1),
    ),
    weight: 0.14,
  });

  if (isShortFormat) {
    const startProgress = clamp(params.currentBalls / params.maxBalls, 0, 1);
    const endProgress = clamp(params.horizonBalls / params.maxBalls, startProgress, 1);
    const segments = [
      { start: 0, end: 0.3, rate: 1.03 },
      { start: 0.3, end: 0.75, rate: 0.92 },
      { start: 0.75, end: 1, rate: 1.18 },
    ];
    const coveredProgress = Math.max(endProgress - startProgress, 0.001);
    const phaseMultiplier = segments.reduce((sum, segment) => {
      const overlap = Math.max(
        0,
        Math.min(endProgress, segment.end) - Math.max(startProgress, segment.start),
      );
      return sum + (overlap / coveredProgress) * segment.rate;
    }, 0);
    const liveEvidence = clamp(
      params.currentBalls / Math.max(params.maxBalls * 0.55, 1),
      0,
      0.88,
    );
    let livePace =
      currentRunsPerBall * liveEvidence +
      baselineRunsPerBall * (1 - liveEvidence);
    if (params.recentRunRate !== undefined) {
      const recentRunsPerBall = params.recentRunRate / params.ballsPerOver;
      livePace = livePace * 0.55 + recentRunsPerBall * 0.45;
    }
    const resourceFactor = clamp(
      1 -
        params.currentWickets * 0.03 -
        (params.recentWickets ?? 0) * 0.025,
      0.62,
      1,
    );

    estimates.push({
      name: params.format === "t20" ? "T20 phase model" : "100-ball phase model",
      score: project(
        chaseAdjustedRate(livePace * phaseMultiplier),
        resourceFactor,
      ),
      weight: 0.2,
    });
  }

  if (params.recentRunRate !== undefined) {
    const recentRunsPerBall = params.recentRunRate / params.ballsPerOver;
    const recentWicketPenalty = clamp(
      1 - (params.recentWickets ?? 0) * 0.055,
      0.7,
      1,
    );
    estimates.push({
      name: "Momentum",
      score: project(
        chaseAdjustedRate(recentRunsPerBall * 0.64 + rateTrend * 0.36),
        recentWicketPenalty,
      ),
      weight: 0.07,
    });
  }

  if (
    params.battingStrikeRate !== undefined ||
    params.bowlerEconomy !== undefined
  ) {
    const matchupRates = [
      params.battingStrikeRate !== undefined
        ? params.battingStrikeRate / 100
        : null,
      params.bowlerEconomy !== undefined
        ? params.bowlerEconomy / params.ballsPerOver
        : null,
      rateTrend,
    ].filter((value): value is number => value !== null);
    estimates.push({
      name: "Player matchup",
      score: project(
        chaseAdjustedRate(average(matchupRates)),
        wicketStability,
      ),
      weight: 0.05,
    });
  }

  const liveTrust = clamp(0.2 + progress * 0.68, 0.2, 0.88);
  const historicalTrust = 1 - liveTrust;
  estimates.forEach((estimate) => {
    if (estimate.name === "Bayesian rate" || estimate.name === "Wicket resources") {
      estimate.weight *= 0.76 + historicalTrust * 0.42;
    } else if (
      estimate.name === "Rate trend" ||
      estimate.name === "Live pace anchor" ||
      estimate.name === "Momentum" ||
      estimate.name === "Player matchup"
    ) {
      estimate.weight *= 0.72 + liveTrust * 0.6;
    }
  });

  return estimates;
}

function buildScoreEnsemble(params: {
  format: CricketFormat;
  currentRuns: number;
  currentWickets: number;
  currentBalls: number;
  maxBalls: number;
  ballsPerOver: number;
  horizonBalls: number;
  target: number | null;
  simulationValues: number[];
  recentRunRate?: number;
  recentWickets?: number;
  battingStrikeRate?: number;
  bowlerEconomy?: number;
  venue?: string | null;
}): ScoreEnsemble {
  if (
    params.currentWickets >= 10 ||
    params.currentBalls >= params.maxBalls ||
    (params.target !== null && params.currentRuns >= params.target)
  ) {
    return {
      predicted: params.currentRuns,
      low: params.currentRuns,
      high: params.currentRuns,
      estimates: [
        { name: "Official innings total", score: params.currentRuns, weight: 1 },
      ],
      agreement: 100,
      range80Low: params.currentRuns,
      range80High: params.currentRuns,
    };
  }

  const simulationMedian = quantile(params.simulationValues, 0.5);
  const estimates = buildModelEstimates({
    ...params,
    simulationMedian,
  });

  if (params.horizonBalls <= params.currentBalls) {
    return {
      predicted: params.currentRuns,
      low: params.currentRuns,
      high: params.currentRuns,
      estimates,
      agreement: 96,
      range80Low: params.currentRuns,
      range80High: params.currentRuns,
    };
  }

  const consensus = capProjectedScore(
    weightedAverage(estimates),
    params.currentRuns,
    params.target,
  );
  const disagreement = standardDeviation(estimates.map(({ score }) => score));
  const projectedRuns = Math.max(consensus - params.currentRuns, 1);
  const agreement = clamp(
    round(96 - (disagreement / projectedRuns) * 80),
    45,
    96,
  );
  const modelBand = disagreement * 1.15 + (params.format === "t20" ? 2 : 4);
  const simulationLow = quantile(params.simulationValues, 0.25);
  const simulationHigh = quantile(params.simulationValues, 0.75);
  const low = capProjectedScore(
    Math.min(simulationLow, consensus - modelBand),
    params.currentRuns,
    params.target,
  );
  const high = capProjectedScore(
    Math.max(simulationHigh, consensus + modelBand),
    params.currentRuns,
    params.target,
  );
  const uncertaintyBand = modelBand * 1.7 + Math.max(2, disagreement * 0.8);
  const range80Low = capProjectedScore(
    Math.min(quantile(params.simulationValues, 0.1), consensus - uncertaintyBand),
    params.currentRuns,
    params.target,
  );
  const range80High = capProjectedScore(
    Math.max(quantile(params.simulationValues, 0.9), consensus + uncertaintyBand),
    params.currentRuns,
    params.target,
  );

  return {
    predicted: round(consensus),
    low: round(low),
    high: round(high),
    estimates,
    agreement,
    range80Low: round(range80Low),
    range80High: round(range80High),
  };
}

function calculateConfidence(params: {
  format: CricketFormat;
  currentBalls: number;
  maxBalls: number;
  finalScores: number[];
  agreement: number;
  modelCount: number;
}) {
  const spread = quantile(params.finalScores, 0.75) - quantile(params.finalScores, 0.25);
  const remainingFactor = 1 - params.currentBalls / params.maxBalls;
  const simulationConfidence =
    92 -
    spread / (params.format === "t20" ? 2.1 : 2.5) -
    remainingFactor * 11;
  const signalBonus = Math.max(0, params.modelCount - 3) * 1.5;
  const observedOvers = params.currentBalls / Math.max(
    params.format === "hundred" ? 5 : 6,
    1,
  );
  // Reward evidence only as it accumulates. Early innings keep a low ceiling;
  // later overs with consistent model agreement can earn a modest uplift.
  const evidenceBonus = clamp(observedOvers * 0.32, 0, 3.5);
  const consensusBonus = clamp(
    (params.agreement - 72) / 8,
    0,
    2.5,
  ) * clamp(observedOvers / 6, 0, 1);

  return clamp(
    round(
      simulationConfidence * 0.55 +
        params.agreement * 0.45 +
        signalBonus +
        evidenceBonus +
        consensusBonus,
    ),
    48,
    96,
  );
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function calculateEnsembleWinProbability(params: {
  format: CricketFormat;
  currentRuns: number;
  currentWickets: number;
  currentBalls: number;
  maxBalls: number;
  target: number | null;
  simulationProbability: number;
  finalScore: ScoreEnsemble;
}): number {
  if (params.target && params.currentRuns >= params.target) return 100;
  if (
    params.target &&
    (params.currentWickets >= 10 || params.currentBalls >= params.maxBalls)
  ) {
    return 0;
  }

  if (params.target) {
    const remainingBalls = Math.max(params.maxBalls - params.currentBalls, 1);
    const runsNeeded = params.target - params.currentRuns;
    const requiredRunsPerBall = runsNeeded / remainingBalls;
    const ensembleRunsPerBall = Math.max(
      0,
      (params.finalScore.predicted - params.currentRuns) / remainingBalls,
    );
    const scoreSpread = Math.max(
      params.finalScore.high - params.finalScore.low,
    params.format === "t20" ? 8 : 16,
    );
    const scoreProbability = sigmoid(
      (params.finalScore.predicted - params.target + 0.5) /
        (scoreSpread * 0.22),
    );
    const resourceProbability = sigmoid(
      (ensembleRunsPerBall - requiredRunsPerBall) /
        Math.max(0.12, requiredRunsPerBall * 0.18) +
        (10 - params.currentWickets - 5) * 0.12,
    );

    return clamp(
      round(
        (params.simulationProbability * 0.58 +
          scoreProbability * 0.25 +
          resourceProbability * 0.17) *
          100,
      ),
      0,
      100,
    );
  }

  const config = FORMAT_CONFIG[params.format];
  const adjustedPar = config.parScore * (params.maxBalls / config.maxBalls);
  const scoreProbability = sigmoid(
    (params.finalScore.predicted - adjustedPar) /
      (params.format === "t20" ? 11 : 24),
  );

  return clamp(
    round((params.simulationProbability * 0.65 + scoreProbability * 0.35) * 100),
    params.format === "t20" ? 2 : 1,
    params.format === "t20" ? 98 : 99,
  );
}

function scoreForecastsFromSimulations(params: {
  format: CricketFormat;
  currentRuns: number;
  currentWickets: number;
  currentBalls: number;
  maxBalls: number;
  ballsPerOver: number;
  target: number | null;
  milestoneScores: Map<number, number[]>;
  recentRunRate?: number;
  recentWickets?: number;
  battingStrikeRate?: number;
  bowlerEconomy?: number;
  venue?: string | null;
}) {
  if (
    params.currentWickets >= 10 ||
    params.currentBalls >= params.maxBalls ||
    (params.target !== null && params.currentRuns >= params.target)
  ) {
    return [];
  }

  const forecasts = formatMilestones(
    params.format,
    params.currentBalls,
    params.maxBalls,
    params.ballsPerOver,
  )
    .map((over) => {
      const thresholdBalls = over * params.ballsPerOver;
      if (
        thresholdBalls <= params.currentBalls ||
        thresholdBalls > params.maxBalls
      ) {
        return null;
      }

      const values = params.milestoneScores.get(thresholdBalls) ?? [];
      if (!values.length) {
        return null;
      }

      const ensemble = buildScoreEnsemble({
        ...params,
        horizonBalls: thresholdBalls,
        simulationValues: values,
      });

      return {
        over,
        label: milestoneLabel(params.format, over, params.ballsPerOver),
        predicted: ensemble.predicted,
        low: ensemble.low,
        high: ensemble.high,
        range80Low: ensemble.range80Low,
        range80High: ensemble.range80High,
        state: "upcoming",
      } satisfies MilestoneForecast;
    })
    .filter((value): value is MilestoneForecast => value !== null);

  // A cricket total cannot fall at a later checkpoint. Independent model
  // bands can occasionally cross by a run or two when their disagreement
  // changes between horizons, so enforce cumulative-score invariants before
  // the values reach the UI.
  let previousLow = params.currentRuns;
  let previousPredicted = params.currentRuns;
  let previousHigh = params.currentRuns;
  let previousRange80Low = params.currentRuns;
  let previousRange80High = params.currentRuns;
  return forecasts.map((forecast) => {
    const low = Math.max(previousLow, forecast.low);
    const predicted = Math.max(low, previousPredicted, forecast.predicted);
    const high = Math.max(predicted, previousHigh, forecast.high);
    const range80Low = Math.max(previousRange80Low, forecast.range80Low ?? low);
    const range80High = Math.max(predicted, previousRange80High, forecast.range80High ?? high);
    previousLow = low;
    previousPredicted = predicted;
    previousHigh = high;
    previousRange80Low = range80Low;
    previousRange80High = range80High;
    return { ...forecast, low, predicted, high, range80Low, range80High };
  });
}

function currentScoreLabel(
  teamShortName: string,
  score: ParsedScore,
  format: CricketFormat,
  ballsPerOver: number,
) {
  return `${teamShortName} ${formatScoreLabel(score, format, ballsPerOver)}`;
}

function isInningsBreak(raw: RawWidgetMatch): boolean {
  return /\b(?:innings break|innings interval|innings complete|2nd innings pending|2nd_innings_pending)\b/i.test(
    `${raw.ms} ${raw.s}`,
  );
}

/**
 * Turn completed checkpoint totals into a short, cumulative form signal.
 * This is the provider-neutral fallback for feeds that publish checkpoint
 * scores but do not expose ball-by-ball data. The latest segment is included
 * with the current score so a refresh between checkpoints still follows the
 * innings being played instead of reverting to a generic format rate.
 */
function recentSignalsFromActualMilestones(
  raw: RawWidgetMatch,
  currentRuns: number,
  currentWickets: number,
  currentBalls: number,
  ballsPerOver: number,
): Pick<RawWidgetMatch, "recentRunRate" | "recentWickets"> {
  const checkpoints = Object.entries(raw.actualMilestoneScores ?? {})
    .map(([overText, score]) => ({
      balls: Number(overText) * ballsPerOver,
      runs: score.runs,
      wickets: score.wickets,
    }))
    .filter(
      (point) =>
        Number.isFinite(point.balls) &&
        point.balls > 0 &&
        point.balls <= currentBalls &&
        Number.isFinite(point.runs) &&
        Number.isFinite(point.wickets),
    )
    .sort((left, right) => left.balls - right.balls);

  const latest = checkpoints.at(-1);
  if (!latest || currentBalls > latest.balls) {
    checkpoints.push({
      balls: currentBalls,
      runs: currentRuns,
      wickets: currentWickets,
    });
  }

  const segments: Array<{ runs: number; balls: number; wickets: number }> = [];
  for (let index = 1; index < checkpoints.length; index += 1) {
    const previous = checkpoints[index - 1];
    const current = checkpoints[index];
    const balls = current.balls - previous.balls;
    const runs = current.runs - previous.runs;
    if (balls <= 0 || runs < 0) continue;
    segments.push({
      runs,
      balls,
      wickets: Math.max(0, current.wickets - previous.wickets),
    });
  }

  const recent = segments.slice(-3);
  if (!recent.length) return {};
  const balls = recent.reduce((sum, segment) => sum + segment.balls, 0);
  const runs = recent.reduce((sum, segment) => sum + segment.runs, 0);
  const wickets = recent.reduce((sum, segment) => sum + segment.wickets, 0);
  if (balls <= 0) return {};

  return {
    recentRunRate: (runs / balls) * ballsPerOver,
    recentWickets: wickets,
  };
}

export function buildLivePrediction(raw: RawWidgetMatch): LiveMatchPrediction | null {
  const format = resolveFormat(raw);

  const ballsPerOver = clamp(round(raw.bpo ?? 6), 1, 12);
  const scheduledMaxBalls =
    raw.maxBalls ?? parseScheduledBalls(raw.s, format, ballsPerOver);
  const normalizeHundredScore = (score: ParsedScore | null) => {
    if (
      format !== "hundred" ||
      !score ||
      score.ballsElapsed <= scheduledMaxBalls ||
      !/^\d+$/.test(score.oversText)
    ) {
      return score;
    }

    const reportedBalls = Number(score.oversText);
    return reportedBalls <= scheduledMaxBalls
      ? { ...score, ballsElapsed: reportedBalls, oversText: String(reportedBalls) }
      : score;
  };
  const firstScore = normalizeHundredScore(
    parseScoreText(raw.t1s, format, ballsPerOver),
  );
  const secondScore = normalizeHundredScore(
    parseScoreText(raw.t2s, format, ballsPerOver),
  );

  let current = firstScore ?? secondScore;
  let completed = firstScore && secondScore ? secondScore : null;
  let pendingBattingTeamIndex: 1 | 2 | null = null;

  // The feed normally puts the active innings first. If it instead returns a
  // completed first score and an unfinished second score, select the latter.
  if (
    firstScore &&
    secondScore &&
    (firstScore.wickets >= 10 || firstScore.ballsElapsed >= scheduledMaxBalls) &&
    secondScore.wickets < 10 &&
    secondScore.ballsElapsed < scheduledMaxBalls
  ) {
    current = secondScore;
    completed = firstScore;
  }

  if (!current && isActiveLiveStatus(raw)) {
    current = {
      runs: 0,
      wickets: 0,
      ballsElapsed: 0,
      oversText: "0",
      display: "0/0 0",
    };
  }

  if (!current) return null;

  if (isInningsBreak(raw) && !secondScore) {
    completed = current;
    const firstInningsTeam = raw.battingTeamIndex ?? inferBattingTeamIndex(raw, current, null);
    pendingBattingTeamIndex = firstInningsTeam === 1 ? 2 : 1;
    current = {
      runs: 0,
      wickets: 0,
      ballsElapsed: 0,
      oversText: "0",
      display: "0/0 0",
    };
  }

  const title = `${raw.t1n ?? raw.t1} vs ${raw.t2n ?? raw.t2}`;
  const currentBalls = current.ballsElapsed;
  const currentRuns = current.runs;
  const currentWickets = current.wickets;
  const currentRunRate =
    currentBalls > 0
      ? currentRuns / (currentBalls / ballsPerOver)
      : 0;
  const derivedRecentSignals = recentSignalsFromActualMilestones(
    raw,
    currentRuns,
    currentWickets,
    currentBalls,
    ballsPerOver,
  );
  // Prefer provider ball-by-ball form, then checkpoint deltas when that is
  // all the feed supplies. This keeps the model anchored to this innings.
  const effectiveRecentRunRate =
    raw.recentRunRate ?? derivedRecentSignals.recentRunRate;
  const effectiveRecentWickets =
    raw.recentWickets ?? derivedRecentSignals.recentWickets;

  const runsNeeded = parseRunsNeededFromStatus(raw.s);
  const statedTarget = parseTargetFromStatus(raw.s);
  const hasPriorInnings = completed !== null;
  const hasChaseStatus = /\b(?:need|require|chase)\b/i.test(raw.s);
  const isLimitedOversChase =
    format !== "test" &&
    (hasPriorInnings ||
      raw.inningsNumber !== undefined && raw.inningsNumber > 1 ||
      runsNeeded !== null ||
      statedTarget !== null ||
      hasChaseStatus);
  const isExplicitTestChase =
    format !== "test"
      ? isLimitedOversChase
      : raw.inningsNumber === 4 ||
        runsNeeded !== null ||
        hasChaseStatus;
  // In Tests, a previous innings total is not a chase target. Treat it as a
  // target only for an explicit/fourth-innings chase; otherwise the generic
  // limited-overs fallback incorrectly freezes forecasts at the current
  // score (for example 204-204).
  const target = isExplicitTestChase
    ? raw.target ??
      statedTarget ??
      (runsNeeded
          ? currentRuns + runsNeeded
          : completed
            ? completed.runs + 1
            : null)
    : null;
  const statedBallsRemaining = parseBallsRemainingFromStatus(raw.s);
  const scheduledInningsBalls = statedBallsRemaining
    ? Math.min(scheduledMaxBalls, currentBalls + statedBallsRemaining)
    : scheduledMaxBalls;
  const maxBalls = format === "test"
    ? Math.max(scheduledInningsBalls, currentBalls + 180)
    : Math.max(scheduledInningsBalls, currentBalls);
  const requiredRunRate =
    target && target > currentRuns && currentBalls < maxBalls
      ? (target - currentRuns) /
        ((maxBalls - currentBalls) / ballsPerOver)
      : null;
  const venue = raw.venue ?? parseVenue(raw);
  const eventShock = detectEventShock({
    format,
    currentBalls,
    maxBalls,
    currentRuns,
    target,
    recentRunRate: effectiveRecentRunRate,
    recentWickets: effectiveRecentWickets,
  });

  const battingTeamIndex =
    pendingBattingTeamIndex ??
    raw.battingTeamIndex ??
    inferBattingTeamIndex(raw, current, completed);
  const battingTeam =
    battingTeamIndex === 2 ? raw.t2n ?? raw.t2 : raw.t1n ?? raw.t1;
  const bowlingTeam =
    battingTeamIndex === 2 ? raw.t1n ?? raw.t1 : raw.t2n ?? raw.t2;
  const battingShortName = battingTeamIndex === 2 ? raw.t2 : raw.t1;
  const bowlingShortName = battingTeamIndex === 2 ? raw.t1 : raw.t2;
  const innings: InningsSummary[] = [
    ...(completed
      ? [
          {
            number: 1 as const,
            team: bowlingTeam,
            shortName: bowlingShortName,
            score: formatScoreLabel(completed, format, ballsPerOver),
            isCurrent: false,
            target: null,
          },
        ]
      : []),
    {
      number: completed ? 2 : 1,
      team: battingTeam,
      shortName: battingShortName,
      score: formatScoreLabel(current, format, ballsPerOver),
      isCurrent: true,
      target,
    },
  ];

  const seed = [
    raw.id,
    format,
    currentRuns,
    currentWickets,
    currentBalls,
    target ?? "none",
    battingTeam,
    bowlingTeam,
  ].join("|");

  const simulation = simulateMatch({
    format,
    currentRuns,
    currentWickets,
    currentBalls,
    maxBalls,
    ballsPerOver,
    target,
    recentRunRate: effectiveRecentRunRate,
    recentWickets: effectiveRecentWickets,
    battingStrikeRate: raw.battingStrikeRate,
    bowlerEconomy: raw.bowlerEconomy,
    simCount: format === "odi" ? 1400 : format === "test" ? 300 : format === "other" ? 700 : 1600,
    seed,
  });

  const simDenominator = format === "odi" ? 1400 : format === "test" ? 300 : format === "other" ? 700 : 1600;
  const simulationProbability = simulation.battingWins / simDenominator;
  const finalEnsemble = buildScoreEnsemble({
    format,
    currentRuns,
    currentWickets,
    currentBalls,
    maxBalls,
    ballsPerOver,
    horizonBalls: maxBalls,
    target,
    simulationValues: simulation.finalScores,
    recentRunRate: effectiveRecentRunRate,
    recentWickets: effectiveRecentWickets,
    battingStrikeRate: raw.battingStrikeRate,
    bowlerEconomy: raw.bowlerEconomy,
    venue,
  });
  const battingProbability = calculateEnsembleWinProbability({
    format,
    currentRuns,
    currentWickets,
    currentBalls,
    maxBalls,
    target,
    simulationProbability,
    finalScore: finalEnsemble,
  });

  const confidence = calculateConfidence({
    format,
    currentBalls,
    maxBalls,
    finalScores: simulation.finalScores,
    agreement: finalEnsemble.agreement,
    modelCount: finalEnsemble.estimates.length,
  });

  const liveScoreForecasts = scoreForecastsFromSimulations({
    format,
    currentRuns,
    currentWickets,
    currentBalls,
    maxBalls,
    ballsPerOver,
    target,
    milestoneScores: simulation.milestoneScores,
    recentRunRate: effectiveRecentRunRate,
    recentWickets: effectiveRecentWickets,
    battingStrikeRate: raw.battingStrikeRate,
    bowlerEconomy: raw.bowlerEconomy,
    venue,
  });
  const baselineForecastsAll =
    currentBalls > 0
      ? scoreForecastsFromSimulations({
          format,
          currentRuns: 0,
          currentWickets: 0,
          currentBalls: 0,
          maxBalls,
          ballsPerOver,
          target,
          venue,
          milestoneScores: simulateMatch({
            format,
            currentRuns: 0,
            currentWickets: 0,
            currentBalls: 0,
            maxBalls,
            ballsPerOver,
            target,
            simCount: format === "odi" ? 650 : format === "test" ? 140 : format === "other" ? 350 : 800,
            seed: [
              raw.id,
              format,
              maxBalls,
              ballsPerOver,
              target ?? "none",
              battingTeam,
              "innings-start",
            ].join("|"),
          }).milestoneScores,
        }).map((forecast) => ({
          ...forecast,
          state: "baseline" as const,
        }))
      : [];
  const baselineByOver = new Map(
    baselineForecastsAll.map((forecast) => [forecast.over, forecast]),
  );
  const actualForecasts = Object.entries(raw.actualMilestoneScores ?? {})
    .map(([overText, score]) => {
      const over = Number(overText);
      const baseline = baselineByOver.get(over);
      return {
        over,
        label: milestoneLabel(format, over, ballsPerOver),
        predicted: score.runs,
        low: score.runs,
        high: score.runs,
        predictedLow: baseline?.low,
        predictedHigh: baseline?.high,
        state: "actual" as const,
        actualWickets: score.wickets,
      };
    })
    .filter(
      (forecast) =>
        Number.isFinite(forecast.over) &&
        forecast.over * ballsPerOver <= currentBalls &&
        forecast.over * ballsPerOver <= maxBalls,
    );
  const actualOvers = new Set(actualForecasts.map(({ over }) => over));
  const baselineForecasts = baselineForecastsAll.filter(
    (forecast) => forecast.over * ballsPerOver <= currentBalls && !actualOvers.has(forecast.over),
  );
  const scoreForecasts = [
    ...actualForecasts,
    ...baselineForecasts,
    ...liveScoreForecasts,
  ].sort((left, right) => left.over - right.over);

  const wicketProbability = clamp(
    round((simulation.wicketByNextOverHits / simDenominator) * 100),
    0,
    100,
  );

  return {
    id: raw.id,
    title,
    format,
    formatLabel: raw.t.trim() || format.toUpperCase(),
    status: raw.s,
    liveLabel: currentScoreLabel(battingShortName, current, format, ballsPerOver),
    battingTeam,
    bowlingTeam,
    battingShortName,
    bowlingShortName,
    currentScore: formatScoreLabel(current, format, ballsPerOver),
    currentRuns,
    currentWickets,
    currentBalls,
    ballsPerOver,
    inningsLimitOvers: maxBalls / ballsPerOver,
    currentRunRate,
    requiredRunRate,
    target,
    innings,
    winProbability: {
      battingTeam,
      bowlingTeam,
      battingTeamPercent: battingProbability,
      bowlingTeamPercent: clamp(100 - battingProbability, 0, 100),
    },
    wicketProbability,
    confidence,
    scoreForecasts,
    finalScore: {
      predicted: finalEnsemble.predicted,
      low: finalEnsemble.low,
      high: finalEnsemble.high,
    },
    uncertainty: {
      p50Low: finalEnsemble.low,
      p50High: finalEnsemble.high,
      p80Low: finalEnsemble.range80Low,
      p80High: finalEnsemble.range80High,
    },
    eventShock,
    ensemble: {
      modelCount: finalEnsemble.estimates.length,
      agreement: finalEnsemble.agreement,
      signals: finalEnsemble.estimates.map(({ name }) => name),
    },
    venue: raw.venue ?? parseVenue(raw),
    feedUpdatedAt: raw.feedUpdatedAt ?? null,
  };
}

const ESPN_LIVE_RSS_URL = "https://static.cricinfo.com/rss/livescores.xml";
const ESPN_MATCH_URL = (id: string) =>
  `https://www.espncricinfo.com/ci/engine/match/${id}.json`;
const ESPN_PLAY_BY_PLAY_URL = (id: string, page: number) =>
  `https://site.api.espn.com/apis/site/v2/sports/cricket/8048/playbyplay?event=${id}&page=${page}&limit=500`;
const CRICBUZZ_LIVE_SCORES_URL = "https://www.cricbuzz.com/cricket-match/live-scores";
const CRICBUZZ_OVER_BY_OVER_URL = (id: string) =>
  `https://www.cricbuzz.com/live-cricket-over-by-over/${id}`;
const CRICBUZZ_OVER_PAGINATION_URL = (id: string, inningsId: number, timestamp: number) =>
  `https://www.cricbuzz.com/api/mcenter/over-by-over/${id}/${inningsId}/${timestamp}`;
// EntitySport powers the public live-score widgets used by several Indian
// domestic league sites. Keep the series list explicit and small: each entry
// is a public, structured feed and the response itself contains every active
// match in that competition (no match/record limit is applied here).
const ENTITYSPORT_LIVE_SCORE_URL = (seriesId: number) =>
  `https://wp-1.serprises.com/api/v2/?series_id=${seriesId}&action=get_live_score`;
const ENTITYSPORT_SERIES_IDS = [130136, 130137] as const; // Uttar Pradesh T20, Kerala Cricket League
const LIVE_FEED_TIMEOUT_MS = 8_000;

async function fetchLiveFeed(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_FEED_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function recordString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function recordNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function epochIso(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  // Cricbuzz uses Unix seconds for responseLastUpdated; ESPN commentary uses
  // Unix milliseconds. Accept both so freshness never falls back to 1970.
  const milliseconds = Math.abs(value) < 100_000_000_000 ? value * 1_000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latestCricbuzzInnings(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null;

  const innings = Object.values(value)
    .filter(isObject)
    .sort((left, right) => {
      const leftId = recordNumber(left, "inningsId") ?? 0;
      const rightId = recordNumber(right, "inningsId") ?? 0;
      return leftId - rightId;
    });

  return innings.at(-1) ?? null;
}

function normalizeCricbuzzOvers(value: unknown): string {
  const parsed = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return "0";

  // Some Cricbuzz score payloads encode a completed over as 19.6. Convert
  // that display-only value to the legal 20.0 representation for our parser.
  const whole = Math.floor(parsed);
  const fractional = Math.round((parsed - whole) * 10);
  if (fractional >= 6) return String(whole + Math.floor(fractional / 6));
  return fractional === 0 ? String(whole) : `${whole}.${fractional}`;
}

function cricbuzzScoreText(value: unknown): string {
  const innings = latestCricbuzzInnings(value);
  if (!innings) return "";
  const runs = recordNumber(innings, "runs");
  const wickets = recordNumber(innings, "wickets");
  if (runs === null || wickets === null) return "";
  return `${runs}/${wickets} ${normalizeCricbuzzOvers(innings.overs)}`;
}

type CricbuzzMatchList = {
  typeMatches?: unknown;
  responseLastUpdated?: number;
};

function cricbuzzMatchRecords(payload: unknown): RawWidgetMatch[] {
  if (!isObject(payload) || !Array.isArray(payload.typeMatches)) return [];

  const matches: RawWidgetMatch[] = [];
  for (const typeMatch of payload.typeMatches) {
    if (!isObject(typeMatch) || !Array.isArray(typeMatch.seriesMatches)) continue;
    for (const seriesMatch of typeMatch.seriesMatches) {
      if (!isObject(seriesMatch) || !isObject(seriesMatch.seriesAdWrapper)) continue;
      const wrapper = seriesMatch.seriesAdWrapper;
      const seriesName = recordString(wrapper, "seriesName");
      const seriesMatches = Array.isArray(wrapper.matches) ? wrapper.matches : [];

      for (const item of seriesMatches) {
        if (!isObject(item) || !isObject(item.matchInfo)) continue;
        const info = item.matchInfo;
        const team1 = isObject(info.team1) ? info.team1 : {};
        const team2 = isObject(info.team2) ? info.team2 : {};
        const id = recordString(info, "matchId");
        const team1Name = recordString(team1, "teamName");
        const team2Name = recordString(team2, "teamName");
        if (!id || !team1Name || !team2Name) continue;

        const format = recordString(info, "matchFormat") || recordString(typeMatch, "matchType");
        const matchScore = isObject(item.matchScore) ? item.matchScore : {};
        const t1s = cricbuzzScoreText(matchScore.team1Score);
        const t2s = cricbuzzScoreText(matchScore.team2Score);
        const state = recordString(info, "state") || recordString(info, "stateTitle");
        const status = recordString(info, "status") || recordString(info, "stateTitle") || state;
        const startDate = recordNumber(info, "startDate");
        const battingTeamId = recordString(info, "currBatTeamId");
        const raw: RawWidgetMatch = {
          id: `cricbuzz-${id}`,
          u: `${canonicalize(seriesName)}-${canonicalize(team1Name)}-${canonicalize(team2Name)}`,
          d: startDate !== null ? new Date(startDate).toISOString() : new Date().toISOString(),
          t: format.toLowerCase(),
          s: status,
          ms: state,
          t1: recordString(team1, "teamSName") || team1Name,
          t2: recordString(team2, "teamSName") || team2Name,
          t1n: team1Name,
          t2n: team2Name,
          t1s,
          t2s,
          battingTeamIndex: battingTeamId && battingTeamId === recordString(team1, "teamId")
            ? 1
            : battingTeamId && battingTeamId === recordString(team2, "teamId")
              ? 2
              : undefined,
          venue: isObject(info.venueInfo)
            ? [recordString(info.venueInfo, "ground"), recordString(info.venueInfo, "city")]
                .filter(Boolean)
                .join(", ") || undefined
            : undefined,
        };
        const updatedAt = recordNumber(payload, "responseLastUpdated");
        const updatedIso = epochIso(updatedAt);
        if (updatedIso) raw.feedUpdatedAt = updatedIso;
        matches.push(raw);
      }
    }
  }

  return matches;
}

function decodeCricbuzzNextFlight(html: string): CricbuzzMatchList | null {
  const prefix = '<script>self.__next_f.push([1,"';
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf(prefix, cursor);
    if (start < 0) return null;
    const end = html.indexOf('"])<\/script>', start + prefix.length);
    if (end < 0) return null;

    const raw = html.slice(start + prefix.length, end);
    try {
      const decoded = JSON.parse(`"${raw}"`) as string;
      const marker = '"currentMatchesList":';
      const markerIndex = decoded.indexOf(marker);
      if (markerIndex >= 0) {
        const valueStart = markerIndex + marker.length;
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = valueStart; index < decoded.length; index += 1) {
          const character = decoded[index];
          if (inString) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') inString = false;
            continue;
          }
          if (character === '"') {
            inString = true;
            continue;
          }
          if (character === "{") depth += 1;
          if (character === "}") {
            depth -= 1;
            if (depth === 0) {
              const parsed = JSON.parse(decoded.slice(valueStart, index + 1));
              return isObject(parsed) ? parsed as CricbuzzMatchList : null;
            }
          }
        }
      }
    } catch {
      // Continue scanning the next flight chunk if one chunk is malformed.
    }

    cursor = end + 1;
  }

  return null;
}

function decodeCricbuzzFlightScripts(html: string): string[] {
  const prefix = '<script>self.__next_f.push([1,"';
  const decodedScripts: string[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const start = html.indexOf(prefix, cursor);
    if (start < 0) break;
    const end = html.indexOf('"])<\/script>', start + prefix.length);
    if (end < 0) break;

    const raw = html.slice(start + prefix.length, end);
    try {
      decodedScripts.push(JSON.parse(`"${raw}"`) as string);
    } catch {
      // Ignore malformed flight chunks and continue with the next one.
    }
    cursor = end + 1;
  }

  return decodedScripts;
}

function parseCricbuzzFlightValue(
  decoded: string,
  marker: string,
): unknown | null {
  const markerIndex = decoded.indexOf(marker);
  if (markerIndex < 0) return null;

  const valueStart = markerIndex + marker.length;
  const opening = decoded[valueStart];
  if (opening !== "[" && opening !== "{") return null;
  const closing = opening === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = valueStart; index < decoded.length; index += 1) {
    const character = decoded[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === opening) depth += 1;
    else if (character === closing) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(decoded.slice(valueStart, index + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

type CricbuzzOverSummary = Record<string, unknown>;

type CricbuzzMatchEnhancements = {
  actualMilestoneScores: Record<number, { runs: number; wickets: number }>;
  recentRunRate?: number;
  recentWickets?: number;
};

function parseCricbuzzOverSummaryHtml(html: string): CricbuzzOverSummary[] {
  return decodeCricbuzzFlightScripts(html).flatMap((decoded) => {
    const parsed = parseCricbuzzFlightValue(decoded, '"overSummaryList":');
    return Array.isArray(parsed)
      ? parsed.filter(isObject)
      : [];
  });
}

function milestoneScoresFromCricbuzzOverSummary(
  summaries: CricbuzzOverSummary[],
  raw: RawWidgetMatch,
): Record<number, { runs: number; wickets: number }> {
  const format = resolveFormat(raw);
  const ballsPerOver = clamp(round(raw.bpo ?? (format === "hundred" ? 5 : 6)), 1, 12);
  const maxBalls = raw.maxBalls ?? FORMAT_CONFIG[format].maxBalls;
  const milestones = new Set(
    formatMilestones(format, 0, maxBalls, ballsPerOver),
  );
  const currentTeamIndex = raw.battingTeamIndex;
  const currentTeamNames = currentTeamIndex === 2
    ? [raw.t2n ?? raw.t2, raw.t2]
    : [raw.t1n ?? raw.t1, raw.t1];
  const teamNames = [raw.t1n, raw.t1, raw.t2n, raw.t2]
    .map(canonicalize)
    .filter(Boolean);
  const currentTeamKeys = currentTeamNames.map(canonicalize).filter(Boolean);
  const scores: Record<number, { runs: number; wickets: number }> = {};
  const timestamps: Record<number, number> = {};

  for (const summary of summaries) {
    const over = recordNumber(summary, "overs");
    const runs = recordNumber(summary, "score");
    const wickets = recordNumber(summary, "wickets");
    const timestamp = recordNumber(summary, "timestamp") ?? 0;
    const batTeamKey = canonicalize(recordString(summary, "batTeamName"));
    if (
      over === null ||
      runs === null ||
      wickets === null ||
      !milestones.has(over) ||
      (currentTeamIndex && !currentTeamKeys.includes(batTeamKey)) ||
      (!currentTeamIndex && teamNames.length > 0 && !teamNames.includes(batTeamKey))
    ) {
      continue;
    }

    if (timestamps[over] && timestamps[over] >= timestamp) continue;
    timestamps[over] = timestamp;
    scores[over] = { runs, wickets };
  }

  return scores;
}

function recentSignalsFromCricbuzzOverSummary(
  summaries: CricbuzzOverSummary[],
  raw: RawWidgetMatch,
): Pick<CricbuzzMatchEnhancements, "recentRunRate" | "recentWickets"> {
  const currentTeamIndex = raw.battingTeamIndex;
  const currentTeamNames = currentTeamIndex === 2
    ? [raw.t2n ?? raw.t2, raw.t2]
    : [raw.t1n ?? raw.t1, raw.t1];
  const currentTeamKeys = currentTeamNames.map(canonicalize).filter(Boolean);
  const teamSummaries = summaries.filter((summary) => {
    const batTeamKey = canonicalize(recordString(summary, "batTeamName"));
    return currentTeamKeys.length === 0 || currentTeamKeys.includes(batTeamKey);
  });
  if (teamSummaries.length < 2) return {};

  const latest = [...teamSummaries].sort(
    (left, right) =>
      (recordNumber(right, "timestamp") ?? 0) -
      (recordNumber(left, "timestamp") ?? 0),
  )[0];
  const inningsId = latest ? recordNumber(latest, "inningsId") : null;
  const currentInnings = inningsId === null
    ? teamSummaries
    : teamSummaries.filter((summary) => recordNumber(summary, "inningsId") === inningsId);
  const chronological = currentInnings
    .filter(
      (summary) =>
        recordNumber(summary, "runs") !== null &&
        recordNumber(summary, "wickets") !== null,
    )
    .sort(
      (left, right) =>
        (recordNumber(left, "overs") ?? 0) -
        (recordNumber(right, "overs") ?? 0),
    );
  const recent = chronological.slice(-3);
  if (recent.length < 2) return {};

  const recentRuns = recent.reduce(
    (sum, summary) => sum + (recordNumber(summary, "runs") ?? 0),
    0,
  );
  const firstWickets = recordNumber(recent[0], "wickets") ?? 0;
  const lastWickets = recordNumber(recent.at(-1), "wickets") ?? firstWickets;
  return {
    recentRunRate: recentRuns / recent.length,
    recentWickets: Math.max(0, lastWickets - firstWickets),
  };
}

/**
 * Extract exact completed-over scores from Cricbuzz commentary. The live
 * scores board only carries the current innings total; its match page embeds
 * overSeparator records that let the practice history show the actual score
 * at every completed checkpoint.
 */
export function extractCricbuzzMilestoneScores(
  html: string,
  raw: RawWidgetMatch,
): Record<number, { runs: number; wickets: number }> {
  return milestoneScoresFromCricbuzzOverSummary(
    parseCricbuzzOverSummaryHtml(html),
    raw,
  );
}

export function extractCricbuzzRecentSignals(
  html: string,
  raw: RawWidgetMatch,
): Pick<CricbuzzMatchEnhancements, "recentRunRate" | "recentWickets"> {
  return recentSignalsFromCricbuzzOverSummary(
    parseCricbuzzOverSummaryHtml(html),
    raw,
  );
}

async function fetchCricbuzzMilestoneScores(
  raw: RawWidgetMatch,
): Promise<CricbuzzMatchEnhancements> {
  const matchId = raw.id.replace(/^cricbuzz-/, "");
  if (!/^\d+$/.test(matchId)) return { actualMilestoneScores: {} };

  try {
    const response = await fetchLiveFeed(
      `${CRICBUZZ_OVER_BY_OVER_URL(matchId)}?cb=${Date.now()}`,
      {
        cache: "no-store",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Cache-Control": "no-cache",
          "User-Agent": "Mozilla/5.0 (compatible; AlphaLiveCricket/1.0)",
        },
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return { actualMilestoneScores: {} };
    }

    let summaries = parseCricbuzzOverSummaryHtml(await response.text());
    const scores = milestoneScoresFromCricbuzzOverSummary(summaries, raw);
    const cursors = new Set<string>();

    // The over page renders a recent window first. Walk its cursor endpoint
    // until all older pages are exhausted so 6/10/15/20 (and ODI/Test
    // checkpoints) are available instead of only the latest eleven overs.
    for (let page = 0; page < 32 && summaries.length; page += 1) {
      const last = summaries.at(-1);
      const inningsId = last ? recordNumber(last, "inningsId") : null;
      const timestamp = last ? recordNumber(last, "timestamp") : null;
      if (inningsId === null || timestamp === null) break;

      const cursor = `${inningsId}/${timestamp}`;
      if (cursors.has(cursor)) break;
      cursors.add(cursor);

      const pageResponse = await fetchLiveFeed(
        CRICBUZZ_OVER_PAGINATION_URL(matchId, inningsId, timestamp),
        {
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "Mozilla/5.0 (compatible; AlphaLiveCricket/1.0)",
          },
        },
      );
      if (!pageResponse.ok) {
        await pageResponse.body?.cancel();
        break;
      }

      const pagePayload = await pageResponse.json() as unknown;
      const older = isObject(pagePayload) && Array.isArray(pagePayload.paginatedData)
        ? pagePayload.paginatedData.filter(isObject)
        : [];
      if (!older.length) break;

      summaries = [...summaries, ...older];
      Object.assign(
        scores,
        milestoneScoresFromCricbuzzOverSummary(older, raw),
      );
      if (older.length < 10) break;
    }

    return {
      actualMilestoneScores: scores,
      ...recentSignalsFromCricbuzzOverSummary(summaries, raw),
    };
  } catch {
    return { actualMilestoneScores: {} };
  }
}

export function parseCricbuzzMatchesHtml(html: string): RawWidgetMatch[] {
  const matchList = decodeCricbuzzNextFlight(html);
  return matchList ? cricbuzzMatchRecords(matchList) : [];
}

async function enrichCricbuzzMilestones(
  matches: RawWidgetMatch[],
): Promise<RawWidgetMatch[]> {
  const activeMatches = matches.filter(isActiveLiveStatus);
  if (!activeMatches.length) return matches;

  const enriched = new Map<string, RawWidgetMatch>();
  let nextIndex = 0;
  const workerCount = Math.min(4, activeMatches.length);
  const fetchOne = async (raw: RawWidgetMatch) => {
    try {
      const enhancements = await fetchCricbuzzMilestoneScores(raw);
      const { actualMilestoneScores } = enhancements;
      enriched.set(
        raw.id,
        Object.keys(actualMilestoneScores).length ||
            enhancements.recentRunRate !== undefined ||
            enhancements.recentWickets !== undefined
          ? { ...raw, ...enhancements }
          : raw,
      );
    } catch {
      // Keep the board score if a commentary page is temporarily unavailable.
    }
  };

  const runWorker = async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= activeMatches.length) return;
      await fetchOne(activeMatches[index]);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return matches.map((match) => enriched.get(match.id) ?? match);
}

/**
 * Normalize the public EntitySport/Serprises live-score response used by
 * Indian domestic league score widgets into Alpha's provider-neutral shape.
 * The endpoint returns a response array for the requested series; it is not a
 * paged or top-N result, so every returned match is retained.
 */
export function parseEntitySportLiveMatches(
  payload: unknown,
  fetchedAt = new Date().toISOString(),
): RawWidgetMatch[] {
  if (!isObject(payload) || !Array.isArray(payload.response)) return [];

  const matches: RawWidgetMatch[] = [];
  for (const item of payload.response) {
    if (!isObject(item)) continue;
    const matchId = recordString(item, "match_id");
    const teamA = isObject(item.teama) ? item.teama : {};
    const teamB = isObject(item.teamb) ? item.teamb : {};
    const teamAName = recordString(teamA, "name");
    const teamBName = recordString(teamB, "name");
    if (!matchId || !teamAName || !teamBName) continue;

    const format = recordString(item, "format_str") || recordString(item, "format");
    const status = recordString(item, "status_note") ||
      recordString(item, "status_str") ||
      recordString(item, "game_state_str");
    const startTimestamp = recordNumber(item, "timestamp_start");
    const startIso = epochIso(startTimestamp) ?? recordString(item, "date_start");
    const scoreText = (team: Record<string, unknown>) =>
      recordString(team, "scores_full") ||
      [recordString(team, "scores"), recordString(team, "overs")]
        .filter(Boolean)
        .join(" ");
    const teamAScore = scoreText(teamA);
    const teamBScore = scoreText(teamB);
    const currentTeamIndex: 1 | 2 | undefined =
      /^\s*\*/.test(teamAScore) ? 1 : /^\s*\*/.test(teamBScore) ? 2 : undefined;
    const venueRecord = isObject(item.venue) ? item.venue : {};
    const venue = [
      recordString(venueRecord, "name"),
      recordString(venueRecord, "location"),
      recordString(venueRecord, "country"),
    ].filter(Boolean).join(", ") || undefined;

    matches.push({
      id: `entitysport-${matchId}`,
      u: `${canonicalize(teamAName)}-vs-${canonicalize(teamBName)}-${canonicalize(format)}`,
      d: startIso || fetchedAt,
      t: format,
      s: status,
      ms: recordString(item, "game_state_str") || recordString(item, "status_str"),
      t1: recordString(teamA, "short_name") || teamAName,
      t2: recordString(teamB, "short_name") || teamBName,
      t1n: teamAName,
      t2n: teamBName,
      t1s: teamAScore,
      t2s: teamBScore,
      battingTeamIndex: currentTeamIndex,
      venue,
      target: undefined,
      feedUpdatedAt: fetchedAt,
    });
  }

  return matches;
}

function espnCommentaryItems(payload: unknown): Record<string, unknown>[] {
  if (!isObject(payload) || !isObject(payload.commentary)) return [];
  return Array.isArray(payload.commentary.items)
    ? payload.commentary.items.filter(isObject)
    : [];
}

type EspnInningsSnapshot = {
  runs: number;
  wickets: number;
  balls: number;
  target: number;
  ballLimit: number;
  timestamp: number | null;
  sequence: number;
};

function espnInningsSnapshots(
  payload: unknown,
  inningsNumber: number,
): EspnInningsSnapshot[] {
  return espnCommentaryItems(payload)
    .map((item) => {
      if (!isObject(item.innings)) return null;
      const innings = item.innings;
      const number =
        recordNumber(innings, "number") ?? recordNumber(item, "period");
      const runs = recordNumber(innings, "runs");
      const wickets = recordNumber(innings, "wickets");
      const balls = recordNumber(innings, "balls");

      if (
        number !== inningsNumber ||
        runs === null ||
        wickets === null ||
        balls === null
      ) {
        return null;
      }

      return {
        runs,
        wickets,
        balls,
        target: recordNumber(innings, "target") ?? 0,
        ballLimit: recordNumber(innings, "ballLimit") ?? 0,
        timestamp: recordNumber(item, "bbbTimestamp"),
        sequence: recordNumber(item, "sequence") ?? 0,
      } satisfies EspnInningsSnapshot;
    })
    .filter((snapshot): snapshot is EspnInningsSnapshot => snapshot !== null)
    .sort((left, right) => left.sequence - right.sequence);
}

export function extractEspnMilestoneScores(
  payload: unknown,
  inningsNumber: number,
  milestones: number[],
  ballsPerOver: number,
  maxBalls: number,
): Record<number, { runs: number; wickets: number }> {
  const snapshots = espnInningsSnapshots(payload, inningsNumber);
  const scores: Record<number, { runs: number; wickets: number }> = {};

  for (const over of milestones) {
    const checkpointBalls = over * ballsPerOver;
    if (checkpointBalls > maxBalls) continue;

    const snapshot = snapshots.find(({ balls }) => balls >= checkpointBalls);
    if (snapshot) {
      scores[over] = {
        runs: snapshot.runs,
        wickets: snapshot.wickets,
      };
    }
  }

  return scores;
}

function normalizeEspnFormat(
  match: Record<string, unknown>,
): CricketFormat {
  const descriptor = [
    recordString(match, "international_class_card"),
    recordString(match, "international_class_name"),
    recordString(match, "general_class_card"),
    recordString(match, "general_class_name"),
  ].join(" ");

  if (/\bthe hundred\b|\b100[\s-]?ball\b/i.test(descriptor)) return "hundred";
  if (/\b(?:t[- ]?20i?|twenty[ -]?20)\b/i.test(descriptor)) return "t20";
  if (/\b(?:odi|od)\b|one[ -]?day|list\s*a/i.test(descriptor)) return "odi";
  if (/\b(?:test|first[ -]?class|fc|multi[ -]?day)\b/i.test(descriptor)) return "test";
  return "other";
}

function isEspnMatchComplete(
  payload: Record<string, unknown>,
  match: Record<string, unknown>,
): boolean {
  const live = isObject(payload.live) ? payload.live : {};
  const resultName = recordString(match, "result_name").trim();
  const status = `${recordString(match, "current_summary")} ${recordString(live, "status")}`;

  return (
    Boolean(resultName) ||
    /\bmatch over\b|\bwon by\b|\bno result\b|\babandon(?:ed)?\b/i.test(
      status,
    )
  );
}

function normalizeMatchStatus(raw: RawWidgetMatch): string {
  return `${raw.ms} ${raw.s} ${raw.toss ?? ""}`.replace(/\s+/g, " ").trim().toLowerCase();
}

function isActiveLiveStatus(raw: RawWidgetMatch): boolean {
  const status = normalizeMatchStatus(raw);
  if (!status) return false;

  // Some upstream boards leave a stale `live` marker on a fixture after it
  // has moved back to a scheduled/preview state. Do not turn that into a
  // fabricated 0/0 live card when the provider explicitly says the match has
  // not started yet.
  const hasPublishedScore = Boolean(raw.t1s?.trim() || raw.t2s?.trim());
  if (
    !hasPublishedScore &&
    /\b(?:match\s+starts?|starts?\s+at|scheduled|upcoming|preview)\b/.test(status)
  ) {
    return false;
  }

  if (
    /\b(match over|won by|result|completed|abandoned|cancelled|canceled|no result|drawn)\b/.test(
      status,
    )
  ) {
    return false;
  }

  return (
    /\b(live|in progress|in_progress|current|dormant|innings break|innings interval|2nd innings pending|2nd_innings_pending|break|rain delay|rain_delay|rain affected|delayed|tea|lunch|stumps)\b/.test(
      status,
    ) || raw.ms === "live"
  );
}

function isActiveEspnMatch(payload: unknown): payload is Record<string, unknown> {
  if (!isObject(payload) || !isObject(payload.match)) return false;

  const match = payload.match;
  const status = recordString(match, "match_status").toLowerCase();
  return (
    recordString(match, "live_match") === "Y" &&
    /^(?:current|dormant|live|in[ _-]?progress|innings[ _-]?break|2nd[ _-]?innings[ _-]?pending|rain[ _-]?delay|delayed)$/.test(status) &&
    !isEspnMatchComplete(payload, match)
  );
}

function isPotentialEspnMatch(payload: unknown): payload is Record<string, unknown> {
  return isActiveEspnMatch(payload) && normalizeEspnFormat(payload.match) !== null;
}

function inningsScoreText(innings: Record<string, unknown>): string {
  const runs = recordNumber(innings, "runs") ?? 0;
  const wickets = recordNumber(innings, "wickets") ?? 0;
  const overs = recordString(innings, "overs") || "0";
  return `${runs}/${wickets} ${overs}`;
}

export function buildRawMatchFromEspn(
  payload: unknown,
  id: string,
  playByPlay?: unknown,
): RawWidgetMatch | null {
  if (!isPotentialEspnMatch(payload) || !isObject(payload.match)) return null;

  const match = payload.match;
  let format = normalizeEspnFormat(match);
  const innings = Array.isArray(payload.innings)
    ? payload.innings.filter(isObject)
    : [];
  const team1 = {
    id: recordString(match, "team1_id"),
    name: recordString(match, "team1_name"),
    shortName:
      recordString(match, "team1_abbreviation") ||
      recordString(match, "team1_short_name"),
  };
  const team2 = {
    id: recordString(match, "team2_id"),
    name: recordString(match, "team2_name"),
    shortName:
      recordString(match, "team2_abbreviation") ||
      recordString(match, "team2_short_name"),
  };
  const tossWinnerId = recordString(match, "toss_winner_team_id");
  const tossDecision = recordString(match, "toss_decision_name").toLowerCase();
  const liveInningsNumber = recordNumber(match, "live_innings_number");
  const battedInnings = [...innings]
    .filter((entry) => recordNumber(entry, "batted") === 1)
    .sort(
      (left, right) =>
        (recordNumber(left, "innings_number") ?? 0) -
        (recordNumber(right, "innings_number") ?? 0),
    );
  let current =
    (liveInningsNumber
      ? battedInnings.find(
          (entry) =>
            recordNumber(entry, "innings_number") === liveInningsNumber,
        )
      : undefined) ??
    battedInnings.at(-1) ??
    innings.find((entry) => recordNumber(entry, "live_current") === 1);

  if (
    !current &&
    format &&
    (tossWinnerId === team1.id || tossWinnerId === team2.id) &&
    /^(?:bat|field)$/.test(tossDecision)
  ) {
    const battingTeamId =
      tossDecision === "field"
        ? tossWinnerId === team1.id
          ? team2.id
          : team1.id
        : tossWinnerId;
    const template =
      innings.find(
        (entry) => recordString(entry, "batting_team_id") === battingTeamId,
      ) ?? innings[0];
    const ballsPerOver = template ? recordNumber(template, "bpo") ?? 6 : 6;
    const scheduledOvers =
      recordNumber(match, "scheduled_overs") ??
      FORMAT_CONFIG[format].maxBalls / ballsPerOver;

    current = {
      ...(template ?? {}),
      innings_number: recordNumber(template ?? {}, "innings_number") ?? 1,
      batted: 0,
      batting_team_id: battingTeamId,
      runs: 0,
      wickets: 0,
      balls: 0,
      overs: "0.0",
      target: 0,
      ball_limit:
        recordNumber(template ?? {}, "ball_limit") ||
        scheduledOvers * ballsPerOver,
      bpo: ballsPerOver,
      live_current: 1,
    };
  }

  if (!format || !current) return null;

  // ESPN occasionally labels The Hundred as Twenty20. Its innings data is
  // authoritative: five-ball sets or a 100-ball limit always mean Hundred.
  if (recordNumber(current, "bpo") === 5 || recordNumber(current, "ball_limit") === 100) {
    format = "hundred";
  }

  const currentNumber = recordNumber(current, "innings_number") ?? 1;
  const latestPlay = espnInningsSnapshots(playByPlay, currentNumber).at(-1);
  if (
    latestPlay &&
    latestPlay.balls >= (recordNumber(current, "balls") ?? 0)
  ) {
    const ballsPerOver = recordNumber(current, "bpo") ?? 6;
    current = {
      ...current,
      runs: latestPlay.runs,
      wickets: latestPlay.wickets,
      balls: latestPlay.balls,
      overs: formatOvers(latestPlay.balls, ballsPerOver),
      target: latestPlay.target || recordNumber(current, "target") || 0,
      ball_limit:
        latestPlay.ballLimit || recordNumber(current, "ball_limit") || 0,
    };
  }
  const completed = [...innings]
    .filter(
      (entry) =>
        entry !== current &&
        recordNumber(entry, "batted") === 1 &&
        (recordNumber(entry, "innings_number") ?? 0) < currentNumber,
    )
    .sort(
      (left, right) =>
        (recordNumber(left, "innings_number") ?? 0) -
        (recordNumber(right, "innings_number") ?? 0),
    )
    .at(-1);

  const battingTeamId = recordString(current, "batting_team_id");
  const battingTeam = battingTeamId === team2.id ? team2 : team1;
  const bowlingTeam = battingTeam === team1 ? team2 : team1;
  const ballsPerOver = recordNumber(current, "bpo") ?? 6;
  const scheduledOvers = recordNumber(match, "scheduled_overs") ??
    FORMAT_CONFIG[format].maxBalls / ballsPerOver;
  const maxBalls =
    recordNumber(current, "ball_limit") || scheduledOvers * ballsPerOver;
  const target = recordNumber(current, "target");
  const actualMilestoneScores = extractEspnMilestoneScores(
    playByPlay,
    currentNumber,
    formatMilestones(
      format,
      recordNumber(current, "balls") ?? 0,
      maxBalls,
      ballsPerOver,
    ),
    ballsPerOver,
    maxBalls,
  );
  const live = isObject(payload.live) ? payload.live : {};
  const recentInnings = Array.isArray(live.innings_recent)
    ? live.innings_recent
        .filter(isObject)
        .find(
          (entry) =>
            recordNumber(entry, "innings_number") === currentNumber,
        )
    : undefined;
  const currentBatters = Array.isArray(live.batting)
    ? live.batting
        .filter(isObject)
        .filter(
          (entry) =>
            recordNumber(entry, "innings_number") === currentNumber &&
            [1, 2].includes(recordNumber(entry, "live_current") ?? 0),
        )
    : [];
  const batterStrikeRates = currentBatters
    .map((batter) => {
      const currentStrikeRate = recordNumber(batter, "strike_rate");
      const series = isObject(batter.batting_averages_series)
        ? batter.batting_averages_series
        : {};
      const seriesStrikeRate = recordNumber(series, "batting_strike_rate");
      if (currentStrikeRate !== null && seriesStrikeRate !== null) {
        return currentStrikeRate * 0.6 + seriesStrikeRate * 0.4;
      }
      return currentStrikeRate ?? seriesStrikeRate;
    })
    .filter((value): value is number => value !== null);
  const currentBowler = Array.isArray(live.bowling)
    ? live.bowling
        .filter(isObject)
        .find((entry) => recordNumber(entry, "live_current") === 1)
    : undefined;
  const bowlerSeries =
    currentBowler && isObject(currentBowler.bowling_averages_series)
      ? currentBowler.bowling_averages_series
      : {};
  const currentBowlerEconomy = currentBowler
    ? recordNumber(currentBowler, "economy_rate")
    : null;
  const seriesBowlerEconomy = recordNumber(bowlerSeries, "economy_rate");
  const bowlerEconomy =
    currentBowlerEconomy !== null && seriesBowlerEconomy !== null
      ? currentBowlerEconomy * 0.55 + seriesBowlerEconomy * 0.45
      : currentBowlerEconomy ?? seriesBowlerEconomy;
  const currentSummary = recordString(match, "current_summary");
  const status =
    (/\binnings break\b/i.test(currentSummary) ? currentSummary : "") ||
    recordString(live, "status") ||
    currentSummary ||
    recordString(payload, "description") ||
    "Live";
  const tossWinner = tossWinnerId === team2.id ? team2 : team1;

  return {
    id: `espn-${id}`,
    u: `espn-live-match-${id}`,
    d: recordString(match, "start_datetime_gmt_raw"),
    t: format,
    s: status,
    toss: tossDecision
      ? `${tossWinner.name} opt to ${tossDecision}`
      : undefined,
    ms: "live",
    t1: battingTeam.shortName || battingTeam.name,
    t2: bowlingTeam.shortName || bowlingTeam.name,
    t1n: battingTeam.name,
    t2n: bowlingTeam.name,
    t1s: inningsScoreText(current),
    t2s: completed ? inningsScoreText(completed) : "",
    bpo: ballsPerOver,
    maxBalls,
    target: target && target > 0 ? target : undefined,
    inningsNumber: currentNumber,
    battingTeamIndex: 1,
    venue: recordString(match, "ground_name") || undefined,
    recentRunRate: recentInnings
      ? (recordNumber(recentInnings, "run_rate") ?? undefined)
      : undefined,
    recentWickets: recentInnings
      ? (recordNumber(recentInnings, "wickets") ?? undefined)
      : undefined,
    battingStrikeRate: batterStrikeRates.length
      ? average(batterStrikeRates)
      : undefined,
    bowlerEconomy: bowlerEconomy ?? undefined,
    actualMilestoneScores,
    feedUpdatedAt: epochIso(latestPlay?.timestamp ?? null) ?? undefined,
  };
}

export function extractEspnMatchIds(xml: string): string[] {
  return [
    ...new Set(
      [
        ...xml.matchAll(/<guid>[^<]*\/match\/(\d+)\.html<\/guid>/g),
        ...xml.matchAll(/\/match\/(\d+)(?:\.html)?/g),
      ].map((match) => match[1]),
    ),
  ];
}

function extractEspnOpenScoreIds(payload: unknown): string[] {
  if (!isObject(payload) || !isObject(payload.other_scores)) return [];

  const scoreGroups = Object.values(payload.other_scores).filter(Array.isArray);
  const ids = scoreGroups
    .flatMap((group) => group)
    .filter(isObject)
    .filter((score) => !recordString(score, "result").trim())
    .map((score) => recordString(score, "object_id"))
    .filter(Boolean);

  return [...new Set(ids)];
}

export function mergeEspnCandidateIds(
  liveIndexIds: string[],
  openScoreIds: string[],
): string[] {
  return [...new Set([...liveIndexIds, ...openScoreIds])];
}

function pageCount(payload: unknown): number | null {
  if (!isObject(payload)) return null;
  for (const key of ["pageCount", "page_count", "totalPages", "total_pages"]) {
    const value = recordNumber(payload, key);
    if (value && value > 0) return Math.floor(value);
  }
  return null;
}

async function fetchAllEspnPlayByPlay(id: string, cacheKey: number) {
  const pages: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const response = await fetchLiveFeed(`${ESPN_PLAY_BY_PLAY_URL(id, page)}&cb=${cacheKey}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    }).catch(() => null);
    if (!response?.ok) break;

    const payload = await response.json();
    pages.push(payload);
    const totalPages = pageCount(payload);
    const items = espnCommentaryItems(payload);
    if ((totalPages !== null && page >= totalPages) || (totalPages === null && items.length < 500)) break;
  }

  if (pages.length <= 1) return { payload: pages[0], pagesFetched: pages.length };
  return {
    payload: {
      commentary: {
        items: pages.flatMap((page) => espnCommentaryItems(page)),
      },
    },
    pagesFetched: pages.length,
  };
}

async function fetchEspnMatchDetails(ids: string[]) {
  type Detail = {
    id: string;
    payload: unknown;
    playByPlay: unknown;
    pagesFetched: number;
  };

  // Read each match response before starting its commentary requests. The
  // previous Promise.all left response bodies open while every match launched
  // a second request, which made Cloudflare cancel otherwise valid responses
  // as stalled when a busy day had many simultaneous fixtures.
  const details: Array<Detail | null> = new Array(ids.length).fill(null);
  let nextIndex = 0;
  const fetchOne = async (id: string): Promise<Detail | null> => {
    try {
      const cacheKey = Math.floor(Date.now() / 5_000);
      const response = await fetchLiveFeed(`${ESPN_MATCH_URL(id)}?cb=${cacheKey}`, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }

      // Consume the body immediately, before opening play-by-play pages.
      const payload = await response.json();
      const playByPlay = await fetchAllEspnPlayByPlay(id, cacheKey);
      return {
        id,
        payload,
        playByPlay: playByPlay.payload,
        pagesFetched: 1 + playByPlay.pagesFetched,
      };
    } catch {
      return null;
    }
  };

  // Keep all discovered IDs, but limit concurrent network work to a small
  // worker pool so India domestic slates do not exhaust Worker in-flight
  // response slots.
  const workerCount = Math.min(4, ids.length);
  const runWorker = async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= ids.length) return;
      details[index] = await fetchOne(ids[index]);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  const successful = details.filter(
    (
      detail,
    ): detail is Detail =>
      detail !== null,
  );
  return {
    details: successful,
    pagesFetched: successful.reduce((total, detail) => total + detail.pagesFetched, 0),
  };
}

async function fetchEspnLivePredictions(): Promise<FeedFetchResult<ProviderLiveMatches>> {
  try {
    let details: Array<{ id: string; payload: unknown; playByPlay: unknown; pagesFetched: number }>;
    let pagesFetched = 0;

    if (espnCandidateCache && espnCandidateCache.expiresAt > Date.now()) {
      const result = await fetchEspnMatchDetails(espnCandidateCache.ids);
      details = result.details;
      pagesFetched = result.pagesFetched;
    } else {
      const response = await fetchLiveFeed(ESPN_LIVE_RSS_URL, { cache: "no-store" });
      if (!response.ok) {
        return {
          ok: false,
          error: new Error(`ESPN live index failed with ${response.status}`),
          httpStatus: response.status,
        };
      }

      const ids = extractEspnMatchIds(await response.text());
      // Every RSS card can expose a different competition in `other_scores`.
      // Scan them all instead of letting one seed card decide what is live.
      const indexResult = await fetchEspnMatchDetails(ids);
      const indexDetails = indexResult.details;
      const openScoreIds = indexDetails.flatMap(({ payload }) =>
        extractEspnOpenScoreIds(payload),
      );
      const discoveryIds = mergeEspnCandidateIds(ids, openScoreIds);
      const seedIds = new Set(indexDetails.map(({ id }) => id));
      const additionalResult = await fetchEspnMatchDetails(
        discoveryIds.filter((id) => !seedIds.has(id)),
      );
      const discovered = [
        ...indexDetails,
        ...additionalResult.details,
      ];
      pagesFetched = 1 + indexResult.pagesFetched + additionalResult.pagesFetched;
      // Cache every discovered match, including unsupported formats, so the
      // next poll cannot silently narrow discovery to a major competition.
      details = discovered;
      espnCandidateCache = {
        // Re-discover quickly so a match that starts after page load appears.
        expiresAt: Date.now() + 5_000,
        ids: discoveryIds,
      };
    }

    return {
      ok: true,
      httpStatus: null,
      metrics: {
        matchesReceived: details.length,
        activeMatches: details.filter(({ payload }) => isActiveEspnMatch(payload)).length,
        pagesFetched,
      },
      value: {
        predictions: details
        .filter(({ payload }) => isActiveEspnMatch(payload))
        .map(({ id, payload, playByPlay }) =>
          buildRawMatchFromEspn(payload, id, playByPlay),
        )
        .filter((match): match is RawWidgetMatch => match !== null)
        .map((match) => buildLivePrediction(match))
        .filter((match): match is LiveMatchPrediction => match !== null),
        // ESPN's match-detail format does not provide a safe score-only
        // normalization for unsupported multi-day fixtures. CricketData does,
        // so its cards cover those matches without inventing a prediction.
        scoreOnlyMatches: [],
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: new Error(
        `ESPN live feed: ${error instanceof Error ? error.message : String(error)}`,
      ),
      httpStatus: null,
    };
  }
}

async function fetchCricketDataPredictions(
  _referrerUrl: string,
): Promise<FeedFetchResult<ProviderLiveMatches>> {
  try {
    const sourceUrl = new URL("https://cricketdata.org/apis/prepmatchlist.aspx");
    sourceUrl.searchParams.set("k", String(Math.floor(Date.now() / 5000)));

    const response = await fetchLiveFeed(sourceUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (compatible; AlphaLiveCricket/1.0)",
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        error: new Error(`CricketData feed failed with ${response.status}`),
        httpStatus: response.status,
      };
    }

    const payload = await response.json();
    const matches = parseWidgetMatches(payload);

    const livePayload = buildLiveMatchesPayload(matches, sourceUrl.toString());

    return {
      ok: true,
      httpStatus: null,
      metrics: {
        matchesReceived: matches.length,
        activeMatches: matches.filter(isActiveLiveStatus).length,
        pagesFetched: 1,
      },
      value: {
        predictions: livePayload.liveMatches,
        scoreOnlyMatches: livePayload.scoreOnlyMatches,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: new Error(
        `CricketData live feed: ${error instanceof Error ? error.message : String(error)}`,
      ),
      httpStatus: null,
    };
  }
}

async function fetchCricbuzzPredictions(): Promise<FeedFetchResult<ProviderLiveMatches>> {
  try {
    const response = await fetchLiveFeed(`${CRICBUZZ_LIVE_SCORES_URL}?cb=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Cache-Control": "no-cache",
        "User-Agent": "Mozilla/5.0 (compatible; AlphaLiveCricket/1.0)",
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return {
        ok: false,
        error: new Error(`Cricbuzz feed failed with ${response.status}`),
        httpStatus: response.status,
      };
    }

    // Consume the document exactly once. The current page embeds its
    // structured currentMatchesList in a Next flight script; parseCricbuzz-
    // MatchesHtml extracts every series and match from that object.
    const matches = parseCricbuzzMatchesHtml(await response.text());
    const enrichedMatches = await enrichCricbuzzMilestones(matches);
    const livePayload = buildLiveMatchesPayload(enrichedMatches, CRICBUZZ_LIVE_SCORES_URL);

    return {
      ok: true,
      httpStatus: null,
      metrics: {
        matchesReceived: matches.length,
        activeMatches: matches.filter(isActiveLiveStatus).length,
        pagesFetched: 1,
      },
      value: {
        predictions: livePayload.liveMatches,
        scoreOnlyMatches: livePayload.scoreOnlyMatches,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: new Error(
        `Cricbuzz live feed: ${error instanceof Error ? error.message : String(error)}`,
      ),
      httpStatus: null,
    };
  }
}

async function fetchEntitySportPredictions(): Promise<FeedFetchResult<ProviderLiveMatches>> {
  try {
    const results = await Promise.all(
      ENTITYSPORT_SERIES_IDS.map(async (seriesId) => {
        const url = `${ENTITYSPORT_LIVE_SCORE_URL(seriesId)}&cb=${Date.now()}`;
        const response = await fetchLiveFeed(url, {
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "Mozilla/5.0 (compatible; AlphaLiveCricket/1.0)",
          },
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`EntitySport series ${seriesId} failed with ${response.status}`);
        }
        return parseEntitySportLiveMatches(await response.json());
      }),
    );
    const matches = results.flat();
    const livePayload = buildLiveMatchesPayload(
      matches,
      ENTITYSPORT_LIVE_SCORE_URL(ENTITYSPORT_SERIES_IDS[0]),
    );
    return {
      ok: true,
      httpStatus: null,
      metrics: {
        matchesReceived: matches.length,
        activeMatches: matches.filter(isActiveLiveStatus).length,
        pagesFetched: ENTITYSPORT_SERIES_IDS.length,
      },
      value: {
        predictions: livePayload.liveMatches,
        scoreOnlyMatches: livePayload.scoreOnlyMatches,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: new Error(
        `EntitySport domestic feed: ${error instanceof Error ? error.message : String(error)}`,
      ),
      httpStatus: null,
    };
  }
}

function predictionIdentity(match: LiveMatchPrediction): string {
  const aliases = new Map([
    ["hongkongchina", "hongkong"],
    ["unitedarabemirates", "uae"],
    ["unitedstates", "usa"],
    ["unitedstatesofamerica", "usa"],
    ["papuanewguinea", "png"],
    ["czechrepublic", "czechia"],
  ]);
  const normalizeTeam = (name: string) => {
    const normalized = canonicalize(name).replace(/(?:men|women)$/i, "");
    return aliases.get(normalized) ?? normalized;
  };

  return [normalizeTeam(match.battingTeam), normalizeTeam(match.bowlingTeam)]
    .sort()
    .join("|");
}

function matchFreshness(match: LiveMatchPrediction): [number, number, number] {
  const completedInnings = match.innings.filter((innings) => !innings.isCurrent).length;
  const timestamp = match.feedUpdatedAt ? Date.parse(match.feedUpdatedAt) : 0;
  return [
    completedInnings,
    match.currentBalls,
    Number.isFinite(timestamp) ? timestamp : 0,
  ];
}

function isFresherMatch(
  candidate: LiveMatchPrediction,
  existing: LiveMatchPrediction,
): boolean {
  const candidateKey = matchFreshness(candidate);
  const existingKey = matchFreshness(existing);
  for (let index = 0; index < candidateKey.length; index += 1) {
    if (candidateKey[index] !== existingKey[index]) {
      return candidateKey[index] > existingKey[index];
    }
  }
  return false;
}

export function mergeLiveMatchSources(
  matches: LiveMatchPrediction[],
): LiveMatchPrediction[] {
  const byIdentity = new Map<string, LiveMatchPrediction>();
  for (const match of matches) {
    const identity = predictionIdentity(match);
    const existing = byIdentity.get(identity);
    if (!existing || isFresherMatch(match, existing)) {
      byIdentity.set(identity, match);
    }
  }
  const formatRank: Record<CricketFormat, number> = {
    t20: 0,
    odi: 1,
    hundred: 2,
    test: 3,
    other: 4,
  };
  return [...byIdentity.values()].sort((left, right) => {
    const rankDifference = formatRank[left.format] - formatRank[right.format];
    return rankDifference || left.title.localeCompare(right.title);
  });
}

function mergeScoreOnlySources(matches: LiveScoreMatch[]): LiveScoreMatch[] {
  const byIdentity = new Map<string, LiveScoreMatch>();
  for (const match of matches) {
    const identity = canonicalize(match.title);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, match);
      continue;
    }
    const candidateTime = match.feedUpdatedAt ? Date.parse(match.feedUpdatedAt) : 0;
    const existingTime = existing.feedUpdatedAt ? Date.parse(existing.feedUpdatedAt) : 0;
    if (candidateTime > existingTime) byIdentity.set(identity, match);
  }
  return [...byIdentity.values()];
}

export function buildLiveMatchesPayload(
  matches: RawWidgetMatch[],
  sourceUrl: string,
): LiveMatchesPayload {
  const activeMatches = matches.filter(isActiveLiveStatus);
  const liveMatches = activeMatches
    .map((match) => buildLivePrediction(match))
    .filter((match): match is LiveMatchPrediction => match !== null);
  const predictedIds = new Set(liveMatches.map((match) => match.id));
  const scoreOnlyMatches = activeMatches
    .filter((match) => !predictedIds.has(match.id))
    .map((match) => ({
      id: match.id,
      title: `${match.t1n ?? match.t1} vs ${match.t2n ?? match.t2}`,
      format: match.t || "Unknown format",
      status: match.s || match.ms,
      scoreLine: [
        match.t1s ? `${match.t1} ${normalizeScoreText(match.t1s)}` : null,
        match.t2s ? `${match.t2} ${normalizeScoreText(match.t2s)}` : null,
      ].filter(Boolean).join("  |  ") || "Live score not yet published",
      venue: parseVenue(match),
      feedUpdatedAt: match.feedUpdatedAt ?? null,
    }));
  const formatCounts = liveMatches.reduce<Record<CricketFormat, number>>(
    (counts, match) => {
      counts[match.format] += 1;
      return counts;
    },
    { t20: 0, odi: 0, hundred: 0, test: 0, other: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    source: {
      provider: "CricketData public live feed",
      url: sourceUrl,
    },
    feedHealth: {
      providerStatus: "CONNECTED",
      lastRequestAt: new Date().toISOString(),
      lastSuccessfulUpdate: new Date().toISOString(),
      matchesReceived: matches.length,
      pagesFetched: 1,
      activeMatches: activeMatches.length,
      supportedMatches: liveMatches.length,
      scoreOnlyMatches: scoreOnlyMatches.length,
      filteredUnsupported: 0,
      formatCounts,
      lastScoreUpdate: null,
      httpStatus: null,
      errorMessage: null,
    },
    liveMatches,
    scoreOnlyMatches,
  };
}

export async function fetchLiveMatchesPayload(
  referrerUrl: string,
): Promise<LiveMatchesPayload> {
  const requestedAt = new Date().toISOString();
  const [espnResult, cricketDataResult, cricbuzzResult, entitySportResult] = await Promise.all([
    fetchEspnLivePredictions(),
    fetchCricketDataPredictions(referrerUrl),
    fetchCricbuzzPredictions(),
    fetchEntitySportPredictions(),
  ]);
  const primaryMatches = espnResult.ok ? espnResult.value.predictions : [];
  const fallbackMatches = cricketDataResult.ok ? cricketDataResult.value.predictions : [];
  const cricbuzzMatches = cricbuzzResult.ok ? cricbuzzResult.value.predictions : [];
  const entitySportMatches = entitySportResult.ok ? entitySportResult.value.predictions : [];
  const rawScoreOnlyMatches = [
    ...(espnResult.ok ? espnResult.value.scoreOnlyMatches : []),
    ...(cricketDataResult.ok ? cricketDataResult.value.scoreOnlyMatches : []),
    ...(cricbuzzResult.ok ? cricbuzzResult.value.scoreOnlyMatches : []),
    ...(entitySportResult.ok ? entitySportResult.value.scoreOnlyMatches : []),
  ];
  const scoreOnlyMatches = mergeScoreOnlySources(rawScoreOnlyMatches);
  const liveMatches = mergeLiveMatchSources([
    ...primaryMatches,
    ...fallbackMatches,
    ...cricbuzzMatches,
    ...entitySportMatches,
  ]);
  const providerResults = [espnResult, cricketDataResult, cricbuzzResult, entitySportResult];
  const bothFailed = providerResults.every((result) => !result.ok);
  const oneFailed = providerResults.some((result) => !result.ok);
  const providerStatus: "CONNECTED" | "DEGRADED" | "ERROR" = bothFailed
    ? "ERROR"
    : oneFailed
      ? "DEGRADED"
      : "CONNECTED";
  const providerError =
    oneFailed
      ? [
          !espnResult.ok
            ? espnResult.error.message
            : null,
          !cricketDataResult.ok
            ? cricketDataResult.error.message
            : null,
          !cricbuzzResult.ok
            ? cricbuzzResult.error.message
            : null,
          !entitySportResult.ok
            ? entitySportResult.error.message
            : null,
        ]
          .filter(Boolean)
          .join(" | ") || "A live cricket feed is unavailable"
      : null;
  const httpStatuses = [
    !espnResult.ok && espnResult.httpStatus ? `ESPN ${espnResult.httpStatus}` : null,
    !cricketDataResult.ok && cricketDataResult.httpStatus
      ? `CricketData ${cricketDataResult.httpStatus}`
      : null,
    !cricbuzzResult.ok && cricbuzzResult.httpStatus
      ? `Cricbuzz ${cricbuzzResult.httpStatus}`
      : null,
    !entitySportResult.ok && entitySportResult.httpStatus
      ? `EntitySport ${entitySportResult.httpStatus}`
      : null,
  ].filter(Boolean);
  const lastSuccessfulUpdate = bothFailed ? null : requestedAt;
  const formatCounts = liveMatches.reduce<Record<CricketFormat, number>>(
    (counts, match) => {
      counts[match.format] += 1;
      return counts;
    },
    { t20: 0, odi: 0, hundred: 0, test: 0, other: 0 },
  );
  const lastScoreUpdate =
    liveMatches.reduce<string | null>((latest, match) => {
      if (!match.feedUpdatedAt) return latest;
      if (!latest) return match.feedUpdatedAt;
      return Date.parse(match.feedUpdatedAt) > Date.parse(latest)
        ? match.feedUpdatedAt
        : latest;
    }, null);

  return {
    generatedAt: requestedAt,
    source: {
      provider: "ESPNcricinfo, CricketData, Cricbuzz and Indian domestic live feeds",
      url: ESPN_LIVE_RSS_URL,
    },
    feedHealth: {
      providerStatus,
      lastRequestAt: requestedAt,
      lastSuccessfulUpdate,
      matchesReceived:
        (espnResult.ok ? espnResult.metrics.matchesReceived : 0) +
        (cricketDataResult.ok ? cricketDataResult.metrics.matchesReceived : 0) +
        (cricbuzzResult.ok ? cricbuzzResult.metrics.matchesReceived : 0) +
        (entitySportResult.ok ? entitySportResult.metrics.matchesReceived : 0),
      pagesFetched:
        (espnResult.ok ? espnResult.metrics.pagesFetched : 0) +
        (cricketDataResult.ok ? cricketDataResult.metrics.pagesFetched : 0) +
        (cricbuzzResult.ok ? cricbuzzResult.metrics.pagesFetched : 0) +
        (entitySportResult.ok ? entitySportResult.metrics.pagesFetched : 0),
      // Multiple providers can report the same fixture. Report the unique
      // active board count so the diagnostic compares directly with cards.
      activeMatches: liveMatches.length + scoreOnlyMatches.length,
      supportedMatches: liveMatches.length,
      scoreOnlyMatches: scoreOnlyMatches.length,
      filteredUnsupported: 0,
      formatCounts,
      lastScoreUpdate,
      httpStatus: httpStatuses.length ? httpStatuses.join(" | ") : null,
      errorMessage: providerError,
    },
    liveMatches,
    scoreOnlyMatches,
    ...(bothFailed
      ? { error: "All live cricket feeds are unavailable" }
      : {}),
  };
}

export function getMilestoneThresholds(format: CricketFormat): number[] {
  return FORMAT_CONFIG[format].milestones;
}
