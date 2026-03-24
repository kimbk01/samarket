/**
 * profiles → test_users 순으로 닉네임 보강 (관리자 API 공통)
 * @param sbAny Supabase 클라이언트 (서비스 롤/anon — 제네릭 스키마 차이 허용)
 */
 
export async function batchNicknamesByUserIds(sbAny: any, userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out: Record<string, string> = {};
  if (!ids.length) return out;

  const { data: profiles } = await sbAny.from("profiles").select("id, nickname, username").in("id", ids);
  (profiles ?? []).forEach((p: Record<string, unknown>) => {
    const id = String(p.id ?? "");
    if (!id) return;
    const n = String((p.nickname ?? p.username ?? "") as string).trim();
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
