import { AdminAppNoticeForm } from "@/components/admin/app/AdminAppNoticeForm";

/** 매장 공지 수정 — 공지 폼(매장 공지 종류) 재사용 (설계 v3.2 §3-4 · Owner 2026-11-10) */
export default async function AdminStoreOwnerNoticeEditRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-4">
      <AdminAppNoticeForm variant="owner" noticeId={String(id ?? "")} />
    </div>
  );
}
