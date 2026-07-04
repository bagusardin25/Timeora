import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Timeora — Your Intelligent Time Companion",
  description: "AI-powered natural language scheduling. Type what you want, and Timeora handles the rest. Built for TestSprite Hackathon Season 3.",
  keywords: ["scheduling", "AI", "calendar", "natural language", "time management"],
  authors: [{ name: "Bagus Ardin Prayoga" }],
  other: {
    "timeora-revision": process.env.VERCEL_GIT_COMMIT_SHA || "local",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} font-sans h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#fafbfc] text-slate-900">{children}</body>
    </html>
  );
}
