import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey, AdminStaff, CreateAdminInput } from "@/lib/types/admin-staff";

type StaffApiRow = {
  id: string;
  loginId: string;
  displayName: string;
  role: AdminRole;
  permissions: AdminPermissionKey[];
  createdAt: string;
  disabled?: boolean;
};

export async function fetchAdminStaffList(): Promise<AdminStaff[]> {
  const res = await fetch("/api/admin/staff", { credentials: "include", cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; staff?: StaffApiRow[] };
  if (!data.ok || !Array.isArray(data.staff)) return [];
  return data.staff.filter((s) => !s.disabled);
}

export async function createAdminStaffApi(
  input: CreateAdminInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const res = await fetch("/api/admin/staff", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as { ok?: boolean; id?: string; error?: string; message?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.message ?? data.error ?? "요청에 실패했습니다." };
  }
  return { ok: true, id: String(data.id ?? "") };
}

export async function updateAdminStaffApi(
  id: string,
  input: { displayName?: string; role?: AdminRole; permissions?: AdminPermissionKey[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`/api/admin/staff/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.message ?? data.error ?? "저장에 실패했습니다." };
  }
  return { ok: true };
}
