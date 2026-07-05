import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

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
  icons: {
    icon: "/logomark_lightmode.png",
    shortcut: "/logomark_lightmode.png",
    apple: "/logomark_lightmode.png",
  },
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
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
