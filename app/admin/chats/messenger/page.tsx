import { redirect } from "next/navigation";

/**
 * 예전 「커뮤니티 메신저」 경로 (설계 §1-3) — 통화 기록은 `/admin/chats/calls`.
 * 방 검색 딥링크(`room`·`q`·`user_id`)는 채팅방 목록으로 같은 조건을 넘긴다.
 */
export default async function AdminChatsMessengerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") sp.set(k, v);
  }
  if (sp.get("room") || sp.get("q") || sp.get("user_id")) {
    const list = new URLSearchParams();
    const q = sp.get("room") || sp.get("q");
    if (q) list.set("q", q);
    const uid = sp.get("user_id");
    if (uid) list.set("user_id", uid);
    redirect(`/admin/chats?${list.toString()}`);
  }
  const qs = sp.toString();
  redirect(`/admin/chats/calls${qs ? `?${qs}` : ""}`);
}
