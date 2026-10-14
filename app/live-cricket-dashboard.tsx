"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  mergeForecastHistory,
  type ForecastHistory,
} from "@/lib/forecast-history";
import type {
  LiveMatchesPayload,
  LiveMatchPrediction,
  LiveScoreMatch,
} from "@/lib/live-cricket";

type LiveCricketDashboardProps = {
  initialData: LiveMatchesPayload;
};

type ConnectionStatus = "live" | "degraded" | "offline";

type FeedConnection = {
  status: ConnectionStatus;
  message: string | null;
  lastAttemptAt: string | null;
  staleSnapshot: boolean;
  feedHealth: LiveMatchesPayload["feedHealth"];
};

const REFRESH_INTERVAL_MS = 10_000;
const REFRESH_TIMEOUT_MS = 15_000;
const FORECAST_HISTORY_KEY = "alpha-prediction-forecast-history-v3";
const LEGACY_FORECAST_HISTORY_KEYS = [
  "alpha-prediction-forecast-history-v2",
  "alpha-prediction-forecast-history-v1",
];

function readForecastHistory(): ForecastHistory {
  try {
    const currentValue = window.localStorage.getItem(FORECAST_HISTORY_KEY);
    const legacyKey = LEGACY_FORECAST_HISTORY_KEYS.find((key) =>
      window.localStorage.getItem(key),
    );
    const isLegacy = !currentValue;
    const value = JSON.parse(
      currentValue ??
        (legacyKey ? window.localStorage.getItem(legacyKey) : null) ??
        "{}",
    ) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    if (!isLegacy) return value as ForecastHistory;

    // Keep completed scores, but reset old live forecasts. They were created
    // before anchored smoothing and must not become the new initial baseline.
    return Object.fromEntries(
      Object.entries(value as ForecastHistory).map(([id, entry]) => [
        id,
        {
          ...entry,
          initialFinalScore: undefined,
          currentFinalScore: undefined,
          currentUncertainty: undefined,
          currentWinProbability: undefined,
          initialWinProbability: undefined,
          predictionStability: undefined,
          forecasts: Array.isArray(entry.forecasts)
            ? entry.forecasts
                .filter((forecast) => forecast.state === "actual")
                .map((forecast) => ({
                  ...forecast,
                  predictedLow: undefined,
                  predictedHigh: undefined,
                  predictionRangeStatus: "unavailable" as const,
                }))
            : [],
        },
      ]),
    ) as ForecastHistory;
  } catch {
    return {};
  }
}

function mergeAndStoreForecasts(
  payload: LiveMatchesPayload,
  historyRef: { current: ForecastHistory },
) {
  let merged;
  try {
    merged = mergeForecastHistory(payload, historyRef.current);
  } catch {
    merged = mergeForecastHistory(payload, {});
  }

  historyRef.current = merged.history;
  try {
    window.localStorage.setItem(FORECAST_HISTORY_KEY, JSON.stringify(merged.history));
  } catch {
    // Storage is optional: live updates must also work in private browsing.
  }
  return merged.payload;
}

function liveMatchesEndpoint(): string {
  return `/api/live-matches?ts=${Date.now()}`;
}

function formatClock(iso: string | null): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function formatAge(iso: string | null, now: number): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "Unavailable";
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function formatRate(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toFixed(2).replace(/\.0+$/, "");
}

function checkpointStateLabel(
  state: LiveMatchPrediction["scoreForecasts"][number]["state"],
): string {
  if (state === "actual") return "Recorded score";
  if (state === "locked") return "Locked forecast";
  if (state === "baseline") return "Innings-start estimate";
  return "Upcoming forecast";
}

function formatFormat(match: LiveMatchPrediction): string {
  if (match.format === "t20") return "T20";
  if (match.format === "odi") return "ONE-DAY";
  if (match.format === "hundred") return "HUNDRED";
  if (match.format === "test") return "TEST";
  return match.formatLabel || match.format.toUpperCase();
}

function statusFromPayload(payload: LiveMatchesPayload): ConnectionStatus {
  if (payload.error || payload.feedHealth.providerStatus === "ERROR") return "offline";
  return payload.feedHealth.providerStatus === "DEGRADED" ? "degraded" : "live";
}

