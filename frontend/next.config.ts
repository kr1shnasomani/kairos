import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained production server (.next/standalone/server.js)
  // for a minimal, non-root Docker runtime image. No effect on `next dev`.
  output: "standalone",

  // The dev-tools overlay defaults to a Next.js logo pinned bottom-left, which
  // lands inside every screenshot tools/capture_landing_shots.sh takes for the
  // landing page. Dev-only overlay, so this has no effect on the production build.
  devIndicators: false,
};

export default nextConfig;
