import type { ReactNode } from 'react'
import AdminNav from '@/components/AdminNav'
import { requireAdmin } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-start">
      <AdminNav />
      {children}
    </main>
  )
}
