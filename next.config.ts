import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // This machine's TLS setup requires system certificates (see CLAUDE.md)
    turbopackUseSystemTlsCerts: true,
  },
  // Ship the pinned Supabase CA with serverless bundles (read at runtime by lib/db.ts)
  outputFileTracingIncludes: {
    "/**": ["./certs/**"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;
