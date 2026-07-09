import type { NextConfig } from "next";

// API proxy is implemented as app/backend-api/[...path]/route.ts (not rewrites),
// so Authorization headers and errors are handled reliably on Windows/dev.

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    // Prevent sticky browser/CDN caches of stale client bundles during local debug.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
