"use client";

import { useRouter } from "next/navigation";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { useMessengerInAppMessageBannerStore } from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 앱 레벨 메시지 배너 — 통화 오버레이보다 낮은 z-index (`IncomingCallOverlay` 가 위).
 * display_payload / realtime hint 와 홈 room summary 로 sender·preview·avatar·context 를 채운다.
 */
export function MessengerInAppMessageBannerHost() {
  const router = useRouter();
  const banner = useMessengerInAppMessageBannerStore((s) => s.banner);
  const dismiss = useMessengerInAppMessageBannerStore((s) => s.dismiss);

  if (!banner) return null;

  const avatarSrc = resolveUserAvatarImageSrc(banner.senderAvatarUrl);
  const contextLine =
    banner.contextLabel && banner.roomKind !== "direct"
      ? banner.contextLabel
      : banner.roomKind === "group"
        ? "그룹 채팅"
        : null;
  const routeUrl =
    banner.routeUrl?.trim() || `/community-messenger/rooms/${encodeURIComponent(banner.roomId)}`;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[50] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-lg min-w-0 flex-1 items-start gap-2.5 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 shadow-sam-elevated">
        <SamarketThumbnail
          src={avatarSrc}
          alt=""
          className="mt-0.5 h-10 w-10 shrink-0 rounded-full"
          fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            dismiss();
            router.push(routeUrl);
          }}
        >
          <p className={`truncate font-semibold text-sam-fg ${Sam.text.bodySecondary}`}>
            {banner.title || banner.senderName || "메신저"}
            {banner.count > 1 ? ` · ${banner.count}` : ""}
          </p>
          {contextLine ? (
            <p className={`mt-0.5 truncate text-sam-muted ${Sam.text.helper}`}>{contextLine}</p>
          ) : null}
          <p className={`mt-0.5 line-clamp-2 text-sam-muted ${Sam.text.helper}`}>
            {banner.preview || "새 메시지"}
          </p>
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
