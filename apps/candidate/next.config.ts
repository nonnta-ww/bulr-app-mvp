import type { NextConfig } from 'next';

// React 開発モードはコールスタック再構築などのデバッグ機能で eval() を必要とする。
// 本番では 'unsafe-eval' を含めない（CSP の弱体化を避ける）。
const isDev = process.env.NODE_ENV === 'development';
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

// 候補者向けアプリは現状 Magic Link サインインのみ（Wave 1）。
// 録音 / AI API などのメディア機能は Wave 4 の模擬面接で追加されるため、
// 現時点では microphone/camera/geolocation は無効化したままにする。
const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'microphone=(), camera=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "connect-src 'self'",
              "img-src 'self' data: blob:",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
