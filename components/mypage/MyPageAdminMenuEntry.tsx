"use client";

import { useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { subscribeDibayAuthStateChange } from "@/lib/auth/dibay-session-manager";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyPageMobileMenuRow } from "@/components/mypage/mobile/MyPageMobileMenuRow";
import { MyInfoMenuLinkRow } from "@/components/mypage/myinfo/MyInfoMenuAction";
import { MYPAGE_HOME_CARD_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";
import type { MypageAdminMenuSeed } from "@/lib/my/load-mypage-admin-menu-seed";

type AdminAccessResult = "admin" | "not_admin" | "unknown";

/**
 * `GET /api/admin/access-check` (= `isRouteAdmin()`, shared with AdminGuard).
 * Only a 2xx JSON body with a boolean `ok` is a decision; network / HTTP / body errors are "unknown".
 * Single-flight is keyed per viewer so one account never reuses another account's in-flight answer.
 */
async function fetchAdminAccess(viewerKey: string): Promise<AdminAccessResult> {
  try {
    const res = await runSingleFlight(`admin:access-check:get:${viewerKey}`, () =>
      fetch("/api/admin/access-check", { credentials: "include", cache: "no-store" })
    );
    if (!res.ok) return "unknown";
    const data = (await res.clone().json().catch(() => null)) as { ok?: unknown } | null;
    if (typeof data?.ok !== "boolean") return "unknown";
    return data.ok ? "admin" : "not_admin";
  } catch {
    return "unknown";
  }
}

function currentViewerId(): string {
  return getCurrentUser()?.id?.trim() ?? "";
}

/** Server seed counts only for the account it was computed for (unknown local viewer = same request). */
function seedShowsAdminForViewer(seed: MypageAdminMenuSeed | null, viewerId: string): boolean {
  if (!seed || seed.isAdmin !== true) return false;
  return !viewerId || viewerId === seed.viewerId;
}

/**
 * 관리자로 지정된 계정에만 표시 (설정 섹션 목록 하단·내정보 홈 하단 등).
 *
 * Display authority (server access control is unchanged — `/admin` and `/api/admin/**` check on their own):
 * - First render: `serverSeed` = `isRouteAdmin()` computed in this RSC request (no storage, no TTL).
 *   Without a seed (e.g. settings section) the row starts hidden.
 * - Every mount, auth change and return-to-visible re-verifies with access-check:
 *   admin → show, not_admin → hide immediately, unknown → keep the current state (never upgrades to shown).
 * - A seed for a different account than the current session is ignored (hidden until verified).
 */
export function MyPageAdminMenuEntry({
  /** 홈 대시보드 `<ul>` 안에서만 `true` — 유효한 마크업(`<li>`) */
  asListItem = false,
  /** @deprecated `asListItem` 사용 */
  wrapInStandaloneCard = false,
  /** 내정보 홈 스타벅스 카드 행 */
  starbucks = false,
  serverSeed = null,
}: {
  asListItem?: boolean;
  wrapInStandaloneCard?: boolean;
  starbucks?: boolean;
  serverSeed?: MypageAdminMenuSeed | null;
} = {}) {
  const { t } = useI18n();
  const [show, setShow] = useState<boolean>(() => seedShowsAdminForViewer(serverSeed, currentViewerId()));

  useEffect(() => {
    let disposed = false;
    let generation = 0;

    // Adopt this RSC seed once (per seed); a seed for another account is never shown.
    if (serverSeed) setShow(seedShowsAdminForViewer(serverSeed, currentViewerId()));

    const verify = async () => {
      const gen = ++generation;
      const viewerId = currentViewerId();
      const viewerKey = viewerId || serverSeed?.viewerId || "anonymous";
      let result = await fetchAdminAccess(viewerKey);
      if (result === "unknown" && !disposed && gen === generation) {
        result = await fetchAdminAccess(viewerKey);
      }
      if (disposed || gen !== generation) return;
      const viewerNow = currentViewerId();
      if (viewerId && viewerNow && viewerNow !== viewerId) return;
      if (result === "admin") setShow(true);
      else if (result === "not_admin") setShow(false);
    };

    void verify();

    const unsubscribeAuth = subscribeDibayAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setShow(false);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void verify();
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") void verify();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      unsubscribeAuth();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [serverSeed]);

  if (!show) return null;

  if (starbucks) {
    const card = (
      <section className={MYPAGE_HOME_CARD_CLASS}>
        <MyInfoMenuLinkRow first href="/admin" title={t("mypage_comp_admin_entry_title")} />
      </section>
    );
    if (asListItem) return <li className="list-none">{card}</li>;
    return card;
  }

  const row = (
    <MyPageMobileMenuRow
      href="/admin"
      title={t("mypage_comp_admin_entry_title")}
      surface={asListItem || wrapInStandaloneCard ? "card" : "grouped"}
    />
  );
  if (asListItem) {
    return <li className="list-none">{row}</li>;
  }
  return row;
}
