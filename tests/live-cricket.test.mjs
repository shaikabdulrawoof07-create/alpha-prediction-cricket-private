import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRawMatchFromEspn,
  buildLivePrediction,
  buildLiveMatchesPayload,
  extractEspnMatchIds,
  extractCricbuzzMilestoneScores,
  extractCricbuzzRecentSignals,
  mergeEspnCandidateIds,
  mergeLiveMatchSources,
  parseCricbuzzMatchesHtml,
  parseEntitySportLiveMatches,
  parseScoreText,
} from "../lib/live-cricket.ts";
import { mergeForecastHistory } from "../lib/forecast-history.ts";

function makeMatch(overrides = {}) {
  return {
    id: "live-match",
    u: "madurai-panthers-vs-chepauk-super-gillies-t20",
    d: "2026-08-14T14:00:00.0000000",
    t: "t20",
    s: "Madurai Panthers need 152 runs in 60 balls",
    toss: "madurai panthers opt to bowl",
    ms: "live",
    t1: "CSG",
    t2: "MP",
    t1n: "Chepauk Super Gillies",
    t2n: "Madurai Panthers",
    t1s: "89∕6 ᚜10᚛",
    t2s: "240∕2 ᚜20᚛",
    ...overrides,
  };
}

function makeEspnMatch(overrides = {}) {
  return {
    description: "Live T20",
    match: {
      live_match: "Y",
      match_status: "current",
      result_name: "",
      general_class_card: "Other T20",
      general_class_name: "Other Twenty20 matches",
      scheduled_overs: "20",
      team1_id: "1",
      team1_name: "Chepauk Super Gillies",
      team1_abbreviation: "CSG",
      team2_id: "2",
      team2_name: "Madurai Panthers",
      team2_abbreviation: "MDP",
      ground_name: "Dindigul",
      toss_winner_team_id: "2",
      toss_decision_name: "field",
      current_summary: "Madurai Panthers 154/7 (15.1 ov)",
      ...overrides.match,
    },
    innings: overrides.innings ?? [
      {
        innings_number: "1",
        batted: 1,
        batting_team_id: 1,
        bowling_team_id: 2,
        runs: 240,
        wickets: 2,
        balls: 120,
        overs: "20.0",
        target: 0,
        ball_limit: 120,
        bpo: 6,
        live_current: 0,
      },
      {
        innings_number: "2",
        batted: 1,
        batting_team_id: 2,
        bowling_team_id: 1,
        runs: 154,
        wickets: 7,
        balls: 91,
        overs: "15.1",
        target: 241,
        ball_limit: 120,
        bpo: 6,
        live_current: 1,
      },
    ],
    live: {
      status: "Madurai Panthers require another 87 runs with 29 balls remaining",
      innings_recent: [
        {
          innings_number: 2,
          run_rate: 10.8,
          wickets: 1,
        },
      ],
      batting: [
        {
          innings_number: 2,
          live_current: 1,
          strike_rate: 160,
          batting_averages_series: { batting_strike_rate: 145 },
        },
        {
          innings_number: 2,
          live_current: 2,
          strike_rate: 120,
          batting_averages_series: { batting_strike_rate: 130 },
        },
      ],
      bowling: [
        {
          innings_number: 2,
          live_current: 1,
          economy_rate: 8.2,
          bowling_averages_series: { economy_rate: 7.8 },
        },
      ],
      ...overrides.live,
    },
  };
}

test("parses the provider's wrapped whole-over score", () => {
  const score = parseScoreText("89∕6 ᚜10᚛", "t20");

  assert.ok(score);
  assert.equal(score.runs, 89);
  assert.equal(score.wickets, 6);
  assert.equal(score.ballsElapsed, 60);
  assert.equal(score.oversText, "10");
});

test("parses a wrapped partial over", () => {
  const score = parseScoreText("277∕7 ᚜48｡4᚛", "odi");

  assert.ok(score);
  assert.equal(score.ballsElapsed, 292);
});

test("projects the live chase from 10 overs rather than the innings start", () => {
  const prediction = buildLivePrediction(makeMatch());

  assert.ok(prediction);
  assert.equal(prediction.currentBalls, 60);
  assert.equal(prediction.currentScore, "89/6 - 10 overs");
  assert.equal(prediction.battingTeam, "Madurai Panthers");
  assert.equal(prediction.target, 241);
  assert.equal(prediction.requiredRunRate, 15.2);
  assert.deepEqual(
    prediction.scoreForecasts.map((forecast) => forecast.over),
    [6, 10, 15, 20],
  );
  assert.ok(prediction.finalScore.low >= 89);
  assert.ok(prediction.finalScore.high <= 241);
});

test("derives the target from runs needed when the completed score is absent", () => {
  const prediction = buildLivePrediction(makeMatch({ t2s: "" }));

  assert.ok(prediction);
  assert.equal(prediction.target, 241);
  assert.equal(prediction.requiredRunRate, 15.2);
});

test("uses a rain-revised T20 target instead of the original innings total", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      s: "Madurai Panthers need 79 runs in 83 balls - 2nd Innings reduced to 15 overs due to rain, Target 84",
      t1s: "98/9 19.0",
      t2s: "5/1 1.1",
    }),
  );

  assert.ok(prediction);
  assert.equal(prediction.format, "t20");
  assert.equal(prediction.inningsLimitOvers, 15);
  assert.equal(prediction.target, 84);
  assert.equal(prediction.currentScore, "5/1 - 1.1 overs");
  assert.deepEqual(
    prediction.scoreForecasts.map((forecast) => forecast.over),
    [6, 10, 15],
  );
});

