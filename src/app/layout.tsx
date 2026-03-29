import type { Metadata } from "next";
import { IBM_Plex_Mono, Geist } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
});

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Donechain",
  description: "AI-native commitment tracking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibmPlexMono.variable} ${geistSans.variable} dark`}>
      <body className="antialiased h-screen overflow-hidden selection:bg-[var(--accent)] selection:text-black">
        {children}
      </body>
    </html>
  );
}
