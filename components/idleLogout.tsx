"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;


export default function IdleLogout() {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function logoutNow() {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;

      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.error("Idle logout failed:", error);
      } finally {
        if (mounted) {
          router.replace("/");
          router.refresh();
        }
      }
    }

    async function resetTimer() {
      if (isLoggingOutRef.current) return;

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("Failed to read session for idle logout:", error);
        return;
      }

      if (!session) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        void logoutNow();
      }, IDLE_TIMEOUT_MS);
    }

    const activityHandler = () => {
      void resetTimer();
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ];

    events.forEach((event) => {
      window.addEventListener(event, activityHandler, { passive: true });
    });

    void resetTimer();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void resetTimer();
    });

    return () => {
      mounted = false;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      events.forEach((event) => {
        window.removeEventListener(event, activityHandler);
      });

      subscription.unsubscribe();
    };
  }, [router, pathname]);

  return null;
}