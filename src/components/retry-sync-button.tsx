"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { syncRfp } from "@/lib/inquiries/actions";

export function RetrySyncButton({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const result = await syncRfp(inquiryId);

      if (result.ok) toast.success("Synced to Proposales");
      else toast.error(result.error);

      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={retry} disabled={isPending}>
      <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
      {isPending ? "Syncing…" : "Retry sync"}
    </Button>
  );
}
