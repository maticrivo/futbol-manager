CREATE TYPE "public"."charge_status" AS ENUM('charged', 'waived');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('member', 'guest');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('confirmed', 'queued', 'offered', 'withdrawn', 'expired', 'removed');--> statement-breakpoint
CREATE TYPE "public"."guest_payment_kind" AS ENUM('payment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'locked', 'played', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('pending', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('signup_open', 'guest_phase', 'lock_reminder', 'queue_offer', 'bill_ready', 'payment_reminder');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('paybox', 'cash', 'other');--> statement-breakpoint
CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"actor_id" text,
	"action" varchar(80) NOT NULL,
	"entity" varchar(40) NOT NULL,
	"entity_id" varchar(40),
	"detail" jsonb,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "charges_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"match_id" integer NOT NULL,
	"member_id" text NOT NULL,
	"amount_agorot" integer NOT NULL,
	"billing_month" char(7) NOT NULL,
	"status" charge_status DEFAULT 'charged' NOT NULL,
	"waived_by" text,
	"waive_reason" varchar(255),
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "charges_match_id_member_id_unique" UNIQUE("match_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"match_id" integer NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"member_id" text,
	"guest_name" varchar(120),
	"host_member_id" text,
	"status" "entry_status" DEFAULT 'confirmed' NOT NULL,
	"attended" boolean,
	"offered_at" timestamp (3) with time zone,
	"offer_expires_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "entries_match_id_member_id_unique" UNIQUE("match_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"billing_month" char(7) NOT NULL,
	"field_cost_agorot" integer NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "expenses_billing_month_unique" UNIQUE("billing_month")
);
--> statement-breakpoint
CREATE TABLE "guest_payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "guest_payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" integer NOT NULL,
	"amount_agorot" integer NOT NULL,
	"kind" "guest_payment_kind" NOT NULL,
	"refund_of_id" integer,
	"paid_at" timestamp (3) with time zone NOT NULL,
	"recorded_by" text NOT NULL,
	"note" varchar(255),
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "matches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"match_date" char(10) NOT NULL,
	"kickoff_at" timestamp (3) with time zone NOT NULL,
	"signup_opens_at" timestamp (3) with time zone NOT NULL,
	"guest_phase_at" timestamp (3) with time zone NOT NULL,
	"lock_at" timestamp (3) with time zone NOT NULL,
	"venue" varchar(160) DEFAULT '' NOT NULL,
	"venue_url" varchar(500),
	"cost_agorot" integer NOT NULL,
	"capacity" smallint NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "matches_match_date_unique" UNIQUE("match_date")
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"event_key" varchar(200) NOT NULL,
	"member_id" text NOT NULL,
	"sent_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "notification_logs_event_key_member_id_unique" UNIQUE("event_key","member_id")
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_prefs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"member_id" text NOT NULL,
	"category" "notification_category" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_prefs_member_id_category_unique" UNIQUE("member_id","category")
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_allocations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_id" integer NOT NULL,
	"billing_month" char(7) NOT NULL,
	"amount_agorot" integer NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"member_id" text NOT NULL,
	"amount_agorot" integer NOT NULL,
	"paid_at" timestamp (3) with time zone NOT NULL,
	"method" "payment_method" NOT NULL,
	"note" varchar(255),
	"recorded_by" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "push_subscriptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"member_id" text NOT NULL,
	"endpoint" varchar(500) NOT NULL,
	"p256dh" varchar(255) NOT NULL,
	"auth" varchar(255) NOT NULL,
	"user_agent" varchar(255),
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" varchar(255) NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(120),
	"email" varchar(254),
	"emailVerified" timestamp (3) with time zone,
	"image" text,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"status" "member_status" DEFAULT 'pending' NOT NULL,
	"phone" varchar(40),
	"nickname" varchar(60),
	"locale" varchar(5) DEFAULT 'en' NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_waived_by_user_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_host_member_id_user_id_fk" FOREIGN KEY ("host_member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_payments" ADD CONSTRAINT "guest_payments_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_payments" ADD CONSTRAINT "guest_payments_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charges_member_id_billing_month_idx" ON "charges" USING btree ("member_id","billing_month");--> statement-breakpoint
CREATE INDEX "entries_match_id_status_idx" ON "entries" USING btree ("match_id","status");--> statement-breakpoint
CREATE INDEX "payment_allocations_billing_month_idx" ON "payment_allocations" USING btree ("billing_month");