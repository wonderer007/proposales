import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this repo; otherwise Next walks up and picks up
  // an unrelated lockfile from a parent directory.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
