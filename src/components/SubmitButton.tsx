'use client'

import { useFormStatus } from 'react-dom'

export default function SubmitButton({
  label, pendingLabel, primary = false,
}: { label: string; pendingLabel: string; primary?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`cursor-pointer rounded-md border px-4 py-2 font-medium disabled:cursor-wait disabled:opacity-60 ${
        primary ? 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800' : 'hover:bg-current/5'
      }`}
    >
      {pending ? pendingLabel : label}
    </button>
  )
}
