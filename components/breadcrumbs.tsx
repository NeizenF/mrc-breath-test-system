import Link from "next/link";
import { ChevronRight } from "lucide-react";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-slate-700 dark:text-slate-200" : ""}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
