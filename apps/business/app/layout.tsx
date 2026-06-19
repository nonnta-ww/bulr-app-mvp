import type { Metadata } from 'next';
// Material Symbols アイコンフォントは self-host する（material-symbols パッケージが
// woff2 + @font-face を同梱）。Google Fonts CDN への依存をなくし、ad-blocker や
// プロキシでブロックされても確実にアイコンが描画されるようにする。
import 'material-symbols/outlined.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'bulr business',
  description: 'AI 面接アシスタント',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
