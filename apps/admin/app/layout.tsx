import type { Metadata } from 'next';

import { Header } from './_components/header';
import './globals.css';

export const metadata: Metadata = {
  title: 'bulr admin',
  description: 'bulr 運営管理',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <Header title="bulr admin" />
        {children}
      </body>
    </html>
  );
}
