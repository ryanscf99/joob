import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdf-parse / mammoth are Node-only; keep them out of client bundles
  serverExternalPackages: ["pdf-parse", "mammoth"],
  // Smaller production payloads; fewer console noise sources
  poweredByHeader: false,
  compress: true,
  images: {
    // Brand assets are static under /public — avoid accidental remote fetches
    unoptimized: true,
  },
  // Fail production builds on type errors (eslint may still warn)
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    // Keep deploy green; types are the hard gate
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
