import Brand from './Brand'

export default function MobileHeader({ name }: { name: string }) {
  return (
    <header className="md:hidden border-b border-line bg-surface">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Brand name={name} />
      </div>
    </header>
  )
}
