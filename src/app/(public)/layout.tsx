import Image from 'next/image';

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center gap-3">
          <Image src="/logo.png" alt="Mucha Kitchen" width={36} height={36} className="h-9 w-9" />
          <span className="text-lg font-bold">Mucha Kitchen Reservations</span>
        </div>
      </header>
      {children}
    </>
  );
}