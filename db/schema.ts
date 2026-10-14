import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const predictionSnapshots = sqliteTable("prediction_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: text("match_id").notNull(),
  title: text("title").notNull(),
  format: text("format").notNull(),
  status: text("status").notNull(),
  generatedAt: text("generated_at").notNull(),
  currentRuns: integer("current_runs").notNull(),
  currentWickets: integer("current_wickets").notNull(),
  currentBalls: integer("current_balls").notNull(),
  target: integer("target"),
  currentRunRate: real("current_run_rate").notNull(),
  requiredRunRate: real("required_run_rate"),
  confidence: integer("confidence").notNull(),
  finalPredicted: integer("final_predicted").notNull(),
  finalLow: integer("final_low").notNull(),
  finalHigh: integer("final_high").notNull(),
  feedUpdatedAt: text("feed_updated_at"),
});

export type PredictionSnapshot = typeof predictionSnapshots.$inferSelect;
