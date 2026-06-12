import { CommunityMessengerRoomLayoutInlineShell } from "@/components/community-messenger/room/CommunityMessengerRoomLayoutInlineShell";

/**
 * BN14-2 — pure server layout (client import 없음 → layout.js chunk 가 shell paint 를 막지 않음).
 * BN13 persistence: layout RSC 가 loading ↔ page 교체 동안 shell DOM 유지.
 */
export default async function CommunityMessengerRoomSegmentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const rid = String(roomId ?? "").trim();

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" data-cm-room-segment-layout="">
      <div
        className="pointer-events-none absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col"
        data-cm-room-segment-shell-host=""
      >
        {rid ? <CommunityMessengerRoomLayoutInlineShell /> : null}
      </div>
      <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
