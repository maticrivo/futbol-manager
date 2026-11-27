import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'

export const memberRoleEnum = pgEnum('member_role', ['member', 'admin'])
export const memberStatusEnum = pgEnum('member_status', ['pending', 'active', 'disabled'])

const createdAt = () => timestamp('created_at', { withTimezone: true, precision: 3, mode: 'date' })
  .$defaultFn(() => new Date())
  .notNull()
const updatedAt = () => timestamp('updated_at', { withTimezone: true, precision: 3, mode: 'date' })
  .$defaultFn(() => new Date())
  .$onUpdate(() => new Date())
  .notNull()

export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar('name', { length: 120 }),
  email: varchar('email', { length: 254 }).unique(),
  emailVerified: timestamp('emailVerified', { withTimezone: true, precision: 3, mode: 'date' }),
  image: text('image'),
  role: memberRoleEnum('role').default('member').notNull(),
  status: memberStatusEnum('status').default('pending').notNull(),
  phone: varchar('phone', { length: 40 }),
  nickname: varchar('nickname', { length: 60 }),
  locale: varchar('locale', { length: 5 }).default('en').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const accounts = pgTable('account', {
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (account) => [
  primaryKey({ columns: [account.provider, account.providerAccountId] }),
])

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
})

export const matchStatusEnum = pgEnum('match_status', ['scheduled', 'locked', 'played', 'cancelled'])

export const matches = pgTable('matches', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  matchDate: char('match_date', { length: 10 }).notNull().unique(),
  kickoffAt: timestamp('kickoff_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  signupOpensAt: timestamp('signup_opens_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  guestPhaseAt: timestamp('guest_phase_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  lockAt: timestamp('lock_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  venue: varchar('venue', { length: 160 }).notNull().default(''),
  venueUrl: varchar('venue_url', { length: 500 }),
  costAgorot: integer('cost_agorot').notNull(),
  capacity: smallint('capacity').notNull(),
  status: matchStatusEnum('status').default('scheduled').notNull(),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const entryKindEnum = pgEnum('entry_kind', ['member', 'guest'])
export const entryStatusEnum = pgEnum('entry_status', ['confirmed', 'queued', 'offered', 'withdrawn', 'expired', 'removed', 'declined'])

export const entries = pgTable('entries', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  matchId: integer('match_id').notNull().references(() => matches.id),
  kind: entryKindEnum('kind').notNull(),
  memberId: text('member_id').references(() => users.id),
  guestName: varchar('guest_name', { length: 120 }),
  hostMemberId: text('host_member_id').references(() => users.id),
  status: entryStatusEnum('status').default('confirmed').notNull(),
  attended: boolean('attended'),
  offeredAt: timestamp('offered_at', { withTimezone: true, precision: 3, mode: 'date' }),
  offerExpiresAt: timestamp('offer_expires_at', { withTimezone: true, precision: 3, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique('entries_match_id_member_id_unique').on(table.matchId, table.memberId),
  index('entries_match_id_status_idx').on(table.matchId, table.status),
])

export const bagDuties = pgTable('bag_duties', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  matchId: integer('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  assignedMemberId: text('assigned_member_id').notNull().references(() => users.id),
  backupMemberId: text('backup_member_id').references(() => users.id),
  actualMemberId: text('actual_member_id').references(() => users.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  recordedBy: text('recorded_by').references(() => users.id),
  recordedAt: timestamp('recorded_at', { withTimezone: true, precision: 3, mode: 'date' }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique('bag_duties_match_id_unique').on(table.matchId),
])

export const chargeStatusEnum = pgEnum('charge_status', ['charged', 'waived'])

export const charges = pgTable('charges', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  matchId: integer('match_id').notNull().references(() => matches.id),
  memberId: text('member_id').notNull().references(() => users.id),
  amountAgorot: integer('amount_agorot').notNull(),
  billingMonth: char('billing_month', { length: 7 }).notNull(),
  status: chargeStatusEnum('status').default('charged').notNull(),
  waivedBy: text('waived_by').references(() => users.id),
  waiveReason: varchar('waive_reason', { length: 255 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique('charges_match_id_member_id_unique').on(table.matchId, table.memberId),
  index('charges_member_id_billing_month_idx').on(table.memberId, table.billingMonth),
])

export const paymentMethodEnum = pgEnum('payment_method', ['paybox', 'cash', 'other'])

export const payments = pgTable('payments', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  memberId: text('member_id').notNull().references(() => users.id),
  amountAgorot: integer('amount_agorot').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  method: paymentMethodEnum('method').notNull(),
  note: varchar('note', { length: 255 }),
  recordedBy: text('recorded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
})

export const paymentAllocations = pgTable('payment_allocations', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  paymentId: integer('payment_id').notNull().references(() => payments.id),
  billingMonth: char('billing_month', { length: 7 }).notNull(),
  amountAgorot: integer('amount_agorot').notNull(),
  createdAt: createdAt(),
}, (table) => [
  index('payment_allocations_billing_month_idx').on(table.billingMonth),
])

export const guestPaymentKindEnum = pgEnum('guest_payment_kind', ['payment', 'refund'])

export const guestPayments = pgTable('guest_payments', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  entryId: integer('entry_id').notNull().references(() => entries.id),
  amountAgorot: integer('amount_agorot').notNull(),
  kind: guestPaymentKindEnum('kind').notNull(),
  refundOfId: integer('refund_of_id'),
  paidAt: timestamp('paid_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  recordedBy: text('recorded_by').notNull().references(() => users.id),
  note: varchar('note', { length: 255 }),
  createdAt: createdAt(),
})

export const expenses = pgTable('expenses', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  billingMonth: char('billing_month', { length: 7 }).notNull().unique(),
  fieldCostAgorot: integer('field_cost_agorot').notNull(),
  updatedBy: text('updated_by').notNull().references(() => users.id),
  updatedAt: updatedAt(),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  memberId: text('member_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: varchar('endpoint', { length: 500 }).notNull().unique(),
  p256dh: varchar('p256dh', { length: 255 }).notNull(),
  auth: varchar('auth', { length: 255 }).notNull(),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: createdAt(),
})

export const notificationCategoryEnum = pgEnum('notification_category', [
  'signup_open',
  'guest_phase',
  'lock_reminder',
  'queue_offer',
  'bill_ready',
  'payment_reminder',
  'bag_duty',
])

export const notificationPrefs = pgTable('notification_prefs', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  memberId: text('member_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: notificationCategoryEnum('category').notNull(),
  enabled: boolean('enabled').notNull().default(true),
}, (table) => [
  unique('notification_prefs_member_id_category_unique').on(table.memberId, table.category),
])

export const notificationLog = pgTable('notification_logs', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  eventKey: varchar('event_key', { length: 200 }).notNull(),
  memberId: text('member_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sentAt: timestamp('sent_at', { withTimezone: true, precision: 3, mode: 'date' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
  unique('notification_logs_event_key_member_id_unique').on(table.eventKey, table.memberId),
])

export const settings = pgTable('settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: varchar('value', { length: 255 }).notNull(),
  updatedAt: updatedAt(),
})

export const auditLog = pgTable('audit_logs', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 80 }).notNull(),
  entity: varchar('entity', { length: 40 }).notNull(),
  entityId: varchar('entity_id', { length: 40 }),
  detail: jsonb('detail'),
  createdAt: createdAt(),
})