test("ignores a provider target on a normal first-innings T20 card", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      id: "t20-first-innings-target-noise",
      t1s: "0/0 0.0",
      t2s: "",
      target: 150,
      s: "Live - toss complete",
    }),
  );

  assert.ok(prediction);
  assert.equal(prediction.target, null);
  assert.equal(prediction.requiredRunRate, null);
  assert.ok(prediction.finalScore.predicted > 0);
});

test("backfills passed milestones with innings-start estimates", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      s: "Madurai Panthers opt to bat",
      toss: "madurai panthers opt to bat",
      t1s: "112∕3 ᚜13｡2᚛",
      t2s: "",
    }),
  );

  assert.ok(prediction);
  assert.deepEqual(
    prediction.scoreForecasts.map((forecast) => forecast.over),
    [6, 10, 15, 20],
  );
  assert.deepEqual(
    prediction.scoreForecasts.map((forecast) => forecast.state),
    ["baseline", "baseline", "upcoming", "upcoming"],
  );
});

test("keeps an issued 6-over forecast after the checkpoint passes", () => {
  const before = buildLivePrediction(
    makeMatch({
      s: "Chepauk Super Gillies opt to bat",
      toss: "chepauk super gillies opt to bat",
      t1s: "48/1 5.5",
      t2s: "",
    }),
  );
  const after = buildLivePrediction(
    makeMatch({
      s: "Chepauk Super Gillies opt to bat",
      toss: "chepauk super gillies opt to bat",
      t1s: "52/1 6.1",
      t2s: "",
    }),
  );

  assert.ok(before);
  assert.ok(after);
  const initial = mergeForecastHistory(
    {
      generatedAt: "2026-08-15T10:00:00Z",
      source: { provider: "test", url: "test" },
      liveMatches: [before],
      scoreOnlyMatches: [],
    },
    {},
    1,
  );
  const issuedAtSix = initial.payload.liveMatches[0].scoreForecasts.find(
    (forecast) => forecast.over === 6,
  );
  const updated = mergeForecastHistory(
    {
      generatedAt: "2026-08-15T10:01:00Z",
      source: { provider: "test", url: "test" },
      liveMatches: [after],
      scoreOnlyMatches: [],
    },
    initial.history,
    2,
  );
  const lockedAtSix = updated.payload.liveMatches[0].scoreForecasts.find(
    (forecast) => forecast.over === 6,
  );

  assert.ok(issuedAtSix);
  assert.ok(lockedAtSix);
  assert.equal(lockedAtSix.state, "locked");
  assert.equal(
    lockedAtSix.predicted,
    issuedAtSix.currentPrediction ?? issuedAtSix.predicted,
  );
  assert.equal(lockedAtSix.initialPrediction, issuedAtSix.initialPrediction);
  assert.deepEqual(
    updated.payload.liveMatches[0].scoreForecasts.map(
      (forecast) => forecast.over,
    ),
    [6, 10, 15, 20],
  );
});

test("anchors the initial final-score range while smoothing live refreshes", () => {
  const before = buildLivePrediction(
    makeMatch({
      t1s: "48/1 5.5",
      t2s: "",
      s: "Chepauk Super Gillies opt to bat",
      toss: "chepauk super gillies opt to bat",
    }),
  );
  const after = buildLivePrediction(
    makeMatch({
      t1s: "92/2 10.0",
      t2s: "",
      s: "Chepauk Super Gillies opt to bat",
      toss: "chepauk super gillies opt to bat",
    }),
  );

  assert.ok(before);
  assert.ok(after);
  assert.notDeepEqual(before.finalScore, after.finalScore);
  const initial = mergeForecastHistory(
    {
      generatedAt: "2026-08-15T10:00:00Z",
      source: { provider: "test", url: "test" },
      liveMatches: [before],
      scoreOnlyMatches: [],
    },
    {},
    1,
  );
  const updated = mergeForecastHistory(
    {
      generatedAt: "2026-08-15T10:01:00Z",
      source: { provider: "test", url: "test" },
      liveMatches: [after],
      scoreOnlyMatches: [],
    },
    initial.history,
    2,
  );

  assert.deepEqual(
    updated.payload.liveMatches[0].initialFinalScore,
    initial.payload.liveMatches[0].finalScore,
  );
  assert.notDeepEqual(
    updated.payload.liveMatches[0].finalScore,
    initial.payload.liveMatches[0].finalScore,
  );
  assert.ok(
    updated.payload.liveMatches[0].finalScore.predicted -
      initial.payload.liveMatches[0].finalScore.predicted <= 8,
  );
});

