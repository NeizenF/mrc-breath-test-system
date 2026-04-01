"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 dark:bg-slate-900 px-4 text-center">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Something went wrong</h1>
      <p className="max-w-sm text-slate-500 dark:text-slate-400">
        An unexpected error occurred. Try refreshing the page.
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
      >
        Try again
      </button>
    </div>
  );
}
