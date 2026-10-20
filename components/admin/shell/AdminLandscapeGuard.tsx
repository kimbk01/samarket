"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";

/**
 * 관리자 가로 전용 가드 (설계 v4 §2-2 A층) — `/admin` 레이아웃 루트에서만 사용한다.
 * 세로 또는 폭 < 1024px 이면 안내 화면으로 덮는다.
 *
 * - 표시/숨김은 CSS 미디어 쿼리(`app/samarket-components.css` `.admin-landscape-*`)가 담당 → 하이드레이션 전에도 적용(깜빡임 없음).
 * - 작업 화면은 언마운트하지 않는다(visibility 로만 가림) → 회전해도 입력 중인 폼 상태가 유지된다.
 * - JS 는 가려진 동안 `inert`/`aria-hidden` 만 동기화한다.
 */
/** 인쇄(print)에는 적용하지 않는다 — 화면(screen)만. */
export const ADMIN_LANDSCAPE_GUARD_MEDIA_QUERY =
  "screen and (orientation: portrait), screen and (max-width: 1023px)";

/** 가드는 Dibay 다이얼로그 층(z-[1300]~z-[1400]) 위, 가드 안 로그아웃 확인 모달은 그 위. */
const GUARD_LOGOUT_CONFIRM_Z_CLASS = "z-[1510]";

function IconRotateLandscape() {
  return (
    <svg
      className="admin-landscape-guard__icon"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="6" y="14" width="36" height="22" rx="3" />
      <path d="M17 8a14 14 0 0 1 16 2" />
      <path d="M33 5v5h-5" />
    </svg>
  );
}

export function AdminLandscapeGuard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(ADMIN_LANDSCAPE_GUARD_MEDIA_QUERY);
    const sync = () => {
      if (mql.matches) {
        el.setAttribute("inert", "");
        el.setAttribute("aria-hidden", "true");
      } else {
        el.removeAttribute("inert");
        el.removeAttribute("aria-hidden");
      }
    };
    sync();
    mql.addEventListener("change", sync);
    return () => {
      mql.removeEventListener("change", sync);
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    };
  }, []);

  return (
    <div className="admin-landscape-root" data-admin-landscape-root="1">
      <div ref={contentRef} className="admin-landscape-root__content" data-admin-landscape-content="1">
        {children}
      </div>
      <div
        data-admin
        data-admin-landscape-guard="1"
        className="admin-landscape-guard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-landscape-guard-title"
        aria-describedby="admin-landscape-guard-desc"
      >
        <div className="admin-landscape-guard__panel">
          <IconRotateLandscape />
          <h1 id="admin-landscape-guard-title" className="admin-landscape-guard__title">
            {t("admin_landscape_guard_title")}
          </h1>
          <p id="admin-landscape-guard-desc" className="admin-landscape-guard__desc">
            {t("admin_landscape_guard_desc")}
          </p>
          <div className="admin-landscape-guard__actions">
            <LogoutActionTrigger
              variant="outlined_button"
              label={t("admin_landscape_guard_logout")}
              confirmZIndexClass={GUARD_LOGOUT_CONFIRM_Z_CLASS}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
