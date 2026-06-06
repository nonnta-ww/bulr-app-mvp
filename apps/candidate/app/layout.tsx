import type { Metadata } from 'next';

import { getCurrentUser } from '@bulr/auth/server';

import { AppShell } from './_components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'bulr',
  description: 'bulr 候補者ポータル',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="ja">
      <body>
        <AppShell userEmail={user?.email ?? null}>{children}</AppShell>
      </body>
    </html>
  );
}
