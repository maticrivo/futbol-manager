import type { Executor } from '@/db'
import { auditLog } from '@/db/schema'

export type WriteAuditInput = {
  actorId?: number
  action: string
  entity: string
  entityId?: string
  detail?: unknown
  createdAt?: Date
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
