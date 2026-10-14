import { NextResponse } from "next/server";
import { fetchLiveMatchesPayload } from "@/lib/live-cricket";
import { predictionSnapshots } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function snapshotKey(match: (Awaited<ReturnType<typeof fetchLiveMatchesPayload>>)["liveMatches"][number]) {
  const currentInnings = match.innings.find((innings) => innings.isCurrent)?.number ?? 1;
  return `${match.id}|innings-${currentInnings}`;
}

function inningsComplete(match: (Awaited<ReturnType<typeof fetchLiveMatchesPayload>>)["liveMatches"][number]) {
  return (
    match.currentWickets >= 10 ||
    match.currentBalls >= match.inningsLimitOvers * match.ballsPerOver ||
    (match.target !== null && match.currentRuns >= match.target)
  );
}

function updateLimit(
  match: (Awaited<ReturnType<typeof fetchLiveMatchesPayload>>)["liveMatches"][number],
  previous: { currentRuns: number; currentWickets: number; currentBalls: number } | undefined,
) {
  if (!previous) return 0;
  const wickets = Math.max(0, match.currentWickets - previous.currentWickets);
  const runs = Math.max(0, match.currentRuns - previous.currentRuns);
  const balls = Math.max(0, match.currentBalls - previous.currentBalls);
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

function moveTowards(current: number, target: number, limit: number) {
  return Math.round(current + Math.min(limit, Math.max(-limit, target - current)));
}

function smoothFinalScore(
  previous: { predicted: number; low: number; high: number },
  incoming: { predicted: number; low: number; high: number },
  currentRuns: number,
  limit: number,
) {
  const low = Math.max(currentRuns, moveTowards(previous.low, incoming.low, limit));
  const predicted = Math.max(
    currentRuns,
    low,
    moveTowards(previous.predicted, incoming.predicted, limit),
  );
  const high = Math.max(predicted, moveTowards(previous.high, incoming.high, limit));
  return { predicted, low, high };
}

export async function GET(request: Request) {
  const referrerUrl = new URL("/", request.url).toString();
  const payload = await fetchLiveMatchesPayload(referrerUrl);
  const db = await (async () => {
    try {
      const { getDb } = await import("@/db");
      return getDb();
    } catch {
      return null;
    }
  })();

  if (db && payload.liveMatches.length > 0) {
    try {
      const firstSnapshots = await Promise.all(
        payload.liveMatches.map(async (match) => {
          const [snapshot] = await db
            .select({
              finalPredicted: predictionSnapshots.finalPredicted,
              finalLow: predictionSnapshots.finalLow,
              finalHigh: predictionSnapshots.finalHigh,
            })
            .from(predictionSnapshots)
            .where(eq(predictionSnapshots.matchId, snapshotKey(match)))
            .orderBy(asc(predictionSnapshots.id))
            .limit(1);
          const [latest] = await db
            .select({
              finalPredicted: predictionSnapshots.finalPredicted,
              finalLow: predictionSnapshots.finalLow,
              finalHigh: predictionSnapshots.finalHigh,
              currentRuns: predictionSnapshots.currentRuns,
              currentWickets: predictionSnapshots.currentWickets,
              currentBalls: predictionSnapshots.currentBalls,
            })
            .from(predictionSnapshots)
            .where(eq(predictionSnapshots.matchId, snapshotKey(match)))
            .orderBy(desc(predictionSnapshots.id))
            .limit(1);
          return [match.id, { first: snapshot, latest }] as const;
        }),
      );
      const fixedScores = new Map(
        firstSnapshots
          .filter(([, snapshots]) => snapshots.first !== undefined)
          .map(([matchId, snapshots]) => [matchId, snapshots]),
      );
      payload.liveMatches = payload.liveMatches.map((match) => {
        const snapshots = fixedScores.get(match.id);
        if (!snapshots) return match;
        const initialFinalScore = {
          predicted: snapshots.first.finalPredicted,
          low: snapshots.first.finalLow,
          high: snapshots.first.finalHigh,
        };
        if (inningsComplete(match) || !snapshots.latest) {
          return { ...match, initialFinalScore };
        }
        const prior = {
          predicted: snapshots.latest.finalPredicted,
          low: snapshots.latest.finalLow,
          high: snapshots.latest.finalHigh,
        };
        const limit = updateLimit(match, snapshots.latest);
        const finalScore = smoothFinalScore(prior, match.finalScore, match.currentRuns, limit);
        return {
          ...match,
          finalScore,
          initialFinalScore,
          predictionStability: Math.round(
            Math.max(0, 100 - (Math.abs(finalScore.predicted - prior.predicted) / Math.max(limit, 1)) * 20),
          ),
        };
      });

      for (const match of payload.liveMatches) {
        await db.insert(predictionSnapshots).values({
          matchId: snapshotKey(match),
          title: match.title,
          format: match.format,
          status: match.status,
          generatedAt: payload.generatedAt,
          currentRuns: match.currentRuns,
          currentWickets: match.currentWickets,
          currentBalls: match.currentBalls,
          target: match.target,
          currentRunRate: match.currentRunRate,
          requiredRunRate: match.requiredRunRate,
          confidence: match.confidence,
          finalPredicted: match.finalScore.predicted,
          finalLow: match.finalScore.low,
          finalHigh: match.finalScore.high,
          feedUpdatedAt: match.feedUpdatedAt,
        });
      }

      const [metrics] = await db
        .select({
          snapshotCount: sql<number>`count(*)`,
          averageConfidence: sql<number>`avg(${predictionSnapshots.confidence})`,
          averageRangeWidth: sql<number>`avg(${predictionSnapshots.finalHigh} - ${predictionSnapshots.finalLow})`,
          lastSnapshotAt: sql<string | null>`max(${predictionSnapshots.generatedAt})`,
        })
        .from(predictionSnapshots);

      payload.modelPerformance = {
        modelVersion: "v1.8-context",
        snapshotCount: Number(metrics?.snapshotCount ?? 0),
        averageConfidence: Math.round(Number(metrics?.averageConfidence ?? 0)),
        averageRangeWidth: Number(metrics?.averageRangeWidth ?? 0),
        lastSnapshotAt: metrics?.lastSnapshotAt ?? null,
      };
    } catch (error) {
      console.error(
        "Prediction snapshot persistence failed",
        error instanceof Error ? error.message : String(error),
      );
      payload.modelPerformance = {
        modelVersion: "v1.8-context",
        snapshotCount: payload.liveMatches.length,
        averageConfidence: Math.round(
          payload.liveMatches.reduce((sum, match) => sum + match.confidence, 0) /
            payload.liveMatches.length,
        ),
        averageRangeWidth: Math.round(
          payload.liveMatches.reduce(
            (sum, match) =>
              sum + (match.finalScore.high - match.finalScore.low),
            0,
          ) / payload.liveMatches.length,
        ),
        lastSnapshotAt: payload.generatedAt,
      };
    }
  } else {
    payload.modelPerformance = {
      modelVersion: "v1.8-context",
      snapshotCount: 0,
      averageConfidence: 0,
      averageRangeWidth: 0,
      lastSnapshotAt: null,
    };
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "CDN-Cache-Control": "no-store",
      Expires: "0",
      Pragma: "no-cache",
    },
  });
}
