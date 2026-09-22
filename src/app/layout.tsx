import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// One family for everything. Plex Sans holds up at 13–14px in dense tables,
// has real tabular figures for prices and dates, and its 400/500/600 weights
// are far enough apart to carry hierarchy without size changes.
const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Only used for inline <code>; kept to the one weight we need.
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Inquiry-to-Proposal Agent",
    template: "%s — Inquiry-to-Proposal Agent",
  },
  description:
    "Turn hotel inquiries into Proposales proposals with an AI assistant that shortlists products.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
