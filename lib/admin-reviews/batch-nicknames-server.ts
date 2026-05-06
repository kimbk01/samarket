/**
 * profiles → test_users 순으로 닉네임 보강 (관리자 API 공통)
 * @param sbAny Supabase 클라이언트 (서비스 롤/anon — 제네릭 스키마 차이 허용)
 */
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
 
export async function batchNicknamesByUserIds(sbAny: any, userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out: Record<string, string> = {};
  if (!ids.length) return out;

  const { data: profiles } = await sbAny.from("profiles").select("id, display_name, nickname, username").in("id", ids);
  (profiles ?? []).forEach((p: Record<string, unknown>) => {
    const id = String(p.id ?? "");
    if (!id) return;
    const display = typeof p.display_name === "string" ? p.display_name : null;
    const legacy = typeof p.nickname === "string" ? p.nickname : null;
    const uname = typeof p.username === "string" ? p.username : null;
    const n = String(labelFromDisplayAndUsername(display ?? legacy, uname) || (display ?? legacy ?? uname ?? "")).trim();
    if (n) out[id] = n;
  });

  const needTest = ids.filter((id) => !out[id]?.trim());
  if (needTest.length) {
    const { data: tus } = await sbAny.from("test_users").select("id, display_name, username").in("id", needTest);
    (tus ?? []).forEach((t: Record<string, unknown>) => {
      const id = String(t.id ?? "");
      if (!id) return;
      const n = String((t.display_name ?? t.username ?? "") as string).trim();
      if (n) out[id] = n;
    });
  }

  ids.forEach((id) => {
    if (!out[id]?.trim()) out[id] = id.slice(0, 8) + "…";
  });

  return out;
}

export async function batchUserIdentityByUserIds(
  sbAny: any,
  userIds: string[]
): Promise<Record<string, { username?: string | null; displayName?: string | null }>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out: Record<string, { username?: string | null; displayName?: string | null }> = {};
  if (!ids.length) return out;

  const { data: profiles } = await sbAny
    .from("profiles")
    .select("id, display_name, username")
    .in("id", ids);
  (profiles ?? []).forEach((p: Record<string, unknown>) => {
    const id = String(p.id ?? "");
    if (!id) return;
    const displayName = typeof p.display_name === "string" ? p.display_name : null;
    const username = typeof p.username === "string" ? p.username : null;
    out[id] = { displayName, username };
  });

  const needTest = ids.filter((id) => !out[id]);
  if (needTest.length) {
    const { data: tus } = await sbAny.from("test_users").select("id, display_name, username").in("id", needTest);
    (tus ?? []).forEach((t: Record<string, unknown>) => {
      const id = String(t.id ?? "");
      if (!id) return;
      const displayName = typeof t.display_name === "string" ? t.display_name : null;
      const username = typeof t.username === "string" ? t.username : null;
      out[id] = { displayName, username };
    });
  }

  return out;
}
