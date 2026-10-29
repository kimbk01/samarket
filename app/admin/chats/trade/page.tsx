import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminMessengerDomainRoomList } from "@/components/admin/chats/AdminMessengerDomainRoomList";

/**
 * 거래 › 거래 채팅방 — 채팅방 목록(CM 기준)과 같은 컴포넌트·같은 API 를 거래 유형 고정으로 그린다 (설계 §1-3·§8).
 * Admin IA R1 (감사 IA-03): 예전에는 `/admin/chats?type=trade` 로 redirect 해 누르면 채팅 워크스페이스로 넘어갔다.
 * 딥링크 `postId`·`buyerId`·`sellerId`·`q`·`status` 는 목록이 URL 에서 그대로 읽는다.
 * 레거시 방 `roomId` 는 레거시 상세(→ CM 방 상세)로 보낸다.
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
  return (
    <Suspense fallback={null}>
      <AdminMessengerDomainRoomList mode="trade" />
    </Suspense>
  );
}
