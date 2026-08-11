import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminUserListPage } from "@/components/admin/users/AdminUserListPage";

interface PageProps {
  searchParams: Promise<{ detail?: string | string[] }>;
}

/** `?detail=` is legacy modal deep-link — canonical surface is `/admin/users/[id]`. */
export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params.detail;
  const detail = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (detail) {
    redirect(`/admin/users/${encodeURIComponent(detail)}`);
  }
  return (
    <Suspense fallback={null}>
      <AdminUserListPage />
    </Suspense>
  );
}
