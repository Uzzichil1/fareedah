import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      new URL("https://res.cloudinary.com/**"),
      new URL("https://picsum.photos/**"),
      new URL("https://fastly.picsum.photos/**"),
    ],
  },
};

export default nextConfig;
