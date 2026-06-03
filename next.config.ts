import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json exists in a parent directory; pin the workspace
  // root to this project so Turbopack resolves env files and output correctly.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