test("limits normal live prediction movement and preserves initial milestone values", () => {
  const before = buildLivePrediction(
    makeMatch({
      t1s: "48/0 5.5",
      t2s: "",
      s: "Chepauk Super Gillies opt to bat",
      toss: "chepauk super gillies opt to bat",
    }),
  );
  const after = buildLivePrediction(
    makeMatch({
      t1s: "60/0 7.0",
      t2s: "",
      s: "Chepauk Super Gillies opt to bat",
      toss: "chepauk super gillies opt to bat",
    }),
  );
  assert.ok(before);
  assert.ok(after);
  const initial = mergeForecastHistory(
    {
      generatedAt: "2026-08-15T10:00:00Z",
      source: { provider: "test", url: "test" },
      liveMatches: [before],
      scoreOnlyMatches: [],
    },
    {},
    1,
  );
  const updated = mergeForecastHistory(
    {
      generatedAt: "2026-08-15T10:01:00Z",
      source: { provider: "test", url: "test" },
      liveMatches: [after],
      scoreOnlyMatches: [],
    },
    initial.history,
    2,
  );
  const first = initial.payload.liveMatches[0];
  const second = updated.payload.liveMatches[0];
  const firstTwenty = first.scoreForecasts.find((forecast) => forecast.over === 20);
  const secondTwenty = second.scoreForecasts.find((forecast) => forecast.over === 20);
  assert.ok(firstTwenty);
  assert.ok(secondTwenty);
  assert.equal(secondTwenty.initialPrediction, firstTwenty.predicted);
  assert.ok(Math.abs(secondTwenty.currentPrediction - firstTwenty.currentPrediction) <= 3);
  assert.equal(second.initialFinalScore.predicted, first.finalScore.predicted);
  assert.ok(Math.abs(second.finalScore.predicted - first.finalScore.predicted) <= 3);
  assert.equal(
    second.initialWinProbability.battingTeamPercent,
    first.winProbability.battingTeamPercent,
  );
  assert.ok(
    Math.abs(
      second.winProbability.battingTeamPercent -
        first.winProbability.battingTeamPercent,
    ) <= 4,
  );
  assert.ok(second.predictionStability >= 80);
});

test("records the actual score when a refresh lands on a completed checkpoint", () => {
  const exact = buildLivePrediction(
    makeMatch({
      s: "Chepauk Super Gillies opt to bat",
      toss: "chepauk super gillies opt to bat",
      t1s: "55/2 6.0",
      t2s: "",
    }),
  );

  assert.ok(exact);
  const merged = mergeForecastHistory(
    {
      generatedAt: "2026-08-15T10:01:00Z",
      source: { provider: "test", url: "test" },
      liveMatches: [exact],
      scoreOnlyMatches: [],
    },
    {},
    2,
  );
  const checkpoint = merged.payload.liveMatches[0].scoreForecasts.find(
    (forecast) => forecast.over === 6,
  );

  assert.ok(checkpoint);
  assert.equal(checkpoint.state, "actual");
  assert.equal(checkpoint.predicted, 55);
  assert.equal(checkpoint.actualWickets, 2);
  assert.equal(checkpoint.predictedLow, 48);
  assert.equal(checkpoint.predictedHigh, 68);
});

test("keeps the range that was issued before an actual checkpoint", () => {
  const before = buildLivePrediction(
    makeMatch({
      s: "Chepauk Super Gillies opt to bat",
      toss: "chepauk super gillies opt to bat",
      t1s: "48/1 5.5",
      t2s: "",
    }),
  );
  const exact = buildLivePrediction(
    makeMatch({
      s: "Chepauk Super Gillies opt to bat",
      toss: "chepauk super gillies opt to bat",
      t1s: "55/2 6.0",
      t2s: "",
    }),
  );

  assert.ok(before);
  assert.ok(exact);
  const initial = mergeForecastHistory(
    {
      generatedAt: "2026-08-15T10:00:00Z",
      source: { provider: "test", url: "test" },
      liveMatches: [before],
      scoreOnlyMatches: [],
    },
    {},
    1,
  );
  const issued = initial.payload.liveMatches[0].scoreForecasts.find(
    (forecast) => forecast.over === 6,
  );
  const updated = mergeForecastHistory(
    {
      generatedAt: "2026-08-15T10:01:00Z",
      source: { provider: "test", url: "test" },
      liveMatches: [exact],
      scoreOnlyMatches: [],
    },
    initial.history,
    2,
  );
  const recorded = updated.payload.liveMatches[0].scoreForecasts.find(
    (forecast) => forecast.over === 6,
  );

  assert.ok(issued);
  assert.ok(recorded);
  assert.equal(recorded.state, "actual");
  assert.equal(recorded.predicted, 55);
  assert.equal(recorded.predictedLow, issued.low);
  assert.equal(recorded.predictedHigh, issued.high);
});

test("recognizes Hundred descriptors instead of filtering the match", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      u: "manchester-vs-leeds-the-hundred-mens-competition",
      s: "Sunrisers Leeds opt to bowl",
      bpo: 5,
      maxBalls: 100,
      t1s: "166∕2 ᚜85᚛",
      t2s: "",
    }),
  );

  assert.ok(prediction);
  assert.equal(prediction.format, "hundred");
});

test("normalizes live T20I cards from associate internationals", () => {
  const matches = [
    makeMatch({
      id: "bul-lux",
      u: "bulgaria-vs-luxembourg-t20i",
      t: "T20I",
      s: "Bulgaria 10/0 after 1.2 overs",
      ms: "IN PROGRESS",
      t1: "BUL",
      t2: "LUX",
      t1n: "Bulgaria",
      t2n: "Luxembourg",
      t1s: "10/0 1.2",
      t2s: "",
    }),
    makeMatch({
      id: "por-cze",
      u: "portugal-vs-czech-republic-t20i",
      t: "t20i",
      s: "Portugal 8/1 after 1 over",
      ms: "live",
      t1: "POR",
      t2: "CZE",
      t1n: "Portugal",
      t2n: "Czech Republic",
      t1s: "8/1 1.0",
      t2s: "",
    }),
  ];

  const live = buildLiveMatchesPayload(matches, "https://example.test").liveMatches;

  assert.equal(live.length, 2);
  assert.deepEqual(live.map((match) => match.format), ["t20", "t20"]);
  assert.deepEqual(live.map((match) => match.currentRuns), [10, 8]);
});

