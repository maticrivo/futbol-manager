ALTER TYPE "public"."notification_category" ADD VALUE 'bag_duty';--> statement-breakpoint
CREATE TABLE "bag_duties" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bag_duties_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"match_id" integer NOT NULL,
	"assigned_member_id" text NOT NULL,
	"backup_member_id" text,
	"actual_member_id" text,
	"assigned_at" timestamp (3) with time zone NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "bag_duties_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
ALTER TABLE "bag_duties" ADD CONSTRAINT "bag_duties_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_duties" ADD CONSTRAINT "bag_duties_assigned_member_id_user_id_fk" FOREIGN KEY ("assigned_member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_duties" ADD CONSTRAINT "bag_duties_backup_member_id_user_id_fk" FOREIGN KEY ("backup_member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_duties" ADD CONSTRAINT "bag_duties_actual_member_id_user_id_fk" FOREIGN KEY ("actual_member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bag_duties" ADD CONSTRAINT "bag_duties_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;