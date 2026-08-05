import { AdminAppNoticeForm } from "@/components/admin/app/AdminAppNoticeForm";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-4">
      <AdminAppNoticeForm noticeId={String(id ?? "")} />
    </div>
  );
}
