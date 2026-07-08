import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthSessionWatcher } from "@/components/AuthSessionWatcher";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
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
  openGraph: {
    title: "Timeora — Your Intelligent Time Companion",
    description: "AI-powered natural language scheduling in English and Indonesian. Say goodbye to scheduling conflicts.",
    url: "https://timeora.vercel.app",
    siteName: "Timeora",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Timeora Preview Image",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Timeora — AI Scheduling",
    description: "AI-powered natural language scheduling. Resolve conflicts effortlessly.",
    images: ["/og-image.jpg"],
  },
  alternates: {
    canonical: "https://timeora.vercel.app",
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
          <AuthSessionWatcher />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
