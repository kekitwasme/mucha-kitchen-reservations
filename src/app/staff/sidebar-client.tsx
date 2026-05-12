'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  Grid3X3,
  CalendarCheck,
  UserPlus,
  Clock,
  Settings,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/lib/store';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: '/staff', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/staff/floor-plan', label: 'Floor Plan', icon: Grid3X3 },
  { href: '/staff/reservations', label: 'Reservations', icon: CalendarCheck },
  { href: '/staff/walk-ins', label: 'Walk-ins', icon: UserPlus },
  { href: '/staff/timeline', label: 'Timeline', icon: Clock },
  { href: '/staff/settings', label: 'Settings', icon: Settings, adminOnly: true },
];

function SidebarContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sidebar = useSidebarStore();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  const isActive = (href: string) => {
    if (href === '/staff') return pathname === '/staff';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="flex h-screen">
      {sidebar.isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={sidebar.close}
        />
      )}
      <aside
        className={`bg-slate-900 text-white flex flex-col transition-all duration-300 fixed lg:relative z-40 h-full ${
          sidebar.isOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full lg:translate-x-0'
        } lg:w-64`}
      >
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-lg font-bold">Mucha Kitchen</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.innerWidth < 1024) sidebar.close();
                }}
                className={`flex items-center gap-3 px-4 py-2 rounded transition-colors ${
                  isActive(item.href)
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-700">
          {session?.user && (
            <p className="text-xs text-slate-400 mb-3 truncate">
              {session.user.email} ({session.user.role ?? 'staff'})
            </p>
          )}
          <Button
            variant="ghost"
            className="w-full text-slate-300 hover:text-white flex items-center gap-3"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span>Logout</span>
          </Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b p-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={sidebar.toggle}
            className="lg:hidden"
          >
            <span className="text-xl">☰</span>
          </Button>
          <h2 className="text-lg font-semibold">Staff Dashboard</h2>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

export default function StaffSidebarClient({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="h-32 w-32 rounded-lg bg-white shadow animate-pulse" />
      </div>
    }>
      <SidebarContent>{children}</SidebarContent>
    </Suspense>
  );
}
