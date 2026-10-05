CREATE TABLE `applications` (
	`id` varchar(30) NOT NULL,
	`org_id` varchar(30) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	CONSTRAINT `applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `applications_org_id_slug_unique` UNIQUE(`org_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `environments` (
	`id` varchar(30) NOT NULL,
	`application_id` varchar(30) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	CONSTRAINT `environments_id` PRIMARY KEY(`id`),
	CONSTRAINT `environments_application_id_slug_unique` UNIQUE(`application_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `flag_configs` (
	`flag_id` varchar(30) NOT NULL,
	`environment_id` varchar(30) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`off_variation_id` varchar(30) NOT NULL,
	`default_variation_id` varchar(30) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`updated_by` varchar(30) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	CONSTRAINT `flag_configs_flag_id_environment_id_pk` PRIMARY KEY(`flag_id`,`environment_id`)
);
--> statement-breakpoint
CREATE TABLE `flag_targets` (
	`flag_id` varchar(30) NOT NULL,
	`environment_id` varchar(30) NOT NULL,
	`subject_key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
	`variation_id` varchar(30) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	CONSTRAINT `flag_targets_flag_id_environment_id_subject_key_pk` PRIMARY KEY(`flag_id`,`environment_id`,`subject_key`)
);
--> statement-breakpoint
CREATE TABLE `flag_variations` (
	`id` varchar(30) NOT NULL,
	`flag_id` varchar(30) NOT NULL,
	`name` varchar(255) NOT NULL,
	`value` json NOT NULL,
	`sort_order` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	CONSTRAINT `flag_variations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flags` (
	`id` varchar(30) NOT NULL,
	`application_id` varchar(30) NOT NULL,
	`key` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`type` enum('boolean','string','number','json') NOT NULL,
	`created_by` varchar(30) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	`archived_at` datetime(3),
	CONSTRAINT `flags_id` PRIMARY KEY(`id`),
	CONSTRAINT `flags_application_id_key_unique` UNIQUE(`application_id`,`key`)
);
--> statement-breakpoint
CREATE TABLE `org_members` (
	`org_id` varchar(30) NOT NULL,
	`user_id` varchar(30) NOT NULL,
	`role` enum('owner','admin','member') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	CONSTRAINT `org_members_org_id_user_id_pk` PRIMARY KEY(`org_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` varchar(30) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `signing_keys` (
	`id` varchar(30) NOT NULL,
	`environment_id` varchar(30) NOT NULL,
	`label` varchar(255) NOT NULL,
	`algorithm` enum('ed25519') NOT NULL,
	`public_key_pem` text NOT NULL,
	`created_by` varchar(30) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	`last_used_at` datetime(3),
	`revoked_at` datetime(3),
	CONSTRAINT `signing_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`environment_id` varchar(30) NOT NULL,
	`key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
	`attributes` json NOT NULL,
	`first_seen_at` datetime(3) NOT NULL,
	`last_seen_at` datetime(3) NOT NULL,
	CONSTRAINT `subjects_environment_id_key_pk` PRIMARY KEY(`environment_id`,`key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(30) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (utc_timestamp(3)),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `applications` ADD CONSTRAINT `applications_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `environments` ADD CONSTRAINT `environments_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flag_configs` ADD CONSTRAINT `flag_configs_flag_id_flags_id_fk` FOREIGN KEY (`flag_id`) REFERENCES `flags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flag_configs` ADD CONSTRAINT `flag_configs_environment_id_environments_id_fk` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flag_configs` ADD CONSTRAINT `flag_configs_off_variation_id_flag_variations_id_fk` FOREIGN KEY (`off_variation_id`) REFERENCES `flag_variations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flag_configs` ADD CONSTRAINT `flag_configs_default_variation_id_flag_variations_id_fk` FOREIGN KEY (`default_variation_id`) REFERENCES `flag_variations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flag_configs` ADD CONSTRAINT `flag_configs_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flag_targets` ADD CONSTRAINT `flag_targets_flag_id_flags_id_fk` FOREIGN KEY (`flag_id`) REFERENCES `flags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flag_targets` ADD CONSTRAINT `flag_targets_environment_id_environments_id_fk` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flag_targets` ADD CONSTRAINT `flag_targets_variation_id_flag_variations_id_fk` FOREIGN KEY (`variation_id`) REFERENCES `flag_variations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flag_variations` ADD CONSTRAINT `flag_variations_flag_id_flags_id_fk` FOREIGN KEY (`flag_id`) REFERENCES `flags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flags` ADD CONSTRAINT `flags_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flags` ADD CONSTRAINT `flags_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_members` ADD CONSTRAINT `org_members_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `org_members` ADD CONSTRAINT `org_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signing_keys` ADD CONSTRAINT `signing_keys_environment_id_environments_id_fk` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signing_keys` ADD CONSTRAINT `signing_keys_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_environment_id_environments_id_fk` FOREIGN KEY (`environment_id`) REFERENCES `environments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `flag_configs_environment_id_idx` ON `flag_configs` (`environment_id`);--> statement-breakpoint
CREATE INDEX `flag_targets_environment_id_idx` ON `flag_targets` (`environment_id`);--> statement-breakpoint
CREATE INDEX `flag_variations_flag_id_idx` ON `flag_variations` (`flag_id`);--> statement-breakpoint
CREATE INDEX `org_members_user_id_idx` ON `org_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `signing_keys_environment_id_idx` ON `signing_keys` (`environment_id`);