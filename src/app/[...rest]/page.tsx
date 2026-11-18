import { notFound } from 'next/navigation'
import { requireMember } from '@/lib/auth'

export default async function CatchAll() {
  await requireMember()
  notFound()
}
