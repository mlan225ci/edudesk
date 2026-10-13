import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["bcryptjs"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
    serverActions: { bodySizeLimit: "12mb" },
  },
  outputFileTracingRoot: path.join(import.meta.dirname),
};

export default nextConfig;
