import type { Metadata } from 'next';
// Material Symbols アイコンフォントは self-host する（material-symbols パッケージが
// woff2 + @font-face を同梱）。Google Fonts CDN 依存をなくし、ad-blocker や
// プロキシでブロックされても確実にアイコンが描画されるようにする。
import 'material-symbols/outlined.css';

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppShell userEmail={user?.email ?? null}>{children}</AppShell>
      </body>
    </html>
  );
}
