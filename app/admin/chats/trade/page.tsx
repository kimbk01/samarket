import { redirect } from "next/navigation";

/**
 * 거래 채팅 목록은 채팅방 목록(CM 기준) 하나로 (설계 §1-3·§8).
 * 딥링크 `postId`·`buyerId`·`sellerId` 는 그대로 넘기고, 레거시 방 `roomId` 는 레거시 상세(→ CM 방 상세)로 보낸다.
 */
export default async function AdminChatsTradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const get = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const roomId = get("roomId");
  if (roomId && !get("postId")) redirect(`/admin/chats/${encodeURIComponent(roomId)}`);
  const sp = new URLSearchParams({ type: "trade" });
  for (const k of ["postId", "buyerId", "sellerId", "q", "status"]) {
    const v = get(k);
    if (v) sp.set(k, v);
  }
  if (get("reported") === "1") sp.set("reported", "1");
  redirect(`/admin/chats?${sp.toString()}`);
}
