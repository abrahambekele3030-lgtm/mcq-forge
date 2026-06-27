import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster as SonnerToaster } from "sonner";
import "./globals.css";
import { ThemeProvider } from "@/components/exam-prep/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MCQ Forge — Automatic Question Generator",
  description:
    "Upload a textbook PDF and automatically generate exam-quality MCQs in rounds. Powered by mcq_engine_spec_v9 with automatic JSON repair.",
  keywords: [
    "MCQ generator",
    "question generation",
    "exam prep",
    "AI question engine",
  ],
  authors: [{ name: "MCQ Forge" }],
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f9d6b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <SonnerToaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
