"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMessengerInAppMessageBannerStore } from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";
import { suppressCmRoomEntryNotificationSound } from "@/lib/community-messenger/notifications/cm-participant-surface-sync";
import { Sam } from "@/lib/ui/sam-component-classes";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";

/** 인앱 메시지 배너 — 자동 소멸 (읽음 clear 와 별도 TTL) */
const MESSENGER_IN_APP_BANNER_AUTO_DISMISS_MS = 4_000;

/**
 * 앱 레벨 메시지 배너 — 통화 오버레이보다 낮은 z-index (`IncomingCallOverlay` 가 위).
 * §14-11 M-B1: 제목·본문은 OS 푸시와 같은 문구(`messenger-in-app-banner-content`)만 받는다 — 고정 문구 없음.
 */
export function MessengerInAppMessageBannerHost() {
  const router = useRouter();
  const banner = useMessengerInAppMessageBannerStore((s) => s.banner);
  const dismiss = useMessengerInAppMessageBannerStore((s) => s.dismiss);

  useEffect(() => {
    if (!banner) return;
    const updatedAt = banner.updatedAt;
    const elapsed = Date.now() - updatedAt;
    const remain = Math.max(0, MESSENGER_IN_APP_BANNER_AUTO_DISMISS_MS - elapsed);
    const t = window.setTimeout(() => {
      const cur = useMessengerInAppMessageBannerStore.getState().banner;
      if (cur && cur.updatedAt === updatedAt) dismiss();
    }, remain);
    return () => window.clearTimeout(t);
  }, [banner, dismiss]);

  if (!banner || !banner.title || !banner.preview) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[50] flex justify-center px-3 pt-[max(0.5rem,var(--safe-top))]"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-lg min-w-0 flex-1 items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 shadow-sam-elevated">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => {
            suppressCmRoomEntryNotificationSound(banner.roomId);
            dismiss();
            router.push(`/community-messenger/rooms/${encodeURIComponent(banner.roomId)}`);
          }}
        >
          <span className="inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
            <SamarketThumbnail
              src={resolveUserAvatarImageSrc(banner.avatarUrl ?? undefined)}
              size={40}
              roundedClassName="rounded-full"
              fallbackSrc=""
              fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-semibold text-sam-fg ${Sam.text.bodySecondary}`}>
              {banner.title}
              {banner.count > 1 ? ` · ${banner.count}` : ""}
            </span>
            <span className={`mt-0.5 block line-clamp-2 break-words text-sam-muted ${Sam.text.helper}`}>{banner.preview}</span>
          </span>
        </button>
        <button
          type="button"
          className={`shrink-0 rounded-full px-2 py-1 font-medium text-sam-muted hover:bg-sam-app ${Sam.text.helper}`}
          onClick={dismiss}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
