"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { CommunityMessengerPresenceDot } from "@/components/community-messenger/CommunityMessengerPresenceDot";
import { CrewRepBadge } from "@/components/trust/CrewRep";
import { TypingIndicatorLine } from "@/components/community-messenger/TypingIndicatorLine";
import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";
import type { StoreOrderDeliveryMessengerHeaderModel } from "@/lib/store-order-chat/use-store-order-delivery-messenger-header";

type Props = {
  model: StoreOrderDeliveryMessengerHeaderModel;
  presenceState: CommunityMessengerPresenceState | null;
  showPresence: boolean;
  /** 접속·업종 등 — delivery 헤더 subtitle */
  subtitle?: string | null;
  /** 입력 중 문구(P3) — 있으면 subtitle 대신 `TypingIndicatorLine` */
  typingLabel?: string | null;
};

/**
 * 배달 주문 메신저 헤더 — 아바타·제목·CREW REP 영역 (오버플로 방지 고정 레이아웃).
 */
export function StoreOrderDeliveryMessengerHeaderBlock({
  model,
  presenceState,
  showPresence,
  subtitle,
  typingLabel = null,
}: Props) {
  if (model.mode === "none" || !model.showAvatar) return null;

  const initial = model.title.trim().slice(0, 1).toUpperCase() || "?";
  const isUserAvatar = model.avatarRounded === "circle";
  const showCrewRep = model.mode === "owner_buyer_peer" && model.buyerCrewRepScore != null;

  return (
    <>
      <div className="relative h-9 w-9 shrink-0 self-center">
        {isUserAvatar ? (
          <SamarketUserAvatarThumb
            avatarUrl={model.avatarUrl}
            size={36}
            roundedClassName="rounded-full"
            className="bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]"
          />
        ) : (
          <SamarketThumbnail
            src={model.avatarUrl}
            size={36}
            fetchDisplayPx={72}
            roundedClassName="rounded-ui-rect"
            className="bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]"
            fallbackSrc=""
            fallbackNode={
              <div className="sam-text-body-secondary font-semibold text-[color:var(--cm-room-primary)]">{initial}</div>
            }
          />
        )}
        {showPresence && presenceState ? (
          <CommunityMessengerPresenceDot state={presenceState} />
        ) : null}
      </div>

      <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center self-center overflow-hidden leading-tight">
        <p className="truncate text-[length:var(--cm-chat-font-header-title)] font-semibold leading-tight text-[color:var(--sector-header-title-color)]">
          {model.title}
        </p>
        {typingLabel ? (
          <p className="truncate text-[length:var(--cm-chat-font-header-status)] leading-tight text-[color:var(--cm-room-text-muted)]">
            <TypingIndicatorLine label={typingLabel} />
          </p>
        ) : subtitle?.trim() ? (
          <p className="truncate text-[length:var(--cm-chat-font-header-status)] leading-tight text-[color:var(--cm-room-text-muted)]">{subtitle}</p>
        ) : null}
      </div>

      {showCrewRep ? (
        <CrewRepBadge score={model.buyerCrewRepScore!} variant="compact" className="self-center" />
      ) : null}
    </>
  );
}
