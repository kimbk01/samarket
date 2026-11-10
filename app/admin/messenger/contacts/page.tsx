import { AdminAccessDeniedPanel } from "@/components/admin/AdminAccessDeniedPanel";
import { requireAdminPageAccess } from "@/lib/admin/access/require-admin-page-access";
import { AdminMessengerContactsSettings } from "@/components/admin/messenger/AdminMessengerContactsSettings";

export const dynamic = "force-dynamic";

/** 어드민 › 메신저 › 연락처 동기화 운영 설정 (SSOT docs/design/messenger-contacts-sync-plan.md v5 §6-5) */
export default async function AdminMessengerContactsPage() {
  const access = await requireAdminPageAccess("/admin/messenger");
  if (!access.ok) return <AdminAccessDeniedPanel backHref="/admin" />;
  return <AdminMessengerContactsSettings canSave={access.actor.isSuperAdmin} />;
}
