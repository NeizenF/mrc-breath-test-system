"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function AppHeader() {
  const pathname = usePathname();

  const hideHeader =
    /^\/meetings\/[^/]+\/print$/.test(pathname) ||
    /^\/meetings\/[^/]+\/declaration$/.test(pathname);

  if (hideHeader) {
    return null;
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6 lg:px-8">
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
            <div className="text-lg font-semibold">
              MRC Breath Test System
            </div>
          </div>
        </Link>
      </div>
    </header>
  );
}