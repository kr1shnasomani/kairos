import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained production server (.next/standalone/server.js)
  // for a minimal, non-root Docker runtime image. No effect on `next dev`.
  output: "standalone",
};

export default nextConfig;
