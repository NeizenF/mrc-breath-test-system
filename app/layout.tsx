import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import IdleLogout from "@/components/idleLogout";
import AppHeader from "@/components/appHeader";
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
        <AppHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}