import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "AI Alert Triage Copilot",
  description:
    "AI-assisted SOC alert triage — MITRE ATT&CK mapping, priority reasoning, and hunting queries. A companion project to sagarpreethooda.com.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrains.variable} ${inter.variable}`}>
      <body>
        <div className="min-h-screen">
          <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-bg/80 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
              <Link href="/" className="group flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded border border-primary/40 font-mono text-sm text-primary shadow-[0_0_16px_#00ff8833]">
                  ⌖
                </span>
                <span className="font-mono text-sm font-semibold tracking-tight text-body">
                  alert-triage<span className="text-primary">.copilot</span>
                </span>
              </Link>
              <nav className="flex items-center gap-1 font-mono text-[13px]">
                <Link href="/" className="rounded px-3 py-1.5 text-white/60 transition-colors hover:bg-white/5 hover:text-primary">
                  queue
                </Link>
                <Link href="/overview" className="rounded px-3 py-1.5 text-white/60 transition-colors hover:bg-white/5 hover:text-primary">
                  overview
                </Link>
              </nav>
            </div>
          </header>
          {children}
          <footer className="mx-auto max-w-7xl px-5 py-10">
            <p className="font-mono text-xs text-white/30">
              AI Alert Triage Copilot · companion to{" "}
              <a href="https://sagarpreethooda.com" className="text-secondary/70 hover:text-secondary">
                sagarpreethooda.com
              </a>{" "}
              · MITRE ATT&CK® mappings from mitre/cti
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
