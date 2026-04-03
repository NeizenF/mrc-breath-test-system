"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { supabase } from "@/lib/supabase/client";
import { Sun, Moon, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppHeader() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (hideHeader) return null;

  const navItems = loggedIn
    ? [
        { href: "/dashboard", label: "Dashboard" },
        ...(isAdmin ? [{ href: "/admin/calendar", label: "Calendar" }] : []),
        ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
      ]
    : [];

  const navLink = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        key={href}
        href={href}
        className={`text-sm font-medium transition-colors ${
          active
            ? "text-white"
            : "text-slate-400 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
        >
          <Image
            src="/mrc-logo.jpg"
            alt="MRC logo"
            width={32}
            height={32}
            className="rounded"
          />
          <div className="text-sm font-semibold leading-tight text-white">
            MRC Breath Test
          </div>
        </Link>

        {loggedIn && (
          <nav className="hidden items-center gap-5 md:flex">
            {navItems.map(({ href, label }) => navLink(href, label))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white hover:bg-slate-800"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>

          {loggedIn && navItems.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-800 md:hidden">
          <nav className="flex flex-col px-4 py-2">
            {navItems.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-slate-800 ${
                    active ? "text-white" : "text-slate-400"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
