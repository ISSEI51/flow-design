export function PageHeader({ name, lead }: { name: string; lead: string }) {
  return (
    <header className="mb-16">
      <p className="text-caption text-muted-foreground">Components</p>
      <h1 className="mt-2 text-page-title">{name}</h1>
      <p className="mt-4 max-w-[40rem] text-body text-muted-foreground">{lead}</p>
    </header>
  )
}
