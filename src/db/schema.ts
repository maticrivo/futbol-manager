import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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

export const members = pgTable('members', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 254 }).unique(),
  phone: varchar('phone', { length: 40 }),
  nickname: varchar('nickname', { length: 60 }),
  image: text('image'),
  role: memberRoleEnum('role').default('member').notNull(),
  locale: varchar('locale', { length: 5 }).default('en').notNull(),
  status: memberStatusEnum('status').default('active').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const loginTokens = pgTable('login_tokens', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  memberId: integer('member_id').notNull().references(() => members.id),
  tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, precision: 3, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, precision: 3, mode: 'date' }),
  createdAt: createdAt(),
})

export const sessions = pgTable('sessions', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  memberId: integer('member_id').notNull().references(() => members.id),
  tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: createdAt(),
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
export const entryStatusEnum = pgEnum('entry_status', ['confirmed', 'queued', 'offered', 'withdrawn', 'expired', 'removed'])

export const entries = pgTable('entries', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  matchId: integer('match_id').notNull().references(() => matches.id),
  kind: entryKindEnum('kind').notNull(),
  memberId: integer('member_id').references(() => members.id),
  guestName: varchar('guest_name', { length: 120 }),
  hostMemberId: integer('host_member_id').references(() => members.id),
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

export const chargeStatusEnum = pgEnum('charge_status', ['charged', 'waived'])

export const charges = pgTable('charges', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  matchId: integer('match_id').notNull().references(() => matches.id),
  memberId: integer('member_id').notNull().references(() => members.id),
  amountAgorot: integer('amount_agorot').notNull(),
  billingMonth: char('billing_month', { length: 7 }).notNull(),
  status: chargeStatusEnum('status').default('charged').notNull(),
  waivedBy: integer('waived_by').references(() => members.id),
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
  memberId: integer('member_id').notNull().references(() => members.id),
  amountAgorot: integer('amount_agorot').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true, precision: 3, mode: 'date' }).notNull(),
  method: paymentMethodEnum('method').notNull(),
  note: varchar('note', { length: 255 }),
  recordedBy: integer('recorded_by').notNull().references(() => members.id),
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
  recordedBy: integer('recorded_by').notNull().references(() => members.id),
  note: varchar('note', { length: 255 }),
  createdAt: createdAt(),
})

export const expenses = pgTable('expenses', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  billingMonth: char('billing_month', { length: 7 }).notNull().unique(),
  fieldCostAgorot: integer('field_cost_agorot').notNull(),
  updatedBy: integer('updated_by').notNull().references(() => members.id),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3, mode: 'date' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  memberId: integer('member_id').notNull().references(() => members.id),
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
])

export const notificationPrefs = pgTable('notification_prefs', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  memberId: integer('member_id').notNull().references(() => members.id),
  category: notificationCategoryEnum('category').notNull(),
  enabled: boolean('enabled').notNull().default(true),
}, (table) => [
  unique('notification_prefs_member_id_category_unique').on(table.memberId, table.category),
])

export const notificationLog = pgTable('notification_logs', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  eventKey: varchar('event_key', { length: 200 }).notNull(),
  memberId: integer('member_id').notNull().references(() => members.id),
  sentAt: timestamp('sent_at', { withTimezone: true, precision: 3, mode: 'date' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
  unique('notification_logs_event_key_member_id_unique').on(table.eventKey, table.memberId),
])

export const settings = pgTable('settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: varchar('value', { length: 255 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3, mode: 'date' })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
})

export const auditLog = pgTable('audit_logs', {
  id: integer('id').generatedAlwaysAsIdentity().primaryKey(),
  actorId: integer('actor_id').references(() => members.id),
  action: varchar('action', { length: 80 }).notNull(),
  entity: varchar('entity', { length: 40 }).notNull(),
  entityId: varchar('entity_id', { length: 40 }),
  detail: jsonb('detail'),
  createdAt: createdAt(),
})
