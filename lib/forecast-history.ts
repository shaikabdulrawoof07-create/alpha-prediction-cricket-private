import type {
  LiveMatchesPayload,
  MilestoneForecast,
} from "@/lib/live-cricket";

const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000;

type ForecastHistoryEntry = {
  inningsKey: string;
  updatedAt: number;
  currentRuns?: number;
  currentWickets?: number;
  currentBalls?: number;
  currentFinalScore?: LiveMatchesPayload["liveMatches"][number]["finalScore"];
  currentUncertainty?: LiveMatchesPayload["liveMatches"][number]["uncertainty"];
  currentWinProbability?: {
    battingTeamPercent: number;
    bowlingTeamPercent: number;
  };
  initialWinProbability?: {
    battingTeamPercent: number;
    bowlingTeamPercent: number;
  };
  predictionStability?: number;
  forecasts: MilestoneForecast[];
  initialFinalScore?: LiveMatchesPayload["liveMatches"][number]["finalScore"];
};

export type ForecastHistory = Record<string, ForecastHistoryEntry>;

export type ForecastHistoryMetrics = {
  historicalAccuracy: number | null;
  scoreMae: number | null;
  completedPredictions: number;
  winnerAccuracy: number | null;
  winnerBrierScore: number | null;
  predictionStability: number | null;
  stageMae: Record<string, number | null>;
  calibration: number | null;
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const round = (value: number) => Math.round(value);

function inningsKey(match: LiveMatchesPayload["liveMatches"][number]) {
  const currentInnings = match.innings.find((innings) => innings.isCurrent)?.number ?? 1;
  return `${match.battingTeam}|innings-${currentInnings}`;
}

function updateLimit(
  match: LiveMatchesPayload["liveMatches"][number],
  previous: ForecastHistoryEntry | undefined,
): number {
  if (!previous || previous.inningsKey !== inningsKey(match)) return 0;
  const wickets = Math.max(0, match.currentWickets - (previous.currentWickets ?? 0));
  const runs = Math.max(0, match.currentRuns - (previous.currentRuns ?? 0));
  const balls = Math.max(0, match.currentBalls - (previous.currentBalls ?? 0));
  if (wickets >= 2) return match.format === "t20" ? 14 : 18;
  if (wickets === 1) return match.format === "t20" ? 8 : 10;
  if (balls > 0) {
    const runRate = runs / (balls / Math.max(match.ballsPerOver, 1));
    const baseline = match.format === "t20" ? 8 : match.format === "odi" ? 5 : 4;
    if (runRate >= baseline * 1.55 || (runRate > 0 && runRate <= baseline * 0.45)) {
      return match.format === "t20" ? 5 : 7;
    }
  }
  return match.format === "t20" ? 3 : 4;
}

function moveTowards(current: number, target: number, limit: number): number {
  if (!Number.isFinite(current)) return round(target);
  if (!Number.isFinite(target)) return round(current);
  if (limit <= 0) return round(target);
  return round(current + clamp(target - current, -limit, limit));
}

function smoothScore(
  previous: LiveMatchesPayload["liveMatches"][number]["finalScore"],
  incoming: LiveMatchesPayload["liveMatches"][number]["finalScore"],
  currentRuns: number,
  limit: number,
) {
  const low = Math.max(currentRuns, moveTowards(previous.low, incoming.low, limit));
  const predicted = Math.max(
    currentRuns,
    moveTowards(previous.predicted, incoming.predicted, limit),
    low,
  );
  const high = Math.max(
    predicted,
    moveTowards(previous.high, incoming.high, limit),
  );
  return { predicted, low, high };
}

function smoothUncertainty(
  previous: NonNullable<LiveMatchesPayload["liveMatches"][number]["uncertainty"]>,
  incoming: NonNullable<LiveMatchesPayload["liveMatches"][number]["uncertainty"]>,
  currentRuns: number,
  limit: number,
) {
  const p50Low = Math.max(currentRuns, moveTowards(previous.p50Low, incoming.p50Low, limit));
  const p50High = Math.max(p50Low, moveTowards(previous.p50High, incoming.p50High, limit));
  const p80Low = Math.max(currentRuns, moveTowards(previous.p80Low, incoming.p80Low, limit * 1.4));
  const p80High = Math.max(p50High, moveTowards(previous.p80High, incoming.p80High, limit * 1.4));
  return { p50Low, p50High, p80Low, p80High };
}

function smoothWinProbability(
  previous: { battingTeamPercent: number; bowlingTeamPercent: number },
  incoming: { battingTeamPercent: number; bowlingTeamPercent: number },
  limit: number,
) {
  const percentageLimit = limit >= 12 ? 12 : limit >= 8 ? 8 : limit >= 5 ? 5 : 4;
  const battingTeamPercent = clamp(
    moveTowards(previous.battingTeamPercent, incoming.battingTeamPercent, percentageLimit),
    0,
    100,
  );
  return {
    battingTeamPercent,
    bowlingTeamPercent: 100 - battingTeamPercent,
  };
}

function enrichUpcomingForecast(
  incoming: MilestoneForecast,
  issued: MilestoneForecast | undefined,
  currentRuns: number,
  limit: number,
): MilestoneForecast {
  const initialPrediction = issued?.initialPrediction ?? issued?.currentPrediction ?? issued?.predicted ?? incoming.predicted;
  const initialLow = issued?.initialLow ?? issued?.predictedLow ?? issued?.low ?? incoming.low;
  const initialHigh = issued?.initialHigh ?? issued?.predictedHigh ?? issued?.high ?? incoming.high;
  const previousPrediction = issued?.currentPrediction ?? issued?.predicted ?? incoming.predicted;
  const previousLow = issued?.currentLow ?? issued?.low ?? incoming.low;
  const previousHigh = issued?.currentHigh ?? issued?.high ?? incoming.high;
  const predicted = issued
    ? Math.max(currentRuns, moveTowards(previousPrediction, incoming.predicted, limit))
    : Math.max(currentRuns, incoming.predicted);
  const low = Math.max(currentRuns, issued ? moveTowards(previousLow, incoming.low, limit) : incoming.low);
  const high = Math.max(predicted, issued ? moveTowards(previousHigh, incoming.high, limit) : incoming.high);
  const movement = issued
    ? Math.abs(predicted - previousPrediction)
    : 0;
  const stability = issued
    ? clamp(round(100 - (movement / Math.max(limit, 1)) * 20), 0, 100)
    : 100;
  return {
    ...incoming,
    predicted,
    low: Math.min(low, predicted),
    high,
    initialPrediction,
    initialLow,
    initialHigh,
    currentPrediction: predicted,
    currentLow: Math.min(low, predicted),
    currentHigh: high,
    stability,
  };
}

function metricsFromHistory(history: ForecastHistory): ForecastHistoryMetrics {
  const stabilityValues = Object.values(history)
    .map((entry) => entry.predictionStability)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const predictionStability = stabilityValues.length
    ? round((stabilityValues.reduce((sum, value) => sum + value, 0) / stabilityValues.length) * 10) / 10
    : null;
  const actuals = Object.values(history)
    .flatMap((entry) => entry.forecasts)
    .filter(
      (forecast) =>
        forecast.state === "actual" &&
        forecast.actualScore !== undefined &&
        forecast.finalError !== undefined,
    );
  if (!actuals.length) {
    return {
      historicalAccuracy: null,
      scoreMae: null,
      completedPredictions: 0,
      winnerAccuracy: null,
      winnerBrierScore: null,
      predictionStability,
      stageMae: {},
      calibration: null,
    };
  }
  const scoreMae = actuals.reduce((sum, forecast) => sum + (forecast.finalError ?? 0), 0) / actuals.length;
  const meanActual = actuals.reduce((sum, forecast) => sum + Math.max(1, forecast.actualScore ?? 0), 0) / actuals.length;
  const stageBuckets = new Map<number, number[]>();
  for (const forecast of actuals) {
    const values = stageBuckets.get(forecast.over) ?? [];
    values.push(forecast.finalError ?? 0);
    stageBuckets.set(forecast.over, values);
  }
  const stageMae = Object.fromEntries(
    [...stageBuckets.entries()]
      .sort(([left], [right]) => left - right)
      .map(([over, values]) => [
        String(over),
        round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
      ]),
  );
  return {
    historicalAccuracy: round(clamp(100 - (scoreMae / meanActual) * 100, 0, 100) * 10) / 10,
    scoreMae: round(scoreMae * 10) / 10,
    completedPredictions: actuals.length,
    // Winner outcomes are not supplied by the live feed, so do not invent
    // an accuracy number. It becomes available once a completed result feed
    // is wired into the history store.
    winnerAccuracy: null,
    winnerBrierScore: null,
    predictionStability,
    stageMae,
    calibration: null,
  };
}

export function calculateForecastHistoryMetrics(history: ForecastHistory): ForecastHistoryMetrics {
  return metricsFromHistory(history);
}

export function mergeForecastHistory(
  payload: LiveMatchesPayload,
  previousHistory: ForecastHistory,
  now = Date.now(),
): { payload: LiveMatchesPayload; history: ForecastHistory } {
  const history = Object.fromEntries(
    Object.entries(previousHistory).filter(
      ([, entry]) => now - entry.updatedAt <= HISTORY_RETENTION_MS,
    ),
  ) as ForecastHistory;

  const liveMatches = payload.liveMatches.map((match) => {
    const key = inningsKey(match);
    const previous = history[match.id];
    const inningsComplete =
      match.currentWickets >= 10 ||
      match.currentBalls >= match.inningsLimitOvers * match.ballsPerOver ||
      (match.target !== null && match.currentRuns >= match.target);
    const savedForecasts =
      previous?.inningsKey === key ? previous.forecasts : [];
    const finalCheckpoint = savedForecasts.find(
      (forecast) =>
        forecast.over === match.inningsLimitOvers &&
        forecast.initialPrediction !== undefined,
    );
    const inferredInitialFinalScore = finalCheckpoint
      ? {
          predicted: finalCheckpoint.initialPrediction ?? finalCheckpoint.predicted,
          low: finalCheckpoint.initialLow ?? finalCheckpoint.initialPrediction ?? finalCheckpoint.predicted,
          high: finalCheckpoint.initialHigh ?? finalCheckpoint.initialPrediction ?? finalCheckpoint.predicted,
        }
      : undefined;
    const serverInitialLooksLikeActual =
      inningsComplete &&
      match.initialFinalScore?.predicted === match.currentRuns &&
      inferredInitialFinalScore &&
      inferredInitialFinalScore.predicted !== match.currentRuns;
    const initialFinalScore =
      previous?.inningsKey === key
        ? previous.initialFinalScore ??
          (serverInitialLooksLikeActual ? inferredInitialFinalScore : match.initialFinalScore) ??
          inferredInitialFinalScore ??
          match.finalScore
        : match.initialFinalScore ?? match.finalScore;
    const finalScoreLimit = updateLimit(match, previous);
    const previousFinalScore =
      previous?.inningsKey === key
        ? previous.currentFinalScore ?? initialFinalScore
        : initialFinalScore;
    const currentFinalScore = inningsComplete
      ? match.finalScore
      : previous?.inningsKey === key
        ? smoothScore(previousFinalScore, match.finalScore, match.currentRuns, finalScoreLimit)
        : match.finalScore;
    const currentUncertainty = inningsComplete
      ? match.uncertainty
      : previous?.inningsKey === key && previous.currentUncertainty && match.uncertainty
        ? smoothUncertainty(previous.currentUncertainty, match.uncertainty, match.currentRuns, finalScoreLimit)
        : match.uncertainty;
    const initialWinProbability =
      previous?.inningsKey === key
        ? previous.initialWinProbability ?? match.initialWinProbability ?? {
            battingTeamPercent: match.winProbability.battingTeamPercent,
            bowlingTeamPercent: match.winProbability.bowlingTeamPercent,
          }
        : match.initialWinProbability ?? {
            battingTeamPercent: match.winProbability.battingTeamPercent,
            bowlingTeamPercent: match.winProbability.bowlingTeamPercent,
          };
    const previousWinProbability =
      previous?.inningsKey === key
        ? previous.currentWinProbability ?? initialWinProbability
        : initialWinProbability;
    const currentWinProbability = inningsComplete
      ? {
          battingTeamPercent: match.winProbability.battingTeamPercent,
          bowlingTeamPercent: match.winProbability.bowlingTeamPercent,
        }
      : previous?.inningsKey === key
        ? smoothWinProbability(previousWinProbability, match.winProbability, finalScoreLimit)
        : {
            battingTeamPercent: match.winProbability.battingTeamPercent,
            bowlingTeamPercent: match.winProbability.bowlingTeamPercent,
          };
    const issuedByOver = new Map(
      savedForecasts.map((forecast) => [forecast.over, forecast]),
    );

    for (const forecast of match.scoreForecasts) {
      const issued = issuedByOver.get(forecast.over);
      const checkpointBalls = forecast.over * match.ballsPerOver;
      // A provider snapshot taken exactly at a checkpoint is the best source
      // of truth for practice history. Preserve that score even when the
      // forecast engine would otherwise classify the passed checkpoint as a
      // baseline or locked estimate on the next refresh.
      if (match.currentBalls === checkpointBalls && forecast.state !== "actual") {
        const legacyRangeUnavailable =
          issued?.predictionRangeStatus === "unavailable";
        const predictedLow = legacyRangeUnavailable
          ? undefined
          : issued?.predictedLow ??
            issued?.low ??
            forecast.predictedLow ??
            forecast.low;
        const predictedHigh = legacyRangeUnavailable
          ? undefined
          : issued?.predictedHigh ??
            issued?.high ??
            forecast.predictedHigh ??
            forecast.high;
        const initialPrediction = issued?.initialPrediction ?? issued?.currentPrediction ?? issued?.predicted ?? forecast.predicted;
        const currentPrediction = issued?.currentPrediction ?? issued?.predicted ?? forecast.predicted;
        issuedByOver.set(forecast.over, {
          ...forecast,
          predicted: match.currentRuns,
          low: match.currentRuns,
          high: match.currentRuns,
          initialPrediction,
          initialLow: predictedLow,
          initialHigh: predictedHigh,
          currentPrediction,
          currentLow: currentPrediction,
          currentHigh: currentPrediction,
          actualScore: match.currentRuns,
          initialError: Math.abs(initialPrediction - match.currentRuns),
          finalError: Math.abs(currentPrediction - match.currentRuns),
          accuracy: round(clamp(100 - (Math.abs(currentPrediction - match.currentRuns) / Math.max(1, match.currentRuns)) * 100, 0, 100) * 10) / 10,
          // Keep the range that was visible before the checkpoint was
          // reached. A newly-generated baseline estimate is not the forecast
          // the user actually saw and can make the history look mismatched.
          ...(predictedLow === undefined ? {} : { predictedLow }),
          ...(predictedHigh === undefined ? {} : { predictedHigh }),
          ...(legacyRangeUnavailable
            ? { predictionRangeStatus: "unavailable" as const }
            : {}),
          state: "actual",
          actualWickets: match.currentWickets,
        });
        continue;
      }
      if (forecast.state === "actual") {
        // Providers can backfill several completed checkpoints at once. Do
        // not overwrite an already-issued range with the provider's fallback
        // innings-start band when that happens.
        const legacyRangeUnavailable =
          issued?.predictionRangeStatus === "unavailable";
        const predictedLow = legacyRangeUnavailable
          ? undefined
          : issued?.predictedLow ??
            issued?.low ??
            forecast.predictedLow ??
            forecast.low;
        const predictedHigh = legacyRangeUnavailable
          ? undefined
          : issued?.predictedHigh ??
            issued?.high ??
            forecast.predictedHigh ??
            forecast.high;
        const actualScore = forecast.actualScore ?? forecast.predicted;
        const initialPrediction = issued?.initialPrediction ?? issued?.currentPrediction ?? issued?.predicted ?? forecast.predicted;
        const currentPrediction = issued?.currentPrediction ?? issued?.predicted ?? forecast.predicted;
        issuedByOver.set(forecast.over, {
          ...forecast,
          actualScore,
          initialPrediction,
          initialLow: predictedLow,
          initialHigh: predictedHigh,
          currentPrediction,
          currentLow: currentPrediction,
          currentHigh: currentPrediction,
          initialError: Math.abs(initialPrediction - actualScore),
          finalError: Math.abs(currentPrediction - actualScore),
          accuracy: round(clamp(100 - (Math.abs(currentPrediction - actualScore) / Math.max(1, actualScore)) * 100, 0, 100) * 10) / 10,
          ...(predictedLow === undefined ? {} : { predictedLow }),
          ...(predictedHigh === undefined ? {} : { predictedHigh }),
          ...(legacyRangeUnavailable
            ? { predictionRangeStatus: "unavailable" as const }
            : {}),
        });
        continue;
      }
      if (forecast.state === "upcoming") {
        issuedByOver.set(
          forecast.over,
          enrichUpcomingForecast(forecast, issued, match.currentRuns, finalScoreLimit),
        );
        continue;
      }
      if (
        forecast.state === "baseline" &&
        issued &&
        issued.state !== "baseline"
      ) {
        continue;
      }

      issuedByOver.set(forecast.over, {
        ...enrichUpcomingForecast(forecast, issued, match.currentRuns, finalScoreLimit),
        state: forecast.state,
      });
    }

    const forecasts = [...issuedByOver.values()]
      .filter(
        (forecast) =>
          forecast.state === "upcoming" ||
          forecast.over * match.ballsPerOver <= match.currentBalls,
      )
      .map((forecast) => {
        const hasPassed =
          forecast.over * match.ballsPerOver <= match.currentBalls;
        if (hasPassed && forecast.state === "upcoming") {
          return { ...forecast, state: "locked" as const };
        }
        return forecast;
      })
      .sort((left, right) => left.over - right.over);

    // Keep projected totals cumulative after smoothing too. A later
    // checkpoint can never be below an earlier checkpoint, even when the
    // provider sends a noisy update between refreshes.
    let previousLow = match.currentRuns;
    let previousPredicted = match.currentRuns;
    let previousHigh = match.currentRuns;
    const stableForecasts = forecasts.map((forecast) => {
      // Locked/actual checkpoints are historical records. Keep their
      // prediction and range intact even when the live score has moved past
      // them; only future checkpoints participate in cumulative ordering.
      if (forecast.state !== "upcoming") return forecast;
      const low = Math.max(previousLow, forecast.low);
      const predicted = Math.max(low, previousPredicted, forecast.predicted);
      const high = Math.max(predicted, previousHigh, forecast.high);
      previousLow = low;
      previousPredicted = predicted;
      previousHigh = high;
      return {
        ...forecast,
        low,
        predicted,
        high,
        currentPrediction: forecast.state === "actual"
          ? forecast.currentPrediction
          : predicted,
        currentLow: forecast.state === "actual" ? forecast.currentLow : low,
        currentHigh: forecast.state === "actual" ? forecast.currentHigh : high,
      };
    });
    const stabilityValues = stableForecasts
      .filter((forecast) => forecast.state === "upcoming")
      .map((forecast) => forecast.stability ?? 100);
    const predictionStability = round(
      (stabilityValues.length
        ? stabilityValues.reduce((sum, value) => sum + value, 0) / stabilityValues.length
        : 100),
    );

    history[match.id] = {
      inningsKey: key,
      updatedAt: now,
      currentRuns: match.currentRuns,
      currentWickets: match.currentWickets,
      currentBalls: match.currentBalls,
      currentFinalScore,
      currentUncertainty,
      currentWinProbability,
      initialWinProbability,
      predictionStability,
      forecasts: stableForecasts,
      ...(inningsComplete
        ? {}
        : { initialFinalScore: initialFinalScore ?? match.finalScore }),
    };

    return {
      ...match,
      finalScore: currentFinalScore,
      uncertainty: currentUncertainty,
      initialFinalScore,
      winProbability: {
        ...match.winProbability,
        battingTeamPercent: currentWinProbability.battingTeamPercent,
        bowlingTeamPercent: currentWinProbability.bowlingTeamPercent,
      },
      initialWinProbability,
      predictionStability,
      scoreForecasts: stableForecasts,
    };
  });

  const historyMetrics = metricsFromHistory(history);

  return {
    payload: {
      ...payload,
      liveMatches,
      modelPerformance: {
        modelVersion: payload.modelPerformance?.modelVersion ?? "v1.8-context",
        snapshotCount: payload.modelPerformance?.snapshotCount ?? 0,
        averageConfidence: payload.modelPerformance?.averageConfidence ?? 0,
        averageRangeWidth: payload.modelPerformance?.averageRangeWidth ?? 0,
        lastSnapshotAt: payload.modelPerformance?.lastSnapshotAt ?? null,
        ...historyMetrics,
      },
    },
    history,
  };
}
