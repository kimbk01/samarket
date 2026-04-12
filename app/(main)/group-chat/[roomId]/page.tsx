import { GroupChatRoomClient } from "@/components/group-chat/GroupChatRoomClient";

/**
 * 다자 그룹 채팅 방 (group_* 축)
 * — 방 생성: `/group-chat` 에서 만들기 후 이 경로로 이동
 */
export default async function GroupChatRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const id = roomId?.trim() ?? "";
  if (!id) {
    return (
      <div className="p-6 text-center text-[14px] text-sam-muted">roomId가 필요합니다.</div>
    );
  }

  return (
    <section className="flex min-h-[70vh] min-w-0 flex-1 flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <GroupChatRoomClient roomId={id} listHref="/group-chat" />
    </section>
  );
}
