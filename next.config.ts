import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["bcryptjs", "nodemailer", "pdf-lib"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
    serverActions: { bodySizeLimit: "12mb" },
  },
  outputFileTracingRoot: path.join(import.meta.dirname),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/procedures", destination: "/parametres/procedures", permanent: false },
      { source: "/procedures/:id", destination: "/parametres/procedures/:id", permanent: false },
      { source: "/equipe", destination: "/parametres/equipe", permanent: false },
    ];
  },
};

export default nextConfig;
