import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Inquiry-to-Proposal Agent</h1>
        <p className="text-muted-foreground text-balance">
          Hotel inquiries in, Proposales proposals out. An AI assistant shortlists products from the
          content library; the manager reviews the draft and creates the proposal.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Scaffold ready</CardTitle>
          <CardDescription>
            The inquiry list lands here once the database and queries are in place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>New inquiry</Button>
        </CardContent>
      </Card>
    </main>
  );
}
