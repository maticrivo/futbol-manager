'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { createNextMatchAction } from '@/app/actions/admin'
import SubmitButton from './SubmitButton'

export default function CreateNextMatchForm() {
  const t = useTranslations('admin')
  const [, formAction] = useActionState(createNextMatchAction, null)
  return (
    <form action={formAction}>
      <SubmitButton label={t('dashboard.createNextMatch')} pendingLabel={t('dashboard.creating')} primary />
    </form>
  )
}
