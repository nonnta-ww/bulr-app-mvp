import type { NextConfig } from 'next';

// React 開発モードはコールスタック再構築などのデバッグ機能で eval() を必要とする。
// 本番では 'unsafe-eval' を含めない（CSP の弱体化を避ける）。
const isDev = process.env.NODE_ENV === 'development';
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'microphone=(self), camera=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "connect-src 'self' https://api.anthropic.com https://api.openai.com https://*.blob.vercel-storage.com",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
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
