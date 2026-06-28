import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "mcq-forge — Spec-v9 MCQ Generation Engine",
  description:
    "Automated spec-v9 compliant MCQ generation from textbook PDFs. Powered by GLM-4.7-Flash. One validated question at a time.",
  keywords: ["MCQ", "multiple choice", "question generation", "GLM", "textbook", "education"],
  authors: [{ name: "mcq-forge" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "mcq-forge",
    description: "Automated spec-v9 MCQ generation from textbook PDFs",
    siteName: "mcq-forge",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
