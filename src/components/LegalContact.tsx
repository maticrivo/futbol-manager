export function LegalContact({ subject }: { subject: string }) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) return <span>the group administrator</span>

  return (
    <a
      className="text-primary underline decoration-primary/40 underline-offset-2"
      href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
    >
      {email}
    </a>
  )
}