test("discovers live Indian domestic matches from the Cricbuzz current board", () => {
  const currentMatchesList = {
    responseLastUpdated: "1788175214",
    typeMatches: [
      {
        matchType: "League",
        seriesMatches: [
          {
            seriesAdWrapper: {
              seriesName: "Sher-E-Punjab T20 League, 2026",
              matches: [
                {
                  matchInfo: {
                    matchId: 171083,
                    matchFormat: "T20",
                    state: "In Progress",
                    status: "Fazilka Falcons opt to bowl",
                    currBatTeamId: 1,
                    team1: { teamId: 1, teamName: "Jalandhar Warriors", teamSName: "JW" },
                    team2: { teamId: 2, teamName: "Fazilka Falcons", teamSName: "FF" },
                    venueInfo: { ground: "I.S. Bindra Stadium", city: "Mohali" },
                  },
                  matchScore: {
                    team1Score: { inngs1: { inningsId: 1, runs: 144, wickets: 5, overs: 15.1 } },
                    team2Score: {},
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const flight = `15:${JSON.stringify({ currentMatchesList })}`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;
  const matches = parseCricbuzzMatchesHtml(html);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].t, "t20");
  assert.equal(matches[0].ms, "In Progress");
  assert.equal(matches[0].t1n, "Jalandhar Warriors");
  assert.equal(matches[0].t1s, "144/5 15.1");
  assert.equal(matches[0].venue, "I.S. Bindra Stadium, Mohali");
  assert.equal(matches[0].feedUpdatedAt, "2026-08-31T11:20:14.000Z");
});

test("extracts every completed Cricbuzz checkpoint score", () => {
  const raw = makeMatch({
    battingTeamIndex: 1,
    t1: "CSG",
    t1n: "Chepauk Super Gillies",
    t2: "MP",
    t2n: "Madurai Panthers",
  });
  const flight = `15:${JSON.stringify({
    overSummaryList: [
      { inningsId: 1, overs: 10, score: 88, wickets: 2, timestamp: 200, batTeamName: "CSG" },
      { inningsId: 1, overs: 6, score: 52, wickets: 1, timestamp: 100, batTeamName: "CSG" },
    ],
  })}`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;

  assert.deepEqual(extractCricbuzzMilestoneScores(html, raw), {
    6: { runs: 52, wickets: 1 },
    10: { runs: 88, wickets: 2 },
  });
});

test("extracts recent Cricbuzz pace and wicket pressure for live calibration", () => {
  const raw = makeMatch({
    battingTeamIndex: 1,
    t1: "CSG",
    t1n: "Chepauk Super Gillies",
    t2: "MP",
    t2n: "Madurai Panthers",
  });
  const flight = `15:${JSON.stringify({
    overSummaryList: [
      { inningsId: 1, overs: 10, runs: 4, score: 70, wickets: 1, timestamp: 300, batTeamName: "CSG" },
      { inningsId: 1, overs: 9, runs: 12, score: 66, wickets: 1, timestamp: 200, batTeamName: "CSG" },
      { inningsId: 1, overs: 8, runs: 8, score: 54, wickets: 0, timestamp: 100, batTeamName: "CSG" },
      { inningsId: 1, overs: 7, runs: 5, score: 46, wickets: 0, timestamp: 50, batTeamName: "CSG" },
    ],
  })}`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`;

  assert.deepEqual(extractCricbuzzRecentSignals(html, raw), {
    recentRunRate: 8,
    recentWickets: 1,
  });
});

test("anchors forecasts to checkpoint pace when a feed omits recent form", () => {
  const raw = makeMatch({
    id: "checkpoint-form",
    t1s: "60/3 12.0",
    t2s: "",
    actualMilestoneScores: {
      6: { runs: 28, wickets: 1 },
      10: { runs: 43, wickets: 2 },
    },
  });
  const prediction = buildLivePrediction(raw);

  assert.ok(prediction);
  assert.ok(prediction.ensemble.signals.includes("Momentum"));
  assert.ok(prediction.scoreForecasts.some((forecast) => forecast.over === 15));
  assert.ok(
    prediction.scoreForecasts
      .filter((forecast) => forecast.state === "upcoming")
      .every((forecast) => forecast.low >= prediction.currentRuns),
  );
});

test("normalizes live Indian domestic widgets into full T20 cards", () => {
  const matches = parseEntitySportLiveMatches({
    status: "ok",
    response: [
      {
        match_id: 98298,
        format_str: "T20",
        status_str: "Live",
        status_note: "Alleppey Ripples need 140 runs in 12.3 remaining overs",
        game_state_str: "Play Ongoing",
        teama: {
          name: "Alleppey Ripples",
          short_name: "AP",
          scores_full: "*55/2 (7.3 ov)",
        },
        teamb: {
          name: "Trivandrum Royals",
          short_name: "TR",
          scores_full: "194/4 (20 ov)",
        },
        timestamp_start: 1788166800,
        venue: { name: "Greenfield International Stadium", location: "Thiruvananthapuram" },
      },
    ],
  }, "2026-08-31T11:30:00.000Z");

  assert.equal(matches.length, 1);
  assert.equal(matches[0].t, "T20");
  assert.equal(matches[0].ms, "Play Ongoing");
  assert.equal(matches[0].battingTeamIndex, 1);
  assert.equal(matches[0].t1s, "*55/2 (7.3 ov)");
  assert.equal(matches[0].venue, "Greenfield International Stadium, Thiruvananthapuram");

  const prediction = buildLivePrediction(matches[0]);
  assert.ok(prediction);
  assert.equal(prediction.format, "t20");
  assert.equal(prediction.currentScore, "55/2 - 7.3 overs");
  assert.equal(prediction.target, 195);
  assert.equal(prediction.battingTeam, "Alleppey Ripples");
});

test("normalizes OD shorthand as ODI", () => {
  const prediction = buildLivePrediction(makeMatch({ t: "OD", t1s: "42/1 8.0" }));

  assert.ok(prediction);
  assert.equal(prediction.format, "odi");
});

test("creates a full forecast card for a live Test match", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      t: "Test",
      t1s: "67/2 15.0",
      t2s: "",
      s: "Live Test match",
    }),
  );

  assert.ok(prediction);
  assert.equal(prediction.format, "test");
  assert.equal(prediction.formatLabel, "Test");
  assert.ok(prediction.scoreForecasts.some((forecast) => forecast.state === "upcoming"));
  assert.equal(
    prediction.winProbability.battingTeamPercent + prediction.winProbability.bowlingTeamPercent,
    100,
  );
});

test("does not cap a non-final Test innings at the previous innings total", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      id: "test-second-innings",
      t: "Test",
      t1s: "204/2 52.0",
      t2s: "203/10 61.0",
      target: 204,
      inningsNumber: 2,
      s: "Day 2: Stumps - Durham lead by 253 runs",
    }),
  );

  assert.ok(prediction);
  assert.equal(prediction.target, null);
  assert.ok(prediction.finalScore.predicted > prediction.currentRuns);
  assert.ok(
    prediction.scoreForecasts
      .filter((forecast) => forecast.state === "upcoming")
      .some((forecast) => forecast.high > prediction.currentRuns),
  );
});

test("ignores a generic previous-innings target on a normal Test card", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      id: "test-target-noise",
      t: "Test",
      t1s: "3/0 1.3",
      t2s: "434/10 145.0",
      target: 434,
      s: "Target 434 - Day 1: Play in progress",
    }),
  );

  assert.ok(prediction);
  assert.equal(prediction.target, null);
  assert.equal(prediction.requiredRunRate, null);
  assert.ok(prediction.finalScore.predicted > prediction.currentRuns);
});

test("keeps a fourth-innings Test target and caps the chase at it", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      id: "test-fourth-innings",
      t: "Test",
      t1s: "120/4 40.0",
      t2s: "249/10 80.0",
      target: 250,
      inningsNumber: 4,
      s: "Day 5 - Chepauk Super Gillies need 130 runs",
    }),
  );

  assert.ok(prediction);
  assert.equal(prediction.target, 250);
  assert.ok(prediction.finalScore.high <= 250);
  assert.ok(
    prediction.scoreForecasts
      .filter((forecast) => forecast.state === "upcoming")
      .every((forecast) => forecast.high <= 250),
  );
});

test("does not forecast future checkpoints after an innings is complete", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      id: "test-all-out",
      t: "Test",
      t1s: "393/10 104.0",
      t2s: "",
      inningsNumber: 2,
      s: "Day 2: Stumps",
    }),
  );

  assert.ok(prediction);
  assert.equal(
    prediction.scoreForecasts.filter((forecast) => forecast.state === "upcoming").length,
    0,
  );
  assert.deepEqual(prediction.finalScore, {
    predicted: 393,
    low: 393,
    high: 393,
  });
});

test("keeps future score ranges cumulative and internally ordered", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      id: "monotonic-test",
      t: "Test",
      t1s: "55/3 21.3",
      t2s: "",
      inningsNumber: 2,
      s: "Day 2: Stumps - Worcestershire trail by 34 runs",
    }),
  );

  assert.ok(prediction);
  const future = prediction.scoreForecasts.filter(
    (forecast) => forecast.state === "upcoming",
  );
  for (let index = 0; index < future.length; index += 1) {
    assert.ok(future[index].low <= future[index].predicted);
    assert.ok(future[index].predicted <= future[index].high);
    if (index > 0) {
      assert.ok(future[index].low >= future[index - 1].low);
      assert.ok(future[index].predicted >= future[index - 1].predicted);
      assert.ok(future[index].high >= future[index - 1].high);
    }
  }
});

test("extracts every unique match id from the official live index", () => {
  const xml = `
    <guid>http://www.cricinfo.com/ci/engine/match/123.html</guid>
    <guid>http://www.cricinfo.com/ci/engine/match/456.html</guid>
    <guid>http://www.cricinfo.com/ci/engine/match/123.html</guid>
  `;

  assert.deepEqual(extractEspnMatchIds(xml), ["123", "456"]);
});

test("keeps live-index matches when the secondary ESPN list is incomplete", () => {
  assert.deepEqual(
    mergeEspnCandidateIds(["123", "456"], ["456", "789"]),
    ["123", "456", "789"],
  );
});

test("prefers the fresher duplicate feed and regenerates the forecast", () => {
  const earlier = buildLivePrediction(
    makeMatch({ t1s: "72/2 8.0", t2s: "", feedUpdatedAt: "2026-08-17T10:00:00Z" }),
  );
  const later = buildLivePrediction(
    makeMatch({ t1s: "88/2 9.0", t2s: "", feedUpdatedAt: "2026-08-17T10:01:00Z" }),
  );

  assert.ok(earlier);
  assert.ok(later);
  const merged = mergeLiveMatchSources([earlier, later]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].currentRuns, 88);
  assert.notEqual(earlier.finalScore.predicted, later.finalScore.predicted);
});

test("deduplicates common provider aliases and keeps the fresher score", () => {
  const stale = buildLivePrediction(
    makeMatch({
      id: "hong-kong-provider-a",
      t: "odi",
      t1: "HK",
      t2: "UAE",
      t1n: "Hong Kong, China",
      t2n: "United Arab Emirates",
      t1s: "5/0 1.0",
      t2s: "",
    }),
  );
  const fresh = buildLivePrediction(
    makeMatch({
      id: "hong-kong-provider-b",
      t: "odi",
      t1: "UAE",
      t2: "HK",
      t1n: "United Arab Emirates",
      t2n: "Hong Kong",
      t1s: "54/1 7.4",
      t2s: "",
    }),
  );

  assert.ok(stale);
  assert.ok(fresh);
  const merged = mergeLiveMatchSources([stale, fresh]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].currentRuns, 54);
});

test("orders cards by short-format priority before longer formats", () => {
  const testCard = buildLivePrediction(
    makeMatch({
      id: "test-card",
      t: "test",
      u: "test-fixture",
      t1: "TZ",
      t2: "NZ",
      t1n: "Test Zone",
      t2n: "North Zone",
      t1s: "120/3 40.0",
      t2s: "",
    }),
  );
  const odiCard = buildLivePrediction(
    makeMatch({
      id: "odi-card",
      t: "odi",
      u: "odi-fixture",
      t1: "IND",
      t2: "AUS",
      t1n: "India",
      t2n: "Australia",
      t1s: "180/4 35.0",
      t2s: "",
    }),
  );
  const t20Card = buildLivePrediction(
    makeMatch({
      id: "t20-card",
      t: "t20",
      u: "t20-fixture",
      t1: "CSG",
      t2: "MP",
      t1n: "Chepauk Super Gillies",
      t2n: "Madurai Panthers",
      t1s: "80/2 10.0",
      t2s: "",
    }),
  );

  assert.ok(testCard);
  assert.ok(odiCard);
  assert.ok(t20Card);
  assert.deepEqual(
    mergeLiveMatchSources([testCard, odiCard, t20Card]).map((match) => match.format),
    ["t20", "odi", "test"],
  );
});

test("keeps an active match even when the feed has not published a score yet", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      s: "Match delayed due to wet outfield - Saint Lucia Kings opt to bowl",
      toss: "saint lucia kings opt to bowl",
      t1s: "",
      t2s: "",
      ms: "live",
    }),
  );

  assert.ok(prediction);
  assert.equal(prediction.currentScore, "0/0 - 0 overs");
  assert.equal(prediction.currentBalls, 0);
});

test("does not promote scheduled no-score fixtures to live cards", () => {
  const payload = buildLiveMatchesPayload(
    [
      makeMatch({
        id: "scheduled-no-score",
        s: "Match starts at Sep 07, 18:00 GMT",
        ms: "live",
        t1s: "",
        t2s: "",
      }),
    ],
    "https://example.test",
  );

  assert.equal(payload.liveMatches.length, 0);
  assert.equal(payload.scoreOnlyMatches.length, 0);
  assert.equal(payload.feedHealth.activeMatches, 0);
});

test("treats innings break as an active live state", () => {
  const prediction = buildLivePrediction(
    makeMatch({
      ms: "innings break",
      s: "Innings break - target 171",
      t1s: "170/6 20.0",
      t2s: "",
    }),
  );

  assert.ok(prediction);
  assert.equal(prediction.currentScore, "0/0 - 0 overs");
  assert.equal(prediction.target, 171);
  assert.equal(prediction.innings.length, 2);
  assert.equal(prediction.innings[0].score, "170/6 - 20 overs");
  assert.equal(prediction.innings[1].isCurrent, true);
});

test("uses live batting and bowling form inside the simulation", () => {
  const hotBatting = buildLivePrediction(
    makeMatch({
      t1s: "82/2 10.0",
      t2s: "",
      recentRunRate: 12.5,
      recentWickets: 0,
      battingStrikeRate: 185,
      bowlerEconomy: 11.8,
    }),
  );
  const bowlingOnTop = buildLivePrediction(
    makeMatch({
      t1s: "82/2 10.0",
      t2s: "",
      recentRunRate: 5.5,
      recentWickets: 2,
      battingStrikeRate: 82,
      bowlerEconomy: 5.2,
    }),
  );

  assert.ok(hotBatting);
  assert.ok(bowlingOnTop);
  assert.ok(hotBatting.finalScore.predicted > bowlingOnTop.finalScore.predicted);
  assert.ok(hotBatting.wicketProbability < bowlingOnTop.wicketProbability);
});

test("adds T20 phase and wicket-resource calibration to every forecast", () => {
  const stable = buildLivePrediction(
    makeMatch({
      id: "t20-phase-stable",
      t1s: "74/2 10.0",
      t2s: "",
      recentRunRate: 8.8,
      recentWickets: 0,
    }),
  );
  const collapse = buildLivePrediction(
    makeMatch({
      id: "t20-phase-collapse",
      t1s: "74/6 10.0",
      t2s: "",
      recentRunRate: 5.2,
      recentWickets: 3,
    }),
  );

  assert.ok(stable);
  assert.ok(collapse);
  assert.ok(stable.ensemble.signals.includes("T20 phase model"));
  assert.ok(collapse.ensemble.signals.includes("T20 phase model"));
  assert.ok(stable.finalScore.predicted > collapse.finalScore.predicted);
  for (const forecast of collapse.scoreForecasts) {
    assert.ok(forecast.low <= forecast.predicted);
    assert.ok(forecast.predicted <= forecast.high);
  }
});

test("adds venue-aware uncertainty bands and event shock context", () => {
  const highScoring = buildLivePrediction(
    makeMatch({
      id: "venue-high",
      venue: "Wankhede Stadium",
      t1s: "92/2 10.0",
      t2s: "",
      recentRunRate: 13.5,
      recentWickets: 0,
    }),
  );
  const collapse = buildLivePrediction(
    makeMatch({
      id: "venue-collapse",
      venue: "MA Chidambaram Stadium (Chepauk)",
      t1s: "92/5 10.0",
      t2s: "",
      recentRunRate: 4.2,
      recentWickets: 2,
    }),
  );

  assert.ok(highScoring);
  assert.ok(collapse);
  assert.ok(highScoring.uncertainty);
  assert.ok(highScoring.uncertainty.p80Low <= highScoring.finalScore.low);
  assert.ok(highScoring.finalScore.high <= highScoring.uncertainty.p80High);
  assert.equal(highScoring.eventShock.level, "strong-over");
  assert.equal(collapse.eventShock.level, "collapse");
  assert.ok(highScoring.finalScore.predicted > collapse.finalScore.predicted);
});

test("keeps all active live widgets, not just rows marked exactly live", () => {
  const cards = [
    makeMatch({
      ms: "innings break",
      s: "Innings break - target 171",
      t1s: "170/6 20.0",
      t2s: "",
    }),
    makeMatch({
      ms: "delayed",
      s: "Match delayed due to rain - Antigua and Barbuda Falcons opt to bowl",
      t1s: "",
      t2s: "",
    }),
    makeMatch({
      ms: "completed",
      s: "Match over",
      t1s: "170/6 20.0",
      t2s: "171/5 19.5",
    }),
  ];

  const live = buildLiveMatchesPayload(cards, "https://example.test").liveMatches;

  assert.equal(live.length, 2);
});

test("reports provider diagnostics and creates forecast cards for every active format", () => {
  const payload = buildLiveMatchesPayload(
    [
      makeMatch({ ms: "2ND_INNINGS_PENDING", s: "2nd innings pending", t1s: "160/6 20.0", t2s: "" }),
      makeMatch({ id: "unsupported", t: "T10", ms: "LIVE", s: "live", t1s: "32/2 4.0", t2s: "" }),
      makeMatch({ id: "complete", ms: "COMPLETED", s: "Match over", t1s: "160/6 20.0", t2s: "161/4 18.0" }),
    ],
    "https://example.test",
  );

  assert.equal(payload.feedHealth.matchesReceived, 3);
  assert.equal(payload.feedHealth.pagesFetched, 1);
  assert.equal(payload.feedHealth.activeMatches, 2);
  assert.equal(payload.feedHealth.supportedMatches, 2);
  assert.equal(payload.feedHealth.scoreOnlyMatches, 0);
  assert.equal(payload.feedHealth.filteredUnsupported, 0);
  assert.equal(payload.feedHealth.formatCounts.t20, 1);
  assert.equal(payload.feedHealth.formatCounts.other, 1);
  assert.equal(payload.liveMatches.length, 2);
  assert.equal(payload.scoreOnlyMatches.length, 0);
});

test("normalizes an ESPN live chase into the prediction engine", () => {
  const raw = buildRawMatchFromEspn(makeEspnMatch(), "1548224");
  assert.ok(raw);
  assert.equal(raw.t1n, "Madurai Panthers");
  assert.equal(raw.t2n, "Chepauk Super Gillies");
  assert.equal(raw.target, 241);

  const prediction = buildLivePrediction(raw);
  assert.ok(prediction);
  assert.equal(prediction.currentScore, "154/7 - 15.1 overs");
  assert.deepEqual(prediction.innings, [
    {
      number: 1,
      team: "Chepauk Super Gillies",
      shortName: "CSG",
      score: "240/2 - 20 overs",
      isCurrent: false,
      target: null,
    },
    {
      number: 2,
      team: "Madurai Panthers",
      shortName: "MDP",
      score: "154/7 - 15.1 overs",
      isCurrent: true,
      target: 241,
    },
  ]);
  assert.equal(prediction.requiredRunRate, 18);
  assert.equal(prediction.ensemble.modelCount, 9);
  assert.deepEqual(prediction.ensemble.signals, [
    "Monte Carlo",
    "Rate trend",
    "Wicket resources",
    "Bayesian rate",
    "Venue prior",
    "Live pace anchor",
    "T20 phase model",
    "Momentum",
    "Player matchup",
  ]);
  assert.ok(prediction.ensemble.agreement >= 45);
  assert.deepEqual(
    prediction.scoreForecasts.map((forecast) => forecast.over),
    [6, 10, 15, 20],
  );
});

test("uses fresh ball data and T20 checkpoints for a reduced chase", () => {
  const payload = makeEspnMatch({
    match: {
      live_innings_number: "2",
      current_summary: "St Lucia Kings 4/1 (1.0 ov)",
      team1_id: "5157",
      team1_name: "St Lucia Kings",
      team1_abbreviation: "SLK",
      team2_id: "7156",
      team2_name: "Antigua and Barbuda Falcons",
      team2_abbreviation: "ABF",
    },
    innings: [
      {
        innings_number: "1",
        batted: 1,
        batting_team_id: 7156,
        bowling_team_id: 5157,
        runs: 98,
        wickets: 9,
        balls: 114,
        overs: "19.0",
        target: 0,
        ball_limit: 114,
        bpo: 6,
        live_current: 0,
      },
      {
        innings_number: "2",
        batted: 1,
        batting_team_id: 5157,
        bowling_team_id: 7156,
        runs: 4,
        wickets: 1,
        balls: 6,
        overs: "1.0",
        target: 83,
        ball_limit: 90,
        bpo: 6,
        live_current: 1,
      },
    ],
    live: {
      status: "St Lucia Kings require another 79 runs",
      innings_recent: [],
    },
  });
  const playByPlay = {
    commentary: {
      items: [
        {
          sequence: 200600,
          period: 2,
          bbbTimestamp: 1786759000000,
          innings: {
            number: 2,
            balls: 36,
            runs: 42,
            wickets: 2,
            target: 83,
            ballLimit: 90,
          },
        },
        {
          sequence: 201000,
          period: 2,
          bbbTimestamp: 1786759300000,
          innings: {
            number: 2,
            balls: 60,
            runs: 65,
            wickets: 3,
            target: 83,
            ballLimit: 90,
          },
        },
        {
          sequence: 201010,
          period: 2,
          bbbTimestamp: 1786759360000,
          innings: {
            number: 2,
            balls: 61,
            runs: 69,
            wickets: 3,
            target: 83,
            ballLimit: 90,
          },
        },
      ],
    },
  };
  const raw = buildRawMatchFromEspn(payload, "1534185", playByPlay);

  assert.ok(raw);
  assert.equal(raw.t, "t20");
  assert.equal(raw.t1s, "69/3 10.1");
  assert.equal(raw.maxBalls, 90);

  const prediction = buildLivePrediction(raw);
  assert.ok(prediction);
  assert.equal(prediction.format, "t20");
  assert.equal(prediction.inningsLimitOvers, 15);
  assert.equal(prediction.currentScore, "69/3 - 10.1 overs");
  assert.deepEqual(
    prediction.scoreForecasts.map((forecast) => forecast.over),
    [6, 10, 15],
  );
  assert.deepEqual(
    prediction.scoreForecasts.slice(0, 2).map((forecast) => ({
      score: `${forecast.predicted}/${forecast.actualWickets}`,
      state: forecast.state,
    })),
    [
      { score: "42/2", state: "actual" },
      { score: "65/3", state: "actual" },
    ],
  );
});

test("starts baseline predictions at the toss before the first legal ball", () => {
  const payload = makeEspnMatch({
    match: {
      live_innings_number: "1",
      current_summary: "Madurai Panthers won the toss and elected to field",
    },
    innings: [],
    live: { status: "Match starting shortly" },
  });
  const raw = buildRawMatchFromEspn(payload, "1548224");

  assert.ok(raw);
  assert.equal(raw.t1n, "Chepauk Super Gillies");
  assert.equal(raw.t1s, "0/0 0.0");

  const prediction = buildLivePrediction(raw);
  assert.ok(prediction);
  assert.equal(prediction.currentScore, "0/0 - 0 overs");
  assert.deepEqual(
    prediction.scoreForecasts.map((forecast) => forecast.over),
    [6, 10, 15, 20],
  );
});

test("recognizes ESPN five-ball 100-ball games as The Hundred", () => {
  const payload = makeEspnMatch({
    match: {
      general_class_card: "Twenty20",
      general_class_name: "Twenty20 matches",
      team1_name: "Manchester Super Giants",
      team1_abbreviation: "MSG",
      team2_name: "Sunrisers Leeds",
      team2_abbreviation: "SRL",
      current_summary: "Manchester Super Giants 100/1 (10.0 ov)",
    },
    innings: [
      {
        innings_number: "1",
        batted: 1,
        batting_team_id: 1,
        bowling_team_id: 2,
        runs: 100,
        wickets: 1,
        balls: 50,
        overs: "10.0",
        target: 0,
        ball_limit: 100,
        bpo: 5,
        live_current: 1,
      },
    ],
    live: { status: "In progress" },
  });
  const raw = buildRawMatchFromEspn(payload, "1521263");
  assert.ok(raw);

  const prediction = buildLivePrediction(raw);
  assert.ok(prediction);
  assert.equal(prediction.format, "hundred");
  assert.equal(prediction.ballsPerOver, 5);
  assert.equal(prediction.currentScore, "100/1 - 50 balls");
  assert.deepEqual(
    prediction.scoreForecasts.map((forecast) => forecast.over),
    [5, 10, 15, 20],
  );
});

test("selects the new chase when a provider leaves the old innings marker stale", () => {
  const payload = makeEspnMatch({
    match: {
      general_class_card: "Twenty20",
      general_class_name: "Twenty20 matches",
      live_innings_number: "2",
      team1_name: "Manchester Super Giants (Men)",
      team1_abbreviation: "MSG-M",
      team2_name: "Sunrisers Leeds (Men)",
      team2_abbreviation: "SRL-M",
      current_summary: "Sunrisers Leeds (Men) 10/0 (1.0 ov)",
    },
    innings: [
      {
        innings_number: "1",
        batted: 1,
        batting_team_id: 1,
        bowling_team_id: 2,
        runs: 186,
        wickets: 4,
        balls: 100,
        overs: "20.0",
        target: 0,
        ball_limit: 100,
        bpo: 5,
        live_current: 1,
      },
      {
        innings_number: "2",
        batted: 1,
        batting_team_id: 2,
        bowling_team_id: 1,
        runs: 10,
        wickets: 0,
        balls: 5,
        overs: "1.0",
        target: 187,
        ball_limit: 100,
        bpo: 5,
        live_current: 0,
      },
    ],
    live: {
      status: "Sunrisers Leeds (Men) require another 177 runs",
      innings_recent: [],
    },
  });
  const raw = buildRawMatchFromEspn(payload, "1521263");

  assert.ok(raw);
  assert.equal(raw.t1n, "Sunrisers Leeds (Men)");
  assert.equal(raw.t1s, "10/0 1.0");
  assert.equal(raw.target, 187);
});

test("does not return recently completed matches from the live index", () => {
  const payload = makeEspnMatch({
    match: {
      result_name: "won",
      current_summary: "Madurai Panthers 241/7 - Match over",
    },
    live: { status: "Madurai Panthers won by 3 wickets" },
  });

  assert.equal(buildRawMatchFromEspn(payload, "1548224"), null);
});
