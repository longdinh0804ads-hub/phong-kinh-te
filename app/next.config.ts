import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // KHÔNG dùng `output: "standalone"` trên Vercel - Vercel adapter tự xử lý.
  // Nếu deploy lên VPS (self-hosted), bật lại flag này.
  // pdf-parse cần worker file riêng, không cho bundle
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      // Vercel Hobby tier giới hạn body size 4.5MB. Pro tier có thể tăng lên 100MB.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
