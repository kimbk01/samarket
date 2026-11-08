"use client";

/**
 * 커뮤니티 Admin 화면 공용 조회 훅 — 목록·상세가 같은 4가지 화면 상태(로딩·빈·실패·권한 없음)를 쓰도록.
 * 쓰기는 각 화면이 `communitySheetFetch` 로 한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { isSuperAdminFromSnapshot } from "@/lib/admin-auth/admin-me-context";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import {
  communityAreaAllowed,
  type CommunityAdminArea,
} from "@/lib/admin/community-admin/community-admin-permissions";

export type CommunityAdminLoad<T> =
  | { status: "loading"; data: T | null }
  | { status: "ok"; data: T }
  | { status: "error"; data: T | null; code: string; httpStatus: number };

/** GET JSON (`{ ok, ... }`). url = null 이면 요청하지 않는다. reload() 로 다시 불러온다. */
export function useCommunityAdminJson<T extends { ok?: boolean; error?: string }>(url: string | null) {
  const [state, setState] = useState<CommunityAdminLoad<T>>({ status: "loading", data: null });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!url) return;
    const my = ++seq.current;
    setState((s) => ({ status: "loading", data: s.data }));
    void (async () => {
      try {
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as T;
        if (my !== seq.current) return;
        if (!res.ok || json.ok === false) {
          // 실패해도 직전 정상 목록은 지우지 않는다 (지시서 §8-5) — 화면이 오류 안내와 함께 유지할지 정한다.
          setState((s) => ({ status: "error", data: s.data, code: json.error || `http_${res.status}`, httpStatus: res.status }));
          return;
        }
        setState({ status: "ok", data: json });
      } catch {
        if (my !== seq.current) return;
        setState((s) => ({ status: "error", data: s.data, code: "network_error", httpStatus: 0 }));
      }
    })();
  }, [url, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { state, reload };
}

/**
 * 보는 관리자의 커뮤니티 권한 영역 — 버튼 비활성·안내(「권한 필요: …」)용.
 * 권한 정보를 아직 못 읽었으면 허용으로 두고 서버 403 을 따른다.
 */
const COMMUNITY_ADMIN_AREA_LABEL_KEY: Record<CommunityAdminArea, MessageKey> = {
  content: "admin_community_area_content",
  moderation: "admin_community_area_moderation",
  promotion: "admin_community_area_promotion",
  points: "admin_community_area_points",
  read: "admin_community_area_read",
};

export function useCommunityAdminAccess() {
  const { t } = useI18n();
  // Admin 화면은 모두 AdminShellProvider 안에서 렌더된다 (AdminPlatformShell).
  const snapshot = useAdminShell().adminMe;
  const isSuperAdmin = isSuperAdminFromSnapshot(snapshot);
  const allowed = (area: CommunityAdminArea) =>
    !snapshot ? true : communityAreaAllowed(snapshot.permissions, area, isSuperAdmin);
  const deniedTitle = (area: CommunityAdminArea) =>
    allowed(area) ? undefined : t("admin_community_access_denied_title", { area: t(COMMUNITY_ADMIN_AREA_LABEL_KEY[area]) });
  return { isSuperAdmin, allowed, deniedTitle, known: Boolean(snapshot) };
}

/** 결과 배너 상태 (AdminResultBanner) */
export type CommunityBannerState = { ok: true; message: string } | { ok: false; code: string } | null;

/** 한국어 문장(기존 호출부 호환). 화면에서는 키 `admin_community_post_stale`·`admin_community_list_gone` 을 `t()` 로 쓴다. */
export const COMMUNITY_STALE_MESSAGE = translate("ko", "admin_community_post_stale");
export const COMMUNITY_GONE_MESSAGE = translate("ko", "admin_community_list_gone");

export function formatCommunityPoints(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${formatAdminNumber(n)} P`;
}

export function formatCommunityPeso(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return formatAdminPhp(n);
}
