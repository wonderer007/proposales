import { InquiryForm } from "@/components/inquiry-form";
import { PageHeader } from "@/components/page-header";

export const metadata = {
  title: "New inquiry",
};

export default function NewInquiryPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Inquiry Manager", href: "/inquiries" },
          { label: "New inquiry" },
        ]}
        title="New inquiry"
        description="Saved here and mirrored to Proposales as a request for proposal."
      />

      <InquiryForm />
    </main>
  );
}
