"use client";

import { Building2, Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { selectCompany } from "@/lib/proposales/actions";
import type { Company } from "@/lib/proposales/schemas";

/**
 * Workspace switcher. Products, proposals and RFPs all belong to the company
 * selected here, so it names the current one rather than hiding behind an icon.
 */
export function CompanySwitcher({
  companies,
  selectedId,
}: {
  companies: Company[];
  selectedId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const selected = companies.find((company) => company.id === selectedId);
  if (!selected) return null;

  // Nothing to switch between: show the company without a menu.
  if (companies.length === 1) {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Building2 className="size-3.5" aria-hidden />
        {selected.name}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-mr-2 gap-1.5" disabled={isPending}>
          <Building2 className="size-3.5" aria-hidden />
          {isPending ? "Switching…" : selected.name}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal">
          Workspace — products and proposals belong to it
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {companies.map((company) => (
          <DropdownMenuItem
            key={company.id}
            disabled={isPending}
            onSelect={() => {
              if (company.id === selectedId) return;

              startTransition(async () => {
                const result = await selectCompany(company.id);
                if (!result.ok) toast.error(result.error ?? "Could not switch company");
                else router.refresh();
              });
            }}
            className="gap-2"
          >
            <Check
              className={company.id === selectedId ? "size-3.5" : "size-3.5 opacity-0"}
              aria-hidden
            />
            <span className="flex-1 truncate">{company.name}</span>
            <span className="text-muted-foreground text-xs">{company.currency}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
