"use client";

import { useRouter } from "next/navigation";
import { useMessengerInAppMessageBannerStore } from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";

/**
 * 앱 레벨 메시지 배너 — 통화 오버레이보다 낮은 z-index (`IncomingCallOverlay` 가 위).
 * 메시지 메타(제목·프리뷰)는 실시간 페이로드 연동 시 `pushOrMerge` 로 채운다.
 */
export function MessengerInAppMessageBannerHost() {
  const router = useRouter();
  const banner = useMessengerInAppMessageBannerStore((s) => s.banner);
  const dismiss = useMessengerInAppMessageBannerStore((s) => s.dismiss);

  if (!banner) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[50] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-lg min-w-0 flex-1 items-start gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 shadow-lg">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            dismiss();
            router.push(`/community-messenger/rooms/${encodeURIComponent(banner.roomId)}`);
          }}
        >
          <p className="truncate text-[13px] font-semibold text-sam-fg">
            {banner.title || "메신저"}
            {banner.count > 1 ? ` · ${banner.count}` : ""}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[12px] text-sam-muted">{banner.preview || "새 메시지"}</p>
        </button>
        <button
          type="button"
          className="shrink-0 rounded-full px-2 py-1 text-[12px] font-medium text-sam-muted hover:bg-sam-app"
          onClick={dismiss}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
