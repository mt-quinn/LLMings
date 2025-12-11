import type { Metadata } from "next";
import "./globals.css";
import { Kanit, Space_Grotesk } from "next/font/google";

const display = Kanit({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
});

const body = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "LLMings",
  description: "Daily dungeon run with a party of LLM-driven adventurers.",
  viewport: {
    width: "device-width",
    initialScale: 1,
    minimumScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex items-stretch justify-center">
        <div className="flex w-full max-w-md mx-auto px-3 py-4 sm:max-w-lg sm:px-4">
          <div className="relative flex-1 rounded-3xl bg-llm-panel shadow-llm-card border border-llm-border/80 overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-40 mix-blend-screen bg-[radial-gradient(circle_at_15%_0%,#ffdf6b_0,#ffdf6b00_55%),radial-gradient(circle_at_85%_100%,#76e4ff_0,#76e4ff00_55%)]" />
            <main className="relative pointer-events-auto h-full w-full flex flex-col bg-llm-log">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}


