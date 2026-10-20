"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getAppSettings } from "@/lib/app-settings";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";
import { MYPAGE_PROFILE_EDIT_SHEET_HREF } from "@/lib/mypage/mypage-profile-routes";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  buildMemberTrustSurface,
  type MemberTrustSurface,
} from "@/lib/trust/member-trust-surface";

type TrustApiRow = {
  trust_score?: number | null;
  manner_score?: number | null;
  temperature?: number | null;
};

type TrustSnapshot = {
  viewerId: string;
  surface: MemberTrustSurface;
  /** 스냅샷 없음(신규 회원) — API 가 trust_score 를 주지 않음 */
  isNewMember: boolean;
};

/** 재진입 시 즉시 표시 — 마지막 성공 값 메모리 보관 (S02 성능·캐시) */
let lastTrustSnapshot: TrustSnapshot | null = null;

/** 테스트 전용 */
export function __resetMypageTrustMemoryForTests(): void {
  lastTrustSnapshot = null;
}

function sessionHasTrustValue(): boolean {
  const u = getCurrentUser() ?? getHydrationSafeCurrentUser();
  return u?.trust_score != null || u?.temperature != null;
}

function surfaceFromSession(): MemberTrustSurface {
  const u = getCurrentUser() ?? getHydrationSafeCurrentUser();
  return buildMemberTrustSurface({
    trust_score: u?.trust_score,
    temperature: u?.temperature,
  });
}

function currentViewerId(): string {
  return (getCurrentUser() ?? getHydrationSafeCurrentUser())?.id ?? "";
}

function readMemory(): TrustSnapshot | null {
  const viewerId = currentViewerId();
  if (!lastTrustSnapshot || !viewerId || lastTrustSnapshot.viewerId !== viewerId) return null;
  return lastTrustSnapshot;
}

/**
 * 매너 배터리 (최종 설계 S02) — `buildMemberTrustSurface` 1개 SSOT, `%` 하나만.
 * 세션 값은 첫 그림용 — API 값 도착 후 덮어쓰고 세션이 다시 덮지 못함(Slice 4).
 * API 실패: 숫자 유지 + 한 줄 오류 + [다시 시도] (조용히 무시 금지).
 */
export function MypageTrustContent() {
  const { t } = useI18n();
  const [surface, setSurface] = useState<MemberTrustSurface | null>(() => {
    const mem = readMemory();
    if (mem) return mem.surface;
    return sessionHasTrustValue() ? surfaceFromSession() : null;
  });
  const [isNewMember, setIsNewMember] = useState(() => readMemory()?.isNewMember ?? false);
  const [loadFailed, setLoadFailed] = useState(false);
  const authorityFromApiRef = useRef(readMemory() != null);
  const loadGenRef = useRef(0);

  const loadFromApi = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setLoadFailed(false);
    try {
      // Slice 1/4: bypass route memory cache so Member matches Admin Facts.
      // 본문은 비행 안에서 1회만 파싱 — StrictMode 재마운트 등 같은 진입의 중복 호출을 1요청으로 합친다.
      const data = await runSingleFlight(`mypage:trust:profile-fresh:${currentViewerId()}`, async () => {
        const res = await fetch("/api/me/profile?fresh=1", { credentials: "include" });
        if (!res.ok) throw new Error(`trust_load_${res.status}`);
        return (await res.json()) as { profile?: TrustApiRow } & TrustApiRow;
      });
      const row = data.profile ?? data;
      if (gen !== loadGenRef.current) return;
      authorityFromApiRef.current = true;
      const next = buildMemberTrustSurface({
        trust_score: row.trust_score,
        manner_score: row.manner_score,
        temperature: row.temperature,
      });
      const newMember = row.trust_score == null && row.manner_score == null;
      setSurface(next);
      setIsNewMember(newMember);
      const viewerId = currentViewerId();
      if (viewerId) lastTrustSnapshot = { viewerId, surface: next, isNewMember: newMember };
    } catch {
      if (gen !== loadGenRef.current) return;
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    const syncFromSession = () => {
      // CONTRACT (Slice 4): session temperature must not clobber DB-backed API authority.
      if (authorityFromApiRef.current) return;
      if (sessionHasTrustValue()) setSurface(surfaceFromSession());
    };
    syncFromSession();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, syncFromSession);
    void loadFromApi();
    return () => {
      loadGenRef.current += 1;
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, syncFromSession);
    };
  }, [loadFromApi]);

  const batteryLabel = getAppSettings().speedDisplayLabel ?? t("mypage_trust_title");
  // CONTRACT (Slice 4): display from profiles.trust_score; home manner row uses same buildMemberTrustSurface.

  return (
    <MyScreen title={t("mypage_trust_title")} template="detail">
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-6 text-center">
        <p className="sam-text-body-secondary text-sam-muted">
          {batteryLabel} {t("mypage_trust_battery_label_suffix")}
        </p>
        {surface ? (
          <>
            <div className="mt-3 flex justify-center">
              <MannerBatteryIcon tier={surface.tier} percent={surface.percent} size="lg" />
            </div>
            {/* Single Member text SSOT = trust_score + `%` (no twin number). Battery icon is visual only. */}
            <p
              className={`mt-2 sam-text-hero font-bold tabular-nums ${surface.accentClass}`}
              data-testid="mypage-trust-score"
            >
              {surface.percentLabel}
            </p>
          </>
        ) : loadFailed ? null : (
          <div className="mt-3 flex flex-col items-center gap-3" aria-busy="true" data-testid="mypage-trust-skeleton">
            <span className="block h-12 w-12 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <span className="block h-7 w-20 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
          </div>
        )}
        {surface && isNewMember ? (
          <p className="mt-2 sam-text-body-secondary text-sam-muted" data-testid="mypage-trust-new-member">
            {t("mypage_s02_new_member")}
          </p>
        ) : null}
        {loadFailed ? (
          <div className="mt-3 flex flex-col items-center gap-2" role="alert" data-testid="mypage-trust-load-failed">
            <p className="sam-text-body-secondary text-sam-danger">{t("mypage_s02_load_failed")}</p>
            <button
              type="button"
              data-testid="mypage-trust-retry"
              onClick={() => void loadFromApi()}
              className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing}`}
            >
              {t("common_retry")}
            </button>
          </div>
        ) : null}
        <p className="mt-4 sam-text-body-secondary leading-relaxed text-sam-muted">
          {t("mypage_trust_battery_hint_before")}{" "}
          <strong className="text-sam-fg">{t("mypage_trust_battery_hint_days")}</strong>
          {t("mypage_trust_battery_hint_after")}
        </p>
      </div>
      <Link
        href={MYPAGE_PROFILE_EDIT_SHEET_HREF}
        className="mt-6 flex min-h-[44px] items-center justify-center text-center sam-text-body font-medium text-sam-primary underline-offset-2 hover:underline"
      >
        {t("mypage_trust_profile_edit_link")}
      </Link>
    </MyScreen>
  );
}
