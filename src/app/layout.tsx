import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="antialiased h-screen overflow-hidden selection:bg-[var(--accent)] selection:text-black">
        {children}
      </body>
    </html>
  );
}
