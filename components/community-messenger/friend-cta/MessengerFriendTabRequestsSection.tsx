"use client";

import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { MessengerFriendTabSectionLabel } from "@/components/community-messenger/friend-list/CommunityMessengerFriendSection";
import { useMessengerFriendRequestRespond } from "@/components/community-messenger/friend-cta/use-messenger-friend-request-respond";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

type Props = {
  /** 나에게 온 대기 중 요청 */
  incoming: CommunityMessengerFriendRequest[];
  /** 내가 보낸 대기 중 요청 수 — 1 이상이면 「보낸 친구 요청 N ›」 줄 */
  outgoingCount: number;
  /** 보낸 요청 → 친구 요청 시트 「보낸 요청」 탭 */
  onOpenSent: () => void;
  /** 수락·거절 처리된 요청 id — 상위가 목록에서 빼고 서버와 다시 맞춤(시트와 같은 `onFriendRequestsChanged`) */
  onChanged: (handledRequestId?: string) => void;
};

const BTN = "inline-flex h-8 shrink-0 items-center rounded-[8px] px-[13px] text-[13px] font-semibold disabled:opacity-50";

/**
 * 친구 탭 「받은 친구 요청 N」 (채팅 시안 4판 「2. 친구 탭」, Owner 「정확히 시안대로」 2026-11-10).
 * 받은 요청마다 64px 줄 — 사진 44(둥근 사각 16) · 이름 16/600 · @아이디 12.5 회색 · [거절](회색) [수락](초록).
 * 수락·거절은 친구 요청 시트와 같은 처리(`useMessengerFriendRequestRespond` — 같은 API·안내).
 * 보낸 요청은 아래 한 줄(52px)로만 — 누르면 기존 시트의 보낸 요청 탭. 예전 요약 카드는 없다.
 */
export function MessengerFriendTabRequestsSection({ incoming, outgoingCount, onOpenSent, onChanged }: Props) {
  const { t } = useI18n();
  const { busy, respond } = useMessengerFriendRequestRespond(onChanged);
  if (incoming.length === 0 && outgoingCount === 0) return null;

  return (
    <section data-cm-friend-requests-block="" aria-label={t("cm_friend_section_received_requests")}>
      {incoming.length > 0 ? (
        <>
          <MessengerFriendTabSectionLabel title={t("cm_friend_section_received_requests")} count={incoming.length} />
          {incoming.map((req) => {
            const rowBusy = busy?.id === req.id ? busy.action : null;
            const disabled = busy !== null;
            return (
              <div key={req.id} className="flex h-16 items-center gap-3 px-4" data-cm-friend-request-row={req.id}>
                <span className="inline-flex h-11 w-11 shrink-0 overflow-hidden rounded-[16px]">
                  <SamarketThumbnail
                    src={resolveUserAvatarImageSrc(req.requesterAvatarUrl ?? undefined)}
                    size={44}
                    roundedClassName="rounded-[16px]"
                    className="h-full w-full bg-[color:var(--cm-chat-band)]"
                    fallbackSrc=""
                    fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                  />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <p className="truncate text-[16px] font-semibold leading-[1.3]" style={{ color: "var(--cm-chat-fg)" }}>
                    {req.requesterLabel}
                  </p>
                  {req.requesterHandle ? (
                    <p className="truncate text-[12.5px] leading-[1.3]" style={{ color: "var(--cm-chat-sub)" }}>
                      @{req.requesterHandle}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void respond(req, "reject")}
                  className={`${BTN} bg-[color:var(--cm-chat-band)]`}
                  style={{ color: "var(--cm-chat-fg)" }}
                  data-cm-friend-request-reject=""
                >
                  {rowBusy === "reject" ? t("common_processing") : t("cm_friend_cta_reject")}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void respond(req, "accept")}
                  className={`${BTN} bg-sam-primary text-sam-on-primary`}
                  data-cm-friend-request-accept=""
                >
                  {rowBusy === "accept" ? t("common_processing") : t("cm_friend_cta_accept")}
                </button>
              </div>
            );
          })}
        </>
      ) : null}
      {outgoingCount > 0 ? (
        <button
          type="button"
          onClick={onOpenSent}
          className="flex h-[52px] w-full items-center gap-1 px-4 text-left text-[15px] active:bg-[color:var(--messenger-surface-muted)]"
          style={{ color: "var(--cm-chat-fg)" }}
          data-cm-friend-sent-requests-row=""
        >
          <span className="min-w-0 truncate">
            {t("cm_friend_sent_requests_row")} <span className="tabular-nums">{outgoingCount}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.7} style={{ color: "var(--cm-chat-sub)" }} aria-hidden />
        </button>
      ) : null}
    </section>
  );
}
