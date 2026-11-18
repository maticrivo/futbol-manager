import { desc, eq } from 'drizzle-orm'
import type { Db, Executor } from '@/db'
import { auditLog, members } from '@/db/schema'

export type WriteAuditInput = {
  actorId?: number
  action: string
  entity: string
  entityId?: string
  detail?: unknown
  createdAt?: Date
}

export type AuditLogEntry = {
  id: number
  action: string
  entity: string
  entityId: string | null
  detail: unknown
  createdAt: Date
  actorName: string | null
}

export async function writeAudit(executor: Executor, input: WriteAuditInput): Promise<void> {
  await executor.insert(auditLog).values({
    actorId: input.actorId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    detail: input.detail,
    createdAt: input.createdAt,
  })
}

export async function getAuditLog(db: Db, limit = 200): Promise<AuditLogEntry[]> {
  const clamped = Math.min(200, Math.max(1, Math.floor(limit)))

  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      detail: auditLog.detail,
      createdAt: auditLog.createdAt,
      actorName: members.name,
    })
    .from(auditLog)
    .leftJoin(members, eq(members.id, auditLog.actorId))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(clamped)
}
