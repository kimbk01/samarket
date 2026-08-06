import { AdminAppBusinessInfoForm } from "@/components/admin/app/AdminAppBusinessInfoForm";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminAppBusinessInfoForm documentId={id} />;
}
