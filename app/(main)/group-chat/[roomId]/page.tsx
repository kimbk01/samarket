import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { APP_LANGUAGE_COOKIE } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { GroupChatRoomClient } from "@/components/group-chat/GroupChatRoomClient";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { loadGroupChatBootstrapForUser } from "@/lib/group-chat/load-group-chat-bootstrap-server";

async function GroupChatRoomPageBody({ paramsPromise }: { paramsPromise: Promise<{ roomId: string }> }) {
  const jar = await cookies();
  const hdr = await headers();
  const lang = resolveServerInitialLanguage({
    cookieValue: jar.get(APP_LANGUAGE_COOKIE)?.value ?? null,
    acceptLanguage: hdr.get("accept-language"),
  });
  const { roomId } = await paramsPromise;
  const id = roomId?.trim() ?? "";
  if (!id) {
    return (
      <div className="p-6 text-center sam-text-body text-sam-muted">{translate(lang, "ui_group_chat_room_id_required")}</div>
    );
  }

  const userId = await getOptionalAuthenticatedUserId();
  if (!userId) {
    notFound();
  }

  const boot = await loadGroupChatBootstrapForUser(userId, id);
  if (!boot.ok) {
    if (boot.status === 404) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-sam-muted">
          <p>{translate(lang, "ui_group_chat_room_not_found")}</p>
          <Link href="/group-chat" className="font-medium text-signature underline">
            {translate(lang, "common_to_list")}
          </Link>
        </div>
      );
    }
    if (boot.status === 403) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center text-sm text-sam-muted">
          <p>{boot.error}</p>
          <Link href="/group-chat" className="font-medium text-signature underline">
            {translate(lang, "common_to_list")}
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
