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
  async redirects() {
    return [
      { source: "/procedures", destination: "/parametres/procedures", permanent: false },
      { source: "/procedures/:id", destination: "/parametres/procedures/:id", permanent: false },
      { source: "/equipe", destination: "/parametres/equipe", permanent: false },
    ];
  },
};

export default nextConfig;
