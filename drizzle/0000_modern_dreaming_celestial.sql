CREATE TABLE `prediction_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` text NOT NULL,
	`title` text NOT NULL,
	`format` text NOT NULL,
	`status` text NOT NULL,
	`generated_at` text NOT NULL,
	`current_runs` integer NOT NULL,
	`current_wickets` integer NOT NULL,
	`current_balls` integer NOT NULL,
	`target` integer,
	`current_run_rate` real NOT NULL,
	`required_run_rate` real,
	`confidence` integer NOT NULL,
	`final_predicted` integer NOT NULL,
	`final_low` integer NOT NULL,
	`final_high` integer NOT NULL,
	`feed_updated_at` text
);
