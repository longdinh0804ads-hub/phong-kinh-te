import type { NextConfig } from "next";

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Security headers áp dụng cho mọi response (P4).
 *  - HSTS: 1 năm, includeSubDomains, preload-ready (chỉ bật khi prod HTTPS)
 *  - CSP: chặn inline script trừ khi có nonce (Next.js dùng strict-dynamic + nonce)
 *  - X-Frame-Options: chống clickjacking
 *  - X-Content-Type-Options: chống MIME-sniffing
 *  - Permissions-Policy: tắt camera/mic/geo
 */
const SECURITY_HEADERS = [
  ...(IS_PROD
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js cần unsafe-inline + unsafe-eval cho hydration (chưa migrate sang nonce).
      // Khi bật nonce-based ở phase sau, bỏ unsafe-inline ở đây.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${IS_PROD ? "" : "ws: wss:"} https://challenges.cloudflare.com`,
      "frame-src https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // VPS self-host: bật standalone để output gọn (deploy được dòng `node .next/standalone/server.js`)
  // output: "standalone",  // bật khi chuyển sang VPS
  serverExternalPackages: ["pdf-parse", "@node-rs/argon2"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
