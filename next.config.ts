import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [new URL("https://res.cloudinary.com/**")],
  },
};

export default nextConfig;
