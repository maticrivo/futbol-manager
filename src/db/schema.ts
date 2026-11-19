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
  role: memberRoleEnum.default('member').notNull(),
  locale: varchar('locale', { length: 5 }).default('en').notNull(),
  status: memberStatusEnum.default('active').notNull(),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
  updatedAt: datetime('updatedAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
})

export const loginTokens = mysqlTable('loginTokens', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('memberId', { unsigned: true }).notNull().references(() => members.id),
  tokenHash: char('tokenHash', { length: 64 }).notNull().unique(),
  lastUsedAt: datetime('lastUsedAt', { mode: 'date', fsp: 3 }),
  revokedAt: datetime('revokedAt', { mode: 'date', fsp: 3 }),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const sessions = mysqlTable('sessions', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('memberId', { unsigned: true }).notNull().references(() => members.id),
  tokenHash: char('tokenHash', { length: 64 }).notNull().unique(),
  expiresAt: datetime('expiresAt', { mode: 'date', fsp: 3 }).notNull(),
  userAgent: varchar('userAgent', { length: 255 }),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const matchStatusEnum = mysqlEnum('status', ['scheduled', 'locked', 'played', 'cancelled'])

export const matches = mysqlTable('matches', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  matchDate: char('matchDate', { length: 10 }).notNull().unique(),
  kickoffAt: datetime('kickoffAt', { mode: 'date', fsp: 3 }).notNull(),
  signupOpensAt: datetime('signupOpensAt', { mode: 'date', fsp: 3 }).notNull(),
  guestPhaseAt: datetime('guestPhaseAt', { mode: 'date', fsp: 3 }).notNull(),
  lockAt: datetime('lockAt', { mode: 'date', fsp: 3 }).notNull(),
  venue: varchar('venue', { length: 160 }).notNull().default(''),
  costAgorot: int('costAgorot', { unsigned: true }).notNull(),
  capacity: smallint('capacity', { unsigned: true }).notNull(),
  status: matchStatusEnum.default('scheduled').notNull(),
  notes: text('notes'),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
  updatedAt: datetime('updatedAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
})

export const entryKindEnum = mysqlEnum('kind', ['member', 'guest'])
export const entryStatusEnum = mysqlEnum('status', ['confirmed', 'queued', 'offered', 'withdrawn', 'expired', 'removed'])

export const entries = mysqlTable('entries', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  matchId: int('matchId', { unsigned: true }).notNull().references(() => matches.id),
  kind: entryKindEnum.notNull(),
  memberId: int('memberId', { unsigned: true }).references(() => members.id),
  guestName: varchar('guestName', { length: 120 }),
  hostMemberId: int('hostMemberId', { unsigned: true }).references(() => members.id),
  status: entryStatusEnum.default('confirmed').notNull(),
  attended: boolean('attended'),
  offeredAt: datetime('offeredAt', { mode: 'date', fsp: 3 }),
  offerExpiresAt: datetime('offerExpiresAt', { mode: 'date', fsp: 3 }),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
  updatedAt: datetime('updatedAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
}, (table) => [
  unique('entries_matchId_memberId_unique').on(table.matchId, table.memberId),
  index('entries_matchId_status_idx').on(table.matchId, table.status),
])

export const chargeStatusEnum = mysqlEnum('status', ['charged', 'waived'])

export const charges = mysqlTable('charges', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  matchId: int('matchId', { unsigned: true }).notNull().references(() => matches.id),
  memberId: int('memberId', { unsigned: true }).notNull().references(() => members.id),
  amountAgorot: int('amountAgorot', { unsigned: true }).notNull(),
  billingMonth: char('billingMonth', { length: 7 }).notNull(),
  status: chargeStatusEnum.default('charged').notNull(),
  waivedBy: int('waivedBy', { unsigned: true }).references(() => members.id),
  waiveReason: varchar('waiveReason', { length: 255 }),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
  updatedAt: datetime('updatedAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
}, (table) => [
  unique('charges_matchId_memberId_unique').on(table.matchId, table.memberId),
  index('charges_memberId_billingMonth_idx').on(table.memberId, table.billingMonth),
])

export const paymentMethodEnum = mysqlEnum('method', ['paybox', 'cash', 'other'])

export const payments = mysqlTable('payments', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('memberId', { unsigned: true }).notNull().references(() => members.id),
  amountAgorot: int('amountAgorot').notNull(),
  paidAt: datetime('paidAt', { mode: 'date', fsp: 3 }).notNull(),
  method: paymentMethodEnum.notNull(),
  note: varchar('note', { length: 255 }),
  recordedBy: int('recordedBy', { unsigned: true }).notNull().references(() => members.id),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const paymentAllocations = mysqlTable('paymentAllocations', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  paymentId: int('paymentId', { unsigned: true }).notNull().references(() => payments.id),
  billingMonth: char('billingMonth', { length: 7 }).notNull(),
  amountAgorot: int('amountAgorot').notNull(),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
  index('paymentAllocations_billingMonth_idx').on(table.billingMonth),
])

export const guestPaymentKindEnum = mysqlEnum('kind', ['payment', 'refund'])

export const guestPayments = mysqlTable('guestPayments', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  entryId: int('entryId', { unsigned: true }).notNull().references(() => entries.id),
  amountAgorot: int('amountAgorot').notNull(),
  kind: guestPaymentKindEnum.notNull(),
  refundOfId: int('refundOfId', { unsigned: true }),
  paidAt: datetime('paidAt', { mode: 'date', fsp: 3 }).notNull(),
  recordedBy: int('recordedBy', { unsigned: true }).notNull().references(() => members.id),
  note: varchar('note', { length: 255 }),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const expenses = mysqlTable('expenses', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  billingMonth: char('billingMonth', { length: 7 }).notNull().unique(),
  fieldCostAgorot: int('fieldCostAgorot', { unsigned: true }).notNull(),
  updatedBy: int('updatedBy', { unsigned: true }).notNull().references(() => members.id),
  updatedAt: datetime('updatedAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
})

export const pushSubscriptions = mysqlTable('pushSubscriptions', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('memberId', { unsigned: true }).notNull().references(() => members.id),
  endpoint: varchar('endpoint', { length: 500 }).notNull().unique(),
  p256dh: varchar('p256dh', { length: 255 }).notNull(),
  auth: varchar('auth', { length: 255 }).notNull(),
  userAgent: varchar('userAgent', { length: 255 }),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})

export const notificationCategoryEnum = mysqlEnum('category', [
  'signup_open',
  'guest_phase',
  'lock_reminder',
  'queue_offer',
  'bill_ready',
  'payment_reminder',
])

export const notificationPrefs = mysqlTable('notificationPrefs', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  memberId: int('memberId', { unsigned: true }).notNull().references(() => members.id),
  category: notificationCategoryEnum.notNull(),
  enabled: boolean('enabled').notNull().default(true),
}, (table) => [
  unique('notificationPrefs_memberId_category_unique').on(table.memberId, table.category),
])

export const notificationLog = mysqlTable('notificationLog', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  eventKey: varchar('eventKey', { length: 200 }).notNull(),
  memberId: int('memberId', { unsigned: true }).notNull().references(() => members.id),
  sentAt: datetime('sentAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
  unique('notificationLog_eventKey_memberId_unique').on(table.eventKey, table.memberId),
])

export const settings = mysqlTable('settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: varchar('value', { length: 255 }).notNull(),
  updatedAt: datetime('updatedAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).$onUpdate(() => new Date()).notNull(),
})

export const auditLog = mysqlTable('auditLog', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  actorId: int('actorId', { unsigned: true }).references(() => members.id),
  action: varchar('action', { length: 80 }).notNull(),
  entity: varchar('entity', { length: 40 }).notNull(),
  entityId: varchar('entityId', { length: 40 }),
  detail: json('detail'),
  createdAt: datetime('createdAt', { mode: 'date', fsp: 3 }).$defaultFn(() => new Date()).notNull(),
})
