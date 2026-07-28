import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // This machine's TLS setup requires system certificates (see CLAUDE.md)
    turbopackUseSystemTlsCerts: true,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
};

export default nextConfig;
