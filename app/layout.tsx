import "./globals.css";
import type { Metadata } from "next";
import React from "react";
import { Baloo_2, Plus_Jakarta_Sans } from "next/font/google";

const displayFont = Baloo_2({
  subsets: ["latin"],
  variable: "--font-display"
});

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "Razzle's Story Lab",
  description: "Kid-safe silly story creator and coloring page generator"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
