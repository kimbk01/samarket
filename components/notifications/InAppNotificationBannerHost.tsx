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
import { KASAMA_NOTIFICATIONS_UPDATED } from "@/lib/notifications/notification-events";
import { resyncBadgesAfterNotificationEventsRead } from "@/lib/notifications/client/notification-events-read-resync";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DIBAY_TOP_BANNER_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";

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

/**
 * 종 팝업 `markIdsRead` 와 같은 서버 경로(PATCH ids) — 읽음 범위는 서버 단일 함수가 정한다.
 * 배너는 탭(열기)으로만 읽음 → `opened: true` (운영자 알림 열람 기록 · 확정 설계 B-1).
 */
async function markBannerNotificationRead(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  try {
    const res = await fetch("/api/me/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, opened: true }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (!res.ok || !j?.ok) return false;
    window.dispatchEvent(new Event(KASAMA_NOTIFICATIONS_UPDATED));
    resyncBadgesAfterNotificationEventsRead("notification_opened");
    return true;
  } catch {
    return false;
  }
}

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
    // C4 읽음 계약: 배너 탭도 종·전체 목록·푸시 탭과 같은 읽음 함수(PATCH → patchInboxNotificationIdsRead)로
    // 같은 결과를 낸다. (이전: 배너는 읽음 처리를 하지 않아 도착 화면이 읽음 처리하지 않는 종류는 미읽음으로 남았다.)
    activateNotificationDestination({
      router,
      resolveInput: {
        inboxRow: target.inboxRow,
        notificationId: target.notificationId,
        fallbackHref: defaultInboxFallbackHref(),
      },
      unreadIds: target.notificationId ? [target.notificationId] : [],
      markRead: markBannerNotificationRead,
    });
  };

  const timeLabel = p.occurredAt ? formatRelativeTimeAgo(p.occurredAt, language) : "";
  const title = `${p.title}${banner.count > 1 ? ` · ${banner.count}` : ""}`;

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-0 ${DIBAY_TOP_BANNER_Z_CLASS} flex justify-center px-3 pt-[max(0.5rem,var(--safe-top))]`}
      role="status"
      aria-live="polite"
      data-in-app-notification-banner={p.kind}
    >
      <div
        className={`${OverlayUi.banner} pointer-events-auto relative max-w-lg min-w-0 flex-1 touch-none select-none`}
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
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 px-0.5 py-1 text-left"
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
              <span className={`${OverlayUi.bannerTitle} min-w-0 flex-1`}>{title}</span>
              {timeLabel ? (
                <span className="shrink-0 text-[length:var(--overlay-caption-size)] text-[color:var(--overlay-text-secondary)]">
                  {timeLabel}
                </span>
              ) : null}
            </span>
            {p.body ? (
              <span
                className={`${OverlayUi.bannerBody} mt-0.5`}
                style={p.bodyTone === "alert" ? { color: "var(--overlay-danger)" } : undefined}
              >
                {p.body}
              </span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          aria-label={safeT("common_close")}
          className="sr-only focus:not-sr-only focus:absolute focus:right-1 focus:top-1 focus:h-11 focus:w-11 focus:rounded-full focus:bg-sam-app"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
