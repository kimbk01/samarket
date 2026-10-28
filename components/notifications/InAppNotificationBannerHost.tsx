"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { suppressCmRoomEntryNotificationSound } from "@/lib/community-messenger/notifications/cm-participant-surface-sync";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import {
  IN_APP_NOTIFICATION_BANNER_LOGO_SRC,
  inAppNotificationBannerRemainingMs,
  useInAppNotificationBannerStore,
  type InAppNotificationBannerItem,
} from "@/lib/notifications/in-app-banner/in-app-notification-banner-store";
import { activateNotificationDestination } from "@/lib/notifications/navigate-notification-destination";
import { defaultInboxFallbackHref } from "@/lib/notifications/resolve-notification-inbox-href";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { Sam } from "@/lib/ui/sam-component-classes";

/** 위로 이만큼(px) 끌면 닫힘 */
const SWIPE_DISMISS_PX = 36;
/** 이보다 작게 움직이면 탭 */
const TAP_SLOP_PX = 8;

const IMAGE_PX = 42;

function BannerImage({ item }: { item: InAppNotificationBannerItem }) {
  const p = item.presentation;
  const person = p.kind === "message" || p.kind === "missed_call";
  const circle = p.imageShape === "circle";
  const rounded = circle ? "rounded-full" : "rounded-[10px]";
  if (person) {
    return (
      <span className={`inline-flex h-[42px] w-[42px] shrink-0 overflow-hidden ${rounded}`}>
        <SamarketThumbnail
          src={resolveUserAvatarImageSrc(p.imageUrl ?? undefined)}
          size={IMAGE_PX}
          roundedClassName={rounded}
          fallbackSrc=""
          fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
        />
      </span>
    );
  }
  return (
    <span className={`inline-flex h-[42px] w-[42px] shrink-0 overflow-hidden ${rounded}`}>
      <SamarketThumbnail
        src={p.imageUrl || IN_APP_NOTIFICATION_BANNER_LOGO_SRC}
        size={IMAGE_PX}
        roundedClassName={rounded}
        fallbackSrc={IN_APP_NOTIFICATION_BANNER_LOGO_SRC}
      />
    </span>
  );
}

/**
 * 앱 안 알림 배너 — 단일 호스트 (Owner 시안 ④ 2026-10-29).
 * 메신저 메시지·부재중과 회원 알림(주문·공지·시스템·커뮤니티·거래)을 같은 모양으로 그린다.
 * 4초 자동 소멸 · 위로 밀어 닫기 · 탭 = OS 알림·알림센터 행과 같은 목적지.
 * 통화 오버레이보다 낮은 z-index (`IncomingCallOverlay` 가 위).
 */
export function InAppNotificationBannerHost() {
  const router = useRouter();
  const { language, safeT } = useI18n();
  const banner = useInAppNotificationBannerStore((s) => s.banner);
  const dismiss = useInAppNotificationBannerStore((s) => s.dismiss);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef<{ pointerId: number; startY: number; moved: boolean } | null>(null);
  /** 끌기 뒤에 따라오는 click 은 이동으로 치지 않는다 */
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!banner) return;
    const updatedAt = banner.updatedAt;
    const t = window.setTimeout(() => {
      const cur = useInAppNotificationBannerStore.getState().banner;
      if (cur && cur.updatedAt === updatedAt) dismiss();
    }, inAppNotificationBannerRemainingMs(updatedAt, Date.now()));
    return () => window.clearTimeout(t);
  }, [banner, dismiss]);

  useEffect(() => {
    setDragY(0);
    dragRef.current = null;
  }, [banner?.updatedAt]);

  if (!banner) return null;
  const p = banner.presentation;
  if (!p.title && !p.body) return null;

  const open = () => {
    const target = banner.target;
    dismiss();
    if (target.type === "messenger_room") {
      suppressCmRoomEntryNotificationSound(target.roomId);
      router.push(`/community-messenger/rooms/${encodeURIComponent(target.roomId)}`);
      return;
    }
    activateNotificationDestination({
      router,
      resolveInput: {
        inboxRow: target.inboxRow,
        notificationId: target.notificationId,
        fallbackHref: defaultInboxFallbackHref(),
      },
    });
  };

  const timeLabel = p.occurredAt ? formatRelativeTimeAgo(p.occurredAt, language) : "";
  const title = `${p.title}${banner.count > 1 ? ` · ${banner.count}` : ""}`;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[50] flex justify-center px-3 pt-[max(0.5rem,var(--safe-top))]"
      role="status"
      aria-live="polite"
      data-in-app-notification-banner={p.kind}
    >
      <div
        className="pointer-events-auto relative flex max-w-lg min-w-0 flex-1 touch-none select-none items-center rounded-[var(--overlay-radius-lg)] bg-sam-surface shadow-sam-elevated"
        style={{
          transform: dragY < 0 ? `translateY(${dragY}px)` : undefined,
          opacity: dragY < 0 ? Math.max(0.3, 1 + dragY / 120) : undefined,
        }}
        onPointerDown={(e) => {
          suppressClickRef.current = false;
          dragRef.current = { pointerId: e.pointerId, startY: e.clientY, moved: false };
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d || d.pointerId !== e.pointerId) return;
          const dy = e.clientY - d.startY;
          if (Math.abs(dy) > TAP_SLOP_PX) d.moved = true;
          setDragY(Math.min(0, dy));
        }}
        onPointerUp={(e) => {
          const d = dragRef.current;
          dragRef.current = null;
          if (!d || d.pointerId !== e.pointerId) return;
          const dy = e.clientY - d.startY;
          if (dy <= -SWIPE_DISMISS_PX) {
            dismiss();
            return;
          }
          setDragY(0);
          if (d.moved) suppressClickRef.current = true;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragY(0);
        }}
      >
        <button
          type="button"
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 px-[14px] py-3 text-left"
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            open();
          }}
        >
          <BannerImage item={banner} />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className={`min-w-0 flex-1 truncate font-semibold text-sam-fg ${Sam.text.body}`}>{title}</span>
              {timeLabel ? (
                <span className={`shrink-0 text-sam-muted ${Sam.text.helper}`}>{timeLabel}</span>
              ) : null}
            </span>
            {p.body ? (
              <span
                className={`mt-0.5 block truncate ${Sam.text.body} ${
                  p.bodyTone === "alert" ? "text-sam-danger" : "text-sam-muted"
                }`}
              >
                {p.body}
              </span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          aria-label={safeT("common_close", { fallbackKo: "닫기", fallbackEn: "Close" })}
          className="sr-only focus:not-sr-only focus:absolute focus:right-1 focus:top-1 focus:h-11 focus:w-11 focus:rounded-full focus:bg-sam-app"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
