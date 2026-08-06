import { AdminAppLegalDocumentForm } from "@/components/admin/app/AdminAppLegalDocumentForm";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminAppLegalDocumentForm documentId={id} />;
}
