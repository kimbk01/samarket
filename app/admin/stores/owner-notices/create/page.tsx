import { AdminAppNoticeForm } from "@/components/admin/app/AdminAppNoticeForm";

/** 매장 공지 작성 — 공지 폼(매장 공지 종류) 재사용 (설계 v3.2 §3-4 · Owner 2026-11-10) */
export default function AdminStoreOwnerNoticeCreateRoute() {
  return (
    <div className="p-4">
      <AdminAppNoticeForm variant="owner" />
    </div>
  );
}
