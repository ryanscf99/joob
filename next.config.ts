import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdf-parse / mammoth are Node-only; keep them out of client bundles
  serverExternalPackages: ["pdf-parse", "mammoth"],
  // Deploy-friendly: lint warnings shouldn't block Vercel builds
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
