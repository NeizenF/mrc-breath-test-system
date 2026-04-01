"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { supabase } from "@/lib/supabase/client";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppHeader() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const { theme, setTheme } = useTheme();

  const hideHeader =
    /^\/meetings\/[^/]+\/print$/.test(pathname) ||
    /^\/meetings\/[^/]+\/declaration$/.test(pathname);

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setLoggedIn(true);
      const admin = await isCurrentUserAdmin();
      setIsAdmin(admin);
    }
    check();
  }, [pathname]);

  if (hideHeader) return null;

  const navLink = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={`text-sm font-medium transition-colors hover:text-slate-900 dark:hover:text-slate-100 ${
          active ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 transition-opacity hover:opacity-90"
        >
          <Image
            src="/mrc-logo.jpg"
            alt="MRC logo"
            width={36}
            height={36}
            className="rounded"
          />
          <div className="text-base font-semibold leading-tight">
            MRC Breath Test System
          </div>
        </Link>

        {loggedIn && (
          <nav className="flex items-center gap-5">
            {navLink("/dashboard", "Dashboard")}
            {isAdmin && navLink("/admin/calendar", "Calendar")}
            {isAdmin && navLink("/admin", "Admin")}
          </nav>
        )}

        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>
        </div>
      </div>
    </header>
  );
}