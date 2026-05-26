"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { CommunityMessengerPresenceDot } from "@/components/community-messenger/CommunityMessengerPresenceDot";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";
import { mannerBatteryAccentClass } from "@/lib/trust/manner-battery";
import type { CommunityMessengerPresenceState } from "@/lib/community-messenger/types";
import type { StoreOrderDeliveryMessengerHeaderModel } from "@/lib/store-order-chat/use-store-order-delivery-messenger-header";

type Props = {
  model: StoreOrderDeliveryMessengerHeaderModel;
  presenceState: CommunityMessengerPresenceState | null;
  showPresence: boolean;
  /** 접속·입력 중 등 — delivery 헤더에서도 subtitle 유지 */
  subtitle?: string | null;
};

/**
 * 배달 주문 메신저 헤더 — 아바타·제목·배터리 영역 (오버플로 방지 고정 레이아웃).
 */
export function StoreOrderDeliveryMessengerHeaderBlock({
  model,
  presenceState,
  showPresence,
  subtitle,
}: Props) {
  if (model.mode === "none" || !model.showAvatar) return null;

  const initial = model.title.trim().slice(0, 1).toUpperCase() || "?";
  const isUserAvatar = model.avatarRounded === "circle";
  const showBattery =
    model.mode === "owner_buyer_peer" && model.buyerTrustPercent != null && model.buyerTrustTier != null;

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
        <p className="truncate text-[15px] font-semibold leading-tight text-[color:var(--cm-room-text)]">
          {model.title}
        </p>
        {subtitle?.trim() ? (
          <p className="truncate sam-text-xxs leading-tight text-[color:var(--cm-room-text-muted)]">{subtitle}</p>
        ) : null}
      </div>

      {showBattery ? (
        <div
          className="flex max-w-[4.25rem] shrink-0 items-center gap-0.5 self-center"
          aria-label={`주문자 신뢰 배터리 ${model.buyerTrustPercent}%`}
        >
          <MannerBatteryIcon tier={model.buyerTrustTier!} percent={model.buyerTrustPercent!} size="sm" />
          <span
            className={`truncate text-[12px] font-semibold tabular-nums leading-none ${mannerBatteryAccentClass(model.buyerTrustTier!)}`}
          >
            {model.buyerTrustPercent}%
          </span>
        </div>
      ) : null}
    </>
  );
}
