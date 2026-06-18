import type { Metadata, Viewport } from "next";
import { Fraunces, Mulish } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

// Display: a high-contrast, literary serif with soft optical sizing — the
// editorial voice of the brand. Italic is loaded for accents.
const displayFont = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

// Body: a warm, rounded humanist sans that keeps long text gentle and legible.
const bodyFont = Mulish({
  variable: "--font-mulish",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "TinyKloset",
  title: {
    default: "TinyKloset — Pre-loved & boutique kids' fashion",
    template: "%s · TinyKloset",
  },
  description:
    "A curated peer-to-peer marketplace for pre-loved and boutique baby and children's clothing, footwear, and accessories.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TinyKloset",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4ece1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
