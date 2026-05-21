export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-3 text-center sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight sm:text-lg">Mucha Kitchen</p>
            <p className="text-xs text-muted-foreground">Reservations</p>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
