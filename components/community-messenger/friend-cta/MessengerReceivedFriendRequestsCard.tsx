"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

type Props = {
  /** 대기 요청 (1건 이상일 때만 렌더) */
  requests: CommunityMessengerFriendRequest[];
  onOpen: () => void;
  /** received: 받은 요청(브랜드 강조) · sent: 보낸 요청(수락 대기, 차분한 회색) — D-9 */
  variant?: "received" | "sent";
};

/**
 * 친구 탭 — 받은 친구 요청이 있을 때만 보이는 카드 1개(1단계 문서 §11).
 * 겹친 아바타(최대 3) · 「받은 친구 요청 n」 · 「○○ 외 n명」 · 「확인」. 카드 전체가 눌림 영역.
 */
export function MessengerReceivedFriendRequestsCard({ requests, onOpen, variant = "received" }: Props) {
  const { t } = useI18n();
  if (requests.length === 0) return null;
  const sent = variant === "sent";
  const peerLabel = (req: CommunityMessengerFriendRequest) => (sent ? req.addresseeLabel : req.requesterLabel);
  const peerAvatar = (req: CommunityMessengerFriendRequest) => (sent ? req.addresseeAvatarUrl : req.requesterAvatarUrl);
  const first = requests[0];
  const names =
    requests.length === 1
      ? peerLabel(first)
      : t("cm_friend_received_card_names", { name: peerLabel(first), count: requests.length - 1 });

  return (
    <div className="px-3 pt-1">
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full items-center gap-3 rounded-ui-rect border px-3 py-2.5 text-left transition-[transform,filter] duration-100 active:scale-[0.99] active:brightness-95 ${
          sent
            ? "border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]"
            : "border-[color:var(--messenger-primary-soft-2)] bg-[color:var(--messenger-primary-soft)]"
        }`}
        data-cm-friend-received-card={sent ? undefined : ""}
        data-cm-friend-sent-card={sent ? "" : undefined}
      >
        <span className="flex shrink-0 -space-x-2.5" aria-hidden>
          {requests.slice(0, 3).map((req) => (
            <span
              key={req.id}
              className={`inline-flex h-8 w-8 overflow-hidden rounded-full ring-2 ${
                sent ? "ring-[color:var(--messenger-surface)]" : "ring-[color:var(--messenger-primary-soft)]"
              }`}
            >
              <SamarketThumbnail
                src={resolveUserAvatarImageSrc(peerAvatar(req) ?? undefined)}
                size={32}
                roundedClassName="rounded-full"
                fallbackSrc=""
                fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
              />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block sam-text-body font-semibold ${sent ? "" : "text-[color:var(--messenger-primary)]"}`}
            style={sent ? { color: "var(--messenger-text)" } : undefined}
          >
            {t(sent ? "cm_friend_sent_card_title" : "cm_friend_received_card_title", { count: requests.length })}
          </span>
          <span className="block truncate sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
            {sent ? t("cm_friend_sent_card_names", { names }) : names}
          </span>
        </span>
        {sent ? (
          <span className="shrink-0 sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }} aria-hidden>
            ›
          </span>
        ) : (
          <span className="shrink-0 rounded-ui-rect bg-[color:var(--messenger-primary)] px-3 py-1.5 sam-text-helper font-semibold text-[color:var(--sam-text-on-primary)]">
            {t("cm_friend_received_card_action")}
          </span>
        )}
      </button>
    </div>
  );
}
