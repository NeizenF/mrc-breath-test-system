import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 dark:bg-slate-900 px-4 text-center">
      <div className="text-5xl">🐎</div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">404 — Page not found</h1>
      <p className="text-slate-500 dark:text-slate-400">
        This page doesn&apos;t exist or was moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
