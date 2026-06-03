import type { MetadataRoute } from "next";

// Served by Next at /manifest.webmanifest. Drives PWA installability.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TinyKloset — Pre-loved & boutique kids' fashion",
    short_name: "TinyKloset",
    description:
      "A curated peer-to-peer marketplace for pre-loved and boutique baby and children's clothing, footwear, and accessories.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#db2777",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
