import type { ReactNode } from 'react';
import StaffSidebarClient from './sidebar-client';

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <StaffSidebarClient>
      {children}
    </StaffSidebarClient>
  );
}

export const dynamic = 'force-dynamic';
