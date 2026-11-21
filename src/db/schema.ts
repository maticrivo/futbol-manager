import {
  boolean,
  char,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core'

export const memberRoleEnum = mysqlEnum('role', ['member', 'admin'])
export const memberStatusEnum = mysqlEnum('status', ['pending', 'active', 'disabled'])

export const members = mysqlTable('members', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 254 }).unique(),
  phone: varchar('phone', { length: 40 }),
  nickname: varchar('nickname', { length: 60 }),
  image: text('image'),
  role: memberRoleEnum.default('member').notNull(),
  locale: varchar('locale', { length: 5 }).default('en').notNull(),
  status: memberStatusEnum.default('active').notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
})

export const loginTokens = mysqlTable('login_tokens', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('member_id', { unsigned: true }).notNull().references(() => members.id),
  tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
  lastUsedAt: datetime('last_used_at', { mode: 'date', fsp: 3 }),
  revokedAt: datetime('revoked_at', { mode: 'date', fsp: 3 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const sessions = mysqlTable('sessions', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('member_id', { unsigned: true }).notNull().references(() => members.id),
  tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const matchStatusEnum = mysqlEnum('status', ['scheduled', 'locked', 'played', 'cancelled'])

export const matches = mysqlTable('matches', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  matchDate: char('match_date', { length: 10 }).notNull().unique(),
  kickoffAt: datetime('kickoff_at', { mode: 'date', fsp: 3 }).notNull(),
  signupOpensAt: datetime('signup_opens_at', { mode: 'date', fsp: 3 }).notNull(),
  guestPhaseAt: datetime('guest_phase_at', { mode: 'date', fsp: 3 }).notNull(),
  lockAt: datetime('lock_at', { mode: 'date', fsp: 3 }).notNull(),
  venue: varchar('venue', { length: 160 }).notNull().default(''),
  venueUrl: varchar('venue_url', { length: 500 }),
  costAgorot: int('cost_agorot', { unsigned: true }).notNull(),
  capacity: smallint('capacity', { unsigned: true }).notNull(),
  status: matchStatusEnum.default('scheduled').notNull(),
  notes: text('notes'),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
})

export const entryKindEnum = mysqlEnum('kind', ['member', 'guest'])
export const entryStatusEnum = mysqlEnum('status', ['confirmed', 'queued', 'offered', 'withdrawn', 'expired', 'removed'])

export const entries = mysqlTable('entries', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  matchId: int('match_id', { unsigned: true }).notNull().references(() => matches.id),
  kind: entryKindEnum.notNull(),
  memberId: int('member_id', { unsigned: true }).references(() => members.id),
  guestName: varchar('guest_name', { length: 120 }),
  hostMemberId: int('host_member_id', { unsigned: true }).references(() => members.id),
  status: entryStatusEnum.default('confirmed').notNull(),
  attended: boolean('attended'),
  offeredAt: datetime('offered_at', { mode: 'date', fsp: 3 }),
  offerExpiresAt: datetime('offer_expires_at', { mode: 'date', fsp: 3 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
}, (table) => [
  unique('entries_match_id_member_id_unique').on(table.matchId, table.memberId),
  index('entries_match_id_status_idx').on(table.matchId, table.status),
])

export const chargeStatusEnum = mysqlEnum('status', ['charged', 'waived'])

export const charges = mysqlTable('charges', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  matchId: int('match_id', { unsigned: true }).notNull().references(() => matches.id),
  memberId: int('member_id', { unsigned: true }).notNull().references(() => members.id),
  amountAgorot: int('amount_agorot', { unsigned: true }).notNull(),
  billingMonth: char('billing_month', { length: 7 }).notNull(),
  status: chargeStatusEnum.default('charged').notNull(),
  waivedBy: int('waived_by', { unsigned: true }).references(() => members.id),
  waiveReason: varchar('waive_reason', { length: 255 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
}, (table) => [
  unique('charges_match_id_member_id_unique').on(table.matchId, table.memberId),
  index('charges_member_id_billing_month_idx').on(table.memberId, table.billingMonth),
])

export const paymentMethodEnum = mysqlEnum('method', ['paybox', 'cash', 'other'])

export const payments = mysqlTable('payments', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('member_id', { unsigned: true }).notNull().references(() => members.id),
  amountAgorot: int('amount_agorot').notNull(),
  paidAt: datetime('paid_at', { mode: 'date', fsp: 3 }).notNull(),
  method: paymentMethodEnum.notNull(),
  note: varchar('note', { length: 255 }),
  recordedBy: int('recorded_by', { unsigned: true }).notNull().references(() => members.id),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const paymentAllocations = mysqlTable('payment_allocations', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  paymentId: int('payment_id', { unsigned: true }).notNull().references(() => payments.id),
  billingMonth: char('billing_month', { length: 7 }).notNull(),
  amountAgorot: int('amount_agorot').notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
  index('payment_allocations_billing_month_idx').on(table.billingMonth),
])

export const guestPaymentKindEnum = mysqlEnum('kind', ['payment', 'refund'])

export const guestPayments = mysqlTable('guest_payments', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  entryId: int('entry_id', { unsigned: true }).notNull().references(() => entries.id),
  amountAgorot: int('amount_agorot').notNull(),
  kind: guestPaymentKindEnum.notNull(),
  refundOfId: int('refund_of_id', { unsigned: true }),
  paidAt: datetime('paid_at', { mode: 'date', fsp: 3 }).notNull(),
  recordedBy: int('recorded_by', { unsigned: true }).notNull().references(() => members.id),
  note: varchar('note', { length: 255 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const expenses = mysqlTable('expenses', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  billingMonth: char('billing_month', { length: 7 }).notNull().unique(),
  fieldCostAgorot: int('field_cost_agorot', { unsigned: true }).notNull(),
  updatedBy: int('updated_by', { unsigned: true }).notNull().references(() => members.id),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull().$onUpdate(() => new Date()),
})

export const pushSubscriptions = mysqlTable('push_subscriptions', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('member_id', { unsigned: true }).notNull().references(() => members.id),
  endpoint: varchar('endpoint', { length: 500 }).notNull().unique(),
  p256dh: varchar('p256dh', { length: 255 }).notNull(),
  auth: varchar('auth', { length: 255 }).notNull(),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const notificationCategoryEnum = mysqlEnum('category', [
  'signup_open',
  'guest_phase',
  'lock_reminder',
  'queue_offer',
  'bill_ready',
  'payment_reminder',
])

export const notificationPrefs = mysqlTable('notification_prefs', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('member_id', { unsigned: true }).notNull().references(() => members.id),
  category: notificationCategoryEnum.notNull(),
  enabled: boolean('enabled').notNull().default(true),
}, (table) => [
  unique('notification_prefs_member_id_category_unique').on(table.memberId, table.category),
])

export const notificationLog = mysqlTable('notification_logs', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  eventKey: varchar('event_key', { length: 200 }).notNull(),
  memberId: int('member_id', { unsigned: true }).notNull().references(() => members.id),
  sentAt: datetime('sent_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
  unique('notification_logs_event_key_member_id_unique').on(table.eventKey, table.memberId),
])

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: varchar('value', { length: 255 }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull().$onUpdate(() => new Date()),
})

export const auditLog = mysqlTable('audit_logs', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  actorId: int('actor_id', { unsigned: true }).references(() => members.id),
  action: varchar('action', { length: 80 }).notNull(),
  entity: varchar('entity', { length: 40 }).notNull(),
  entityId: varchar('entity_id', { length: 40 }),
  detail: json('detail'),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})
