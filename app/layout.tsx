import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import IdleLogout from "@/components/idleLogout";
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
  title: "MRC Breath Test System",
  description: "MRC race management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-100 text-slate-900`}
      >
        <IdleLogout />

        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 transition-opacity hover:opacity-90"
            >
              <Image
                src="/mrc-logo.jpg"
                alt="MRC logo"
                width={40}
                height={40}
                className="rounded"
              />
              <div className="leading-tight">
                <div className="text-lg font-semibold">MRC Breath Test System</div>
              </div>
            </Link>

            <nav className="flex items-center gap-5 text-sm font-medium text-slate-600">
              <Link
                href="/dashboard"
                className="transition-colors hover:text-slate-900"
              >
                Home
              </Link>

              <Link
                href="/meetings"
                className="transition-colors hover:text-slate-900"
              >
                Meetings
              </Link>

              <Link
                href="/drivers"
                className="transition-colors hover:text-slate-900"
              >
                DriverInfo
              </Link>
            </nav>
          </div>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}