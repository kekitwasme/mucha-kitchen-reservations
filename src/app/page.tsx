import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Image src="/logo.png" alt="Mucha Kitchen" width={28} height={28} className="h-7 w-7" />
            Mucha Kitchen
          </h1>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="/book" className="text-sm text-muted-foreground hover:text-foreground">Book a Table</Link>
            <Link href="/staff/reservations">
              <Button size="sm">Staff Login</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center space-y-6">
          <Image src="/logo.png" alt="Mucha Kitchen" width={120} height={120} className="h-24 w-24 sm:h-28 sm:w-28 mx-auto" />
          <h2 className="text-3xl sm:text-4xl font-bold">Mucha Kitchen Table Reservations</h2>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Manage tables, reservations, and floor plans with real-time availability.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href="/book" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">Book a Table</Button>
            </Link>
            <Link href="/staff/reservations" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">Staff Dashboard</Button>
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t bg-white py-6">
        <div className="max-w-5xl mx-auto px-6 text-center text-sm text-muted-foreground">
          © 2026 Mucha Kitchen Table Reservations
        </div>
      </footer>
    </div>
  );
}