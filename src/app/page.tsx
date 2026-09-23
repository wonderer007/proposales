import { ArrowRight, Inbox, Radar } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Dashboard",
};

/**
 * The way in to the app's two halves: the inbound inquiries you answer, and
 * the past customers worth chasing.
 */
const SECTIONS = [
  {
    href: "/inquiries",
    icon: Inbox,
    title: "Inquiry Manager",
    description:
      "Requests from customers, the AI assistant that shortlists products, and the proposal built for each one.",
  },
  {
    href: "/outreach",
    icon: Radar,
    title: "Outreach",
    description:
      "Past customers whose event is due round again, with their history and a drafted message to start the conversation.",
  },
];

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <PageHeader
        title="Proposales Plus"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map(({ href, icon: Icon, title, description }) => (
          <Card key={href} className="hover:border-foreground/20 relative transition-colors">
            <CardHeader>
              <Icon className="text-muted-foreground mb-2 size-5" aria-hidden />
              <CardTitle>
                {/* The whole card is clickable via this stretched link. */}
                <Link
                  href={href}
                  className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none"
                >
                  {title}
                </Link>
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
                Open
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