function StatusBadge({ status, stale }: { status: ConnectionStatus; stale: boolean }) {
  const copy = stale
    ? "Last verified snapshot"
    : status === "live"
      ? "Live feed"
      : status === "degraded"
        ? "Feed degraded"
        : "Feed unavailable";
  const tone = stale || status === "degraded"
    ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
    : status === "offline"
      ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
      : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {copy}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-[-0.03em] text-slate-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function FormatBreakdown({ counts }: {
  counts: LiveMatchesPayload["feedHealth"]["formatCounts"];
}) {
  const formats = [
    { label: "T20", value: counts.t20 },
    { label: "One-Day", value: counts.odi },
    { label: "Hundred", value: counts.hundred },
    { label: "Test", value: counts.test },
    { label: "Other", value: counts.other },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 sm:col-span-2 lg:col-span-2">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Live formats</p>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {formats.map((format) => (
          <div key={format.label} className="min-w-0">
            <p className="text-lg font-bold tracking-[-0.03em] text-slate-100">{format.value}</p>
            <p className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-slate-500">{format.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedHealth({
  health,
  displayed,
}: {
  health: LiveMatchesPayload["feedHealth"];
  displayed: number;
}) {
  const rows = [
    { label: "Provider received", value: `${health.matchesReceived} matches` },
    { label: "Pages fetched", value: String(health.pagesFetched) },
    { label: "Active matches", value: String(health.activeMatches) },
    { label: "Displayed by Alpha", value: String(displayed) },
    { label: "Forecast cards", value: String(health.supportedMatches) },
    { label: "Filtered unsupported", value: String(health.filteredUnsupported) },
    { label: "Last fetch", value: formatClock(health.lastRequestAt) },
    { label: "Last score update", value: formatClock(health.lastScoreUpdate) },
    { label: "Last successful update", value: formatClock(health.lastSuccessfulUpdate) },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4" aria-label="feed health">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Feed health</p>
          <p className="mt-1 text-sm text-slate-500">Provider and Alpha totals are shown together so missing matches are visible immediately.</p>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">{health.providerStatus}</span>
      </div>
      <div className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-slate-800/80 pb-2 lg:block lg:border-b-0 lg:pb-0">
            <p className="text-slate-500">{row.label}</p>
            <p className="mt-0.5 text-right font-semibold text-slate-200 lg:text-left">{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatPerformanceMetric(value: number | null | undefined, suffix = "%") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value}${suffix}`;
}

function AIPerformance({
  performance,
  matches,
}: {
  performance: LiveMatchesPayload["modelPerformance"];
  matches: LiveMatchPrediction[];
}) {
  const averageConfidence = matches.length
    ? Math.round(matches.reduce((sum, match) => sum + match.confidence, 0) / matches.length)
    : performance?.averageConfidence ?? null;
  const averageAgreement = matches.length
    ? Math.round(matches.reduce((sum, match) => sum + match.ensemble.agreement, 0) / matches.length)
    : null;
  const metrics = [
    {
      label: "Historical score accuracy",
      value: formatPerformanceMetric(performance?.historicalAccuracy),
      hint: `${performance?.completedPredictions ?? 0} locked checkpoints`,
    },
    {
      label: "Prediction confidence",
      value: formatPerformanceMetric(averageConfidence),
      hint: "Current ensemble confidence",
    },
    {
      label: "Model agreement",
      value: formatPerformanceMetric(averageAgreement),
      hint: "Signal consensus, not accuracy",
    },
    {
      label: "Final score MAE",
      value: formatPerformanceMetric(performance?.scoreMae, " runs"),
      hint: "Mean absolute checkpoint error",
    },
    {
      label: "10-over MAE",
      value: formatPerformanceMetric(performance?.stageMae?.["10"], " runs"),
      hint: "Locked 10-over checkpoints",
    },
    {
      label: "15-over MAE",
      value: formatPerformanceMetric(performance?.stageMae?.["15"], " runs"),
      hint: "Locked 15-over checkpoints",
    },
    {
      label: "Winner Brier score",
      value: performance?.winnerBrierScore === null || performance?.winnerBrierScore === undefined
        ? "—"
        : performance.winnerBrierScore.toFixed(2),
      hint: "Needs completed winner results",
    },
    {
      label: "Prediction stability",
      value: formatPerformanceMetric(performance?.predictionStability),
      hint: "Movement stays within event limits",
    },
    {
      label: "Calibration",
      value: formatPerformanceMetric(performance?.calibration),
      hint: "Needs completed winner results",
    },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.035] p-4" aria-label="AI performance">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">AI performance</p>
          <p className="mt-1 text-sm text-slate-500">Accuracy is calculated only from locked predictions against provider-reported scores.</p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{performance?.modelVersion ?? "stable engine"}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Stat key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} />
        ))}
      </div>
    </section>
  );
}

function Probability({ label, team, value, accent }: {
  label: string;
  team: string;
  value: number;
  accent: "cyan" | "violet";
}) {
  const barColor = accent === "cyan" ? "bg-cyan-400" : "bg-violet-400";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-200">{team}</p>
        </div>
        <p className="text-2xl font-bold tracking-[-0.04em] text-white">{value}%</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ForecastCard({ match, now }: { match: LiveMatchPrediction; now: number }) {
  const futureForecasts = match.scoreForecasts.filter(
    (forecast) => forecast.state !== "actual",
  );

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 shadow-[0_18px_50px_rgba(2,6,23,0.3)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.75)]" />
          <span className="truncate text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">{formatFormat(match)}</span>
          <span className="text-slate-600">•</span>
          <span className="truncate text-xs text-slate-400">{match.status}</span>
        </div>
        <span className="shrink-0 text-xs text-slate-500">{formatAge(match.feedUpdatedAt, now)}</span>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-white">{match.title}</h2>
            <p className="mt-1 truncate text-sm text-slate-400">{match.venue ?? "Venue not published"}</p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-right">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-cyan-200">AI confidence</p>
            <p className="mt-0.5 text-xl font-bold text-cyan-100">{match.confidence}%</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current score</p>
              <p className="mt-1 text-3xl font-black tracking-[-0.055em] text-white">{match.currentScore}</p>
              <p className="mt-1 text-sm text-slate-400">{match.liveLabel}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right text-sm">
              <div><p className="text-xs text-slate-500">Current RR</p><p className="font-semibold text-slate-200">{formatRate(match.currentRunRate)}</p></div>
              <div><p className="text-xs text-slate-500">Required RR</p><p className="font-semibold text-slate-200">{formatRate(match.requiredRunRate)}</p></div>
              <div><p className="text-xs text-slate-500">Target</p><p className="font-semibold text-slate-200">{match.target ?? "1st innings"}</p></div>
              <div><p className="text-xs text-slate-500">Next-over wicket</p><p className="font-semibold text-slate-200">{match.wicketProbability}%</p></div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Probability label="Win chance" team={match.winProbability.battingTeam} value={match.winProbability.battingTeamPercent} accent="cyan" />
          <Probability label="Win chance" team={match.winProbability.bowlingTeam} value={match.winProbability.bowlingTeamPercent} accent="violet" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Projected final score</p>
            <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-white">{match.finalScore.predicted}</p>
            <p className="mt-1 text-sm text-slate-400">Likely range {match.finalScore.low}–{match.finalScore.high}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:min-w-48">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Next checkpoints</p>
            {futureForecasts.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {futureForecasts.map((forecast) => (
                  <span key={`${match.id}-${forecast.over}`} className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200">
                    {forecast.label}: {forecast.predicted}
                  </span>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-slate-500">No future checkpoint</p>}
          </div>
        </div>
      </div>
    </article>
  );
}

function ScoreOnlyCard({ match, now }: { match: LiveScoreMatch; now: number }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Live score</span>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{match.format}</span>
          </div>
          <h3 className="mt-2 text-base font-bold text-white">{match.title}</h3>
          <p className="mt-1 text-sm text-slate-400">{match.status}</p>
        </div>
        <span className="text-xs text-slate-500">{formatAge(match.feedUpdatedAt, now)}</span>
      </div>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
        <p className="text-lg font-bold tracking-[-0.02em] text-slate-100">{match.scoreLine}</p>
        <p className="mt-1 text-xs text-slate-500">{match.venue ?? "Venue not published"} · Score only — no forecast for this format</p>
      </div>
    </article>
  );
}

function FullForecastCard({ match, now }: { match: LiveMatchPrediction; now: number }) {
  const completedForecasts = match.scoreForecasts.filter(
    (forecast) => forecast.state !== "upcoming",
  );
  const futureForecasts = match.scoreForecasts.filter(
    (forecast) => forecast.state === "upcoming",
  );
  const ballsRemaining = Math.max(
    0,
    Math.round(match.inningsLimitOvers * match.ballsPerOver) - match.currentBalls,
  );
  const runsNeeded = match.target === null
    ? null
    : Math.max(0, match.target - match.currentRuns);
  const isPreChase = match.innings.length === 2 && match.currentBalls === 0;

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 shadow-[0_18px_50px_rgba(2,6,23,0.3)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.75)]" />
          <span className="truncate text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">LIVE - {formatFormat(match)}</span>
          <span className="text-xs text-slate-400">{match.currentScore}</span>
        </div>
        <span className="shrink-0 text-xs text-slate-500">Updated {formatAge(match.feedUpdatedAt, now)}</span>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-white">{match.title}</h2>
            <p className="mt-1 text-sm text-slate-400">{match.status}</p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-right">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-cyan-200">AI confidence</p>
            <p className="mt-0.5 text-xl font-bold text-cyan-100">{match.confidence}%</p>
          </div>
        </div>

        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current score</p>
          <p className="mt-1 text-3xl font-black tracking-[-0.055em] text-white">{match.liveLabel}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {match.innings.map((innings) => (
              <div key={`${match.id}-${innings.number}`} className="rounded-xl border border-slate-800 bg-slate-900/75 px-3 py-2">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.15em] text-slate-500">{innings.number === 1 ? "1st innings" : "2nd innings"}</p>
                <p className="mt-1 font-semibold text-slate-200">{innings.shortName} {innings.score}</p>
              </div>
            ))}
          </div>
          {runsNeeded !== null ? (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span><span className="text-slate-500">Target: </span><span className="font-semibold text-cyan-100">{match.target}</span></span>
              <span><span className="text-slate-500">Need: </span><span className="font-semibold text-cyan-100">{runsNeeded} from {ballsRemaining} balls</span></span>
              <span><span className="text-slate-500">Required RR: </span><span className="font-semibold text-cyan-100">{formatRate(match.requiredRunRate)}</span></span>
            </div>
          ) : null}
        </section>

        <section className="mt-4">
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{isPreChase ? "Pre-chase win prediction" : "Win prediction"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Probability label="Win chance" team={match.winProbability.battingTeam} value={match.winProbability.battingTeamPercent} accent="cyan" />
            <Probability label="Win chance" team={match.winProbability.bowlingTeam} value={match.winProbability.bowlingTeamPercent} accent="violet" />
          </div>
          <p className="mt-2 text-xs text-slate-500">Initial {match.initialWinProbability?.battingTeamPercent ?? match.winProbability.battingTeamPercent}% → Live {match.winProbability.battingTeamPercent}%</p>
        </section>

        <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Score predictions</p>
          {futureForecasts.length ? (
            <div className="mt-3 grid gap-2">
              <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-3 px-3 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:grid">
                <span>Milestone</span><span>Initial</span><span>Live</span><span>Range</span>
              </div>
              {futureForecasts.map((forecast) => (
                <div key={`${match.id}-${forecast.over}`} className="grid gap-1 rounded-xl bg-slate-900 px-3 py-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-3">
                  <span className="text-sm font-semibold text-slate-300">{forecast.label}</span>
                  <span className="text-xs text-slate-500 sm:text-sm">{forecast.initialPrediction ?? forecast.predicted}</span>
                  <span className="text-sm font-semibold text-cyan-100">{forecast.currentPrediction ?? forecast.predicted}</span>
                  <span className="text-sm font-bold text-white">{forecast.low}-{forecast.high}{forecast.range80Low !== undefined && forecast.range80High !== undefined ? <small className="mt-0.5 block text-[0.62rem] font-normal text-slate-500">80% {forecast.range80Low}-{forecast.range80High}</small> : null}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-sm text-slate-500">No future checkpoint is available for this innings.</p>}
        </section>

        {completedForecasts.length ? (
          <section className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.04] p-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-emerald-200">Checkpoint history</p>
                <p className="mt-1 text-xs text-slate-500">Actual scores appear in parentheses. New entries keep the range shown before that checkpoint.</p>
              </div>
              <span className="text-xs font-semibold text-slate-400">{completedForecasts.length} saved</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {completedForecasts.map((forecast) => {
                const exactScore = forecast.state === "actual";
                const hasPredictedRange =
                  exactScore &&
                  forecast.predictionRangeStatus !== "unavailable" &&
                  forecast.predictedLow !== undefined &&
                  forecast.predictedHigh !== undefined;
                const scoreText = hasPredictedRange
                  ? `${forecast.predictedLow}-${forecast.predictedHigh}`
                  : exactScore
                    ? "Range not captured"
                    : `${forecast.low}-${forecast.high}`;
                const actualScore = exactScore
                  ? `${forecast.actualScore ?? forecast.predicted}/${forecast.actualWickets ?? 0}`
                  : null;
                const accuracyText = exactScore && forecast.finalError !== undefined
                  ? `Initial ${forecast.initialPrediction ?? "—"} · Live ${forecast.currentPrediction ?? "—"} · Error ${forecast.finalError}`
                  : null;
                return (
                  <div key={`${match.id}-history-${forecast.over}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/80 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-200">{forecast.label}{actualScore ? ` (${actualScore})` : ""}</p>
                      <p className="mt-0.5 truncate text-[0.68rem] text-slate-500">{accuracyText ?? checkpointStateLabel(forecast.state)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{exactScore ? (hasPredictedRange ? "Predicted range" : "Prediction range") : "Predicted range"}</p>
                      <span className="text-sm font-bold text-emerald-100">{scoreText}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Final score</p>
            <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-white">{match.finalScore.predicted}</p>
            <p className="mt-1 text-sm text-slate-400">50% range {match.finalScore.low}-{match.finalScore.high}</p>
            {match.uncertainty ? <p className="mt-1 text-xs text-slate-500">80% range {match.uncertainty.p80Low}-{match.uncertainty.p80High}</p> : null}
            {match.eventShock && match.eventShock.level !== "normal" ? <p className="mt-1 text-xs text-amber-200/80">{match.eventShock.label} · live trust {Math.round(match.eventShock.liveTrust * 100)}%</p> : null}
            <p className="mt-1 text-xs text-slate-500">Initial {match.initialFinalScore?.predicted ?? match.finalScore.predicted} · Change {match.finalScore.predicted - (match.initialFinalScore?.predicted ?? match.finalScore.predicted) >= 0 ? "+" : ""}{match.finalScore.predicted - (match.initialFinalScore?.predicted ?? match.finalScore.predicted)}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Wicket probability</p>
            <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-white">{match.wicketProbability}%</p>
            <p className="mt-1 text-sm text-slate-400">Next 2 overs</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">AI confidence</p>
            <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-white">{match.confidence}%</p>
            <p className="mt-1 text-sm text-slate-400">{match.ensemble.modelCount} models · {match.ensemble.agreement}% agreement</p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function LiveCricketDashboard({ initialData }: LiveCricketDashboardProps) {
  const [data, setData] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);
  const [connection, setConnection] = useState<FeedConnection>({
    status: statusFromPayload(initialData),
    message: initialData.feedHealth.errorMessage ?? initialData.error ?? null,
    lastAttemptAt: initialData.feedHealth.lastRequestAt,
    staleSnapshot: false,
    feedHealth: initialData.feedHealth,
  });
  const dataRef = useRef(initialData);
  const historyRef = useRef<ForecastHistory>({});
  const requestRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setRefreshing(true);
    const attemptedAt = new Date().toISOString();
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

    try {
      const response = await fetch(liveMatchesEndpoint(), {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Refresh failed with ${response.status}`);
      const nextData = (await response.json()) as LiveMatchesPayload;
      const retainLastSnapshot = Boolean(nextData.error) &&
        nextData.liveMatches.length === 0 &&
        dataRef.current.liveMatches.length > 0;

      if (!retainLastSnapshot) {
        const merged = mergeAndStoreForecasts(nextData, historyRef);
        dataRef.current = merged;
        setData(merged);
      }

      setConnection({
        status: statusFromPayload(nextData),
        message: nextData.feedHealth.errorMessage ?? nextData.error ?? null,
        lastAttemptAt: attemptedAt,
        staleSnapshot: retainLastSnapshot,
        feedHealth: nextData.feedHealth,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setConnection((current) => ({
        ...current,
        status: "offline",
        message: "Alpha could not refresh the provider feed. Keeping the last verified board.",
        lastAttemptAt: attemptedAt,
        staleSnapshot: dataRef.current.liveMatches.length > 0,
      }));
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      inFlightRef.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    historyRef.current = readForecastHistory();
    const merged = mergeAndStoreForecasts(initialData, historyRef);
    dataRef.current = merged;
    setData(merged);
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      requestRef.current?.abort();
    };
  }, [initialData, refresh]);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const health = connection.feedHealth;
  const scoreOnlyMatches = data.scoreOnlyMatches ?? [];
  const hasVisibleMatches = data.liveMatches.length > 0 || scoreOnlyMatches.length > 0;
  const isProviderDegraded = connection.status !== "live" || connection.staleSnapshot;

  return (
    <main className="min-h-screen bg-[#080b12] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-[#080b12]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 font-black text-slate-950">A</span>
            <div>
              <p className="text-sm font-bold tracking-[-0.02em] text-white">Alpha Prediction</p>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Live match centre</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={connection.status} stale={connection.staleSnapshot} />
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              {refreshing ? "Updating…" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <section className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Live cricket intelligence</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">Matches, scores and probabilities.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Every active match keeps its own live prediction card. Alpha refreshes scores and future milestones every 10 seconds.</p>
          </div>
          <p className="text-sm text-slate-500">Last board update <span className="font-semibold text-slate-300">{formatClock(data.generatedAt)}</span></p>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Displayed now" value={String(data.liveMatches.length + scoreOnlyMatches.length)} hint={`${data.liveMatches.length} prediction cards`} />
          <Stat label="Provider active" value={String(health.activeMatches)} hint={`${health.matchesReceived} records received`} />
          <FormatBreakdown counts={health.formatCounts} />
          <Stat label="Last provider update" value={formatAge(health.lastSuccessfulUpdate, now)} hint={`Polled ${formatClock(connection.lastAttemptAt)}`} />
        </section>

        <FeedHealth health={health} displayed={data.liveMatches.length + scoreOnlyMatches.length} />
        <AIPerformance performance={data.modelPerformance} matches={data.liveMatches} />

        {isProviderDegraded ? (
          <section className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/8 px-4 py-3 text-sm text-amber-50">
            <p className="font-semibold">{connection.staleSnapshot ? "Showing the last verified match board." : "The provider feed is partially unavailable."}</p>
            <p className="mt-1 text-amber-100/75">{connection.message ?? "Alpha will continue polling automatically."}</p>
          </section>
        ) : null}

        <section className="mt-8" aria-label="live cricket predictions">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Live matches</h2>
              <p className="mt-1 text-sm text-slate-500">Every active match stays visible until its official result, with winner probability and future score ranges.</p>
            </div>
            <p className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 sm:block">{health.pagesFetched} feed pages checked</p>
          </div>

          {hasVisibleMatches ? (
            <div className="grid gap-6">
              {data.liveMatches.length ? (
                <div className="grid gap-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Full live predictions</p>
                  {data.liveMatches.map((match) => <FullForecastCard key={match.id} match={match} now={now} />)}
                </div>
              ) : null}
              {scoreOnlyMatches.length ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Feed details still arriving</p>
                      <p className="mt-1 text-sm text-slate-500">This match will move into its full forecast card as soon as the provider publishes a usable innings state.</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-300">{scoreOnlyMatches.length} live score{scoreOnlyMatches.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">{scoreOnlyMatches.map((match) => <ScoreOnlyCard key={match.id} match={match} now={now} />)}</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7 sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">No live matches</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-white">
                {health.activeMatches > 0 ? "Live matches are waiting for their score card." : "No live cricket match is currently supplied."}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Provider received {health.matchesReceived} matches across {health.pagesFetched} pages; {health.activeMatches} are active; Alpha displayed {health.supportedMatches} full prediction cards.
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-lg border border-slate-800 px-3 py-2">T20/T20I: {health.formatCounts.t20}</span>
                <span className="rounded-lg border border-slate-800 px-3 py-2">One-Day: {health.formatCounts.odi}</span>
                <span className="rounded-lg border border-slate-800 px-3 py-2">Hundred: {health.formatCounts.hundred}</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
