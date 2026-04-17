import { Suspense } from "react";
import Link from "next/link";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { GroupChatRoomClient } from "@/components/group-chat/GroupChatRoomClient";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadGroupChatBootstrapForUser } from "@/lib/group-chat/load-group-chat-bootstrap-server";

export const dynamic = "force-dynamic";

async function GroupChatRoomPageBody({ paramsPromise }: { paramsPromise: Promise<{ roomId: string }> }) {
  const { roomId } = await paramsPromise;
  const id = roomId?.trim() ?? "";
  if (!id) {
    return (
      <div className="p-6 text-center text-[14px] text-sam-muted">roomId가 필요합니다.</div>
    );
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-sam-muted">로그인이 필요합니다.</p>
        <Link href="/login" className="font-medium text-signature underline">
          로그인
        </Link>
      </div>
    );
  }

  const boot = await loadGroupChatBootstrapForUser(userId, id);
  if (!boot.ok) {
    if (boot.status === 404) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-sam-muted">
          <p>방을 찾을 수 없습니다.</p>
          <Link href="/group-chat" className="font-medium text-signature underline">
            목록으로
          </Link>
        </div>
      );
    }
    if (boot.status === 403) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-sam-muted">
          <p>{boot.error}</p>
          <Link href="/group-chat" className="font-medium text-signature underline">
            목록으로
          </Link>
        </div>
      );
    }
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center text-sm text-sam-muted">
        <p>{boot.error}</p>
      </div>
    );
  }

  return (
    <section className="flex min-h-[70vh] min-w-0 flex-1 flex-col overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
      <GroupChatRoomClient key={id} roomId={id} listHref="/group-chat" initialBootstrap={boot.body} />
    </section>
  );
}

export default function GroupChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <GroupChatRoomPageBody paramsPromise={params} />
    </Suspense>
  );
}
