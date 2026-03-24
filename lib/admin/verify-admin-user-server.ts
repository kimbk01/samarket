import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * trade-flow 등 관리자 API 공통 — test_users.role / profiles.role
 */
export async function verifyAdminUserId(
  url: string,
  anonKey: string,
  userId: string
): Promise<boolean> {
  const anon = createClient(url, anonKey);
  const { data: testUser } = await anon
    .from("test_users")
    .select("id, username, role")
    .eq("id", userId)
    .maybeSingle();

  const tr = (testUser as { role?: string } | null)?.role;
  if (tr === "admin" || tr === "master") return true;

  const { data: prof } = await anon.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (prof as { role?: string } | null)?.role;
  return role === "admin" || role === "master";
}

export function getServiceOrAnonClient(
  url: string,
  anonKey: string,
  serviceKey: string | undefined
): SupabaseClient {
  return serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : createClient(url, anonKey);
}
