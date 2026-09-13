import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LyricForge — Lyric Video Studio",
  description: "Create lyric videos with precise timing, expressive typography, local transcription, and complete manual control.",
  icons: {
    icon: "/Lyricforge2/favicon.svg",
    shortcut: "/Lyricforge2/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
