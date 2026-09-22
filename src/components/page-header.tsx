import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { cn } from "cn";

/**
 * The one page-title treatment, so every route opens the same way:
 * optional back link, h1, a one-line description, and actions on the right.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 space-y-1.5">
        {back ? (
          <Link
            href={back.href}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 -ml-0.5 inline-flex items-center gap-1 rounded-sm text-sm outline-none transition-colors focus-visible:ring-3"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {back.label}
          </Link>
        ) : null}

        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance">{title}</h1>

        {description ? (
          <p className="text-muted-foreground max-w-prose text-sm leading-normal">{description}</p>
        ) : null}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
