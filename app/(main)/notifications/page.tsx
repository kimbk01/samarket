"use client";

import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import Link from "next/link";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Settings } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyNotificationsView } from "@/components/my/MyNotificationsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS } from "@/lib/ui/tier1-header-icon";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import {
  getNotificationBadgeCountServerSnapshot,
  getNotificationBadgeCountSnapshot,
  subscribeNotificationBadgeCount,
} from "@/lib/notifications/notification-badge-count-store";
import {
  applyNotificationCenterScrollRestore,
  consumeNotificationCenterScrollRestore,
  resetNotificationCenterScroll,
} from "@/lib/notifications/notification-center-scroll-restore";

/**
 * 알림 화면 (종 전체 화면) — 알림 최종 설계 (Owner 승인 2026-11-01).
 * 안 읽은 알림만 · 분야 탭 · 탭별 모두 읽음 · 밀어서 읽음. 「전체 보기」 기록 화면·선택·삭제 없음.
 * 주소 `/notifications` 는 설치된 앱의 대체 경로·지난 알림 목적지라 유지한다(설계 §6 R1·R2).
 */
export default function NotificationsCenterPage() {
  const { t } = useI18n();

  const badgeSnap = useSyncExternalStore(
    subscribeNotificationBadgeCount,
    getNotificationBadgeCountSnapshot,
    getNotificationBadgeCountServerSnapshot
  );
  const headerUnread = useMemo(() => {
    const n = Math.max(0, Math.floor(Number(badgeSnap?.total) || 0));
    return n;
  }, [badgeSnap?.total]);

  const [visibleCount, setVisibleCount] = useState(0);

  // U-G: 알림을 눌러 나갔다가 돌아온 경우만 이전 위치로(목록이 그려진 뒤), 그 밖에는 맨 위.
  const pendingRestoreYRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const restoreY = consumeNotificationCenterScrollRestore();
    pendingRestoreYRef.current = restoreY;
    if (restoreY == null) resetNotificationCenterScroll();
  }, []);

  const stopRestoreRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const restoreY = pendingRestoreYRef.current;
    if (restoreY == null || visibleCount <= 0) return;
    pendingRestoreYRef.current = null;
    stopRestoreRef.current = applyNotificationCenterScrollRestore(restoreY);
  }, [visibleCount]);
  useEffect(() => () => stopRestoreRef.current?.(), []);

  const headerTitle = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{t("common_notifications")}</span>
      {headerUnread > 0 ? (
        <span
          className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-sam-danger px-1.5 py-0.5 text-[11px] font-bold leading-none text-sam-on-primary tabular-nums"
          aria-label={t("notif_inbox_unread_n", { n: headerUnread })}
        >
          {headerUnread > 99 ? "99+" : headerUnread}
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={headerTitle}
        backHref="/"
        hideCtaStrip
        rightSlot={
          <Link
            href="/mypage/section/settings/notifications"
            className={SAM_TIER1_HEADER_ACTION_BTN_CLASS}
            aria-label={t("notif_tier1_to_settings")}
          >
            <Settings className="h-5 w-5" strokeWidth={2} aria-hidden />
          </Link>
        }
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-col py-3`}>
          <section
            id="notification-inbox"
            className="min-w-0 scroll-mt-4"
            aria-label={t("common_notifications")}
          >
            <Suspense fallback={<p className="text-sm text-sam-muted">{t("common_loading")}</p>}>
              <MyNotificationsView variant="notification_center" onVisibleCountChange={setVisibleCount} />
            </Suspense>
          </section>
        </div>
      </div>
    </div>
  );
}
