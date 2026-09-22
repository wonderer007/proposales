import { ProposalHistory } from "@/components/proposal-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Proposal } from "@/lib/db/schema";

/**
 * One card for everything proposal-related: the working draft (builder) in
 * front, and the version history one tab away. The builder is the default
 * because it is what the manager acts on.
 */
export function ProposalPanel({ proposals }: { proposals: Proposal[] }) {
  return (
    <Card>
      <Tabs defaultValue="builder" className="gap-(--card-spacing)">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Proposal</CardTitle>
          <TabsList>
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="history">
              History
              {proposals.length > 0 ? (
                <span className="text-muted-foreground tabular-nums">{proposals.length}</span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </CardHeader>

        <CardContent>
          <TabsContent value="builder">
            <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-12 text-center text-sm">
              Coming in D8.
            </p>
          </TabsContent>
          <TabsContent value="history">
            <ProposalHistory proposals={proposals} />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
