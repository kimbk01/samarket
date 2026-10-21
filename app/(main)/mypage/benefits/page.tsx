"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberBenefitList } from "@/components/member-benefits/MemberBenefitList";
import type { MemberBenefitPolicy } from "@/lib/types/member-benefit";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { MYPAGE_BODY_COLUMN_CLASS, MYPAGE_SCROLL_BODY_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

const CARD_CLASS = "rounded-ui-rect border border-sam-border-soft bg-sam-surface sam-card-pad";

/** S47 스켈레톤 — 등급 카드 + 행 4 */
function BenefitsSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" data-testid="benefits-skeleton" className="flex flex-col gap-3">
      <div className={CARD_CLASS}>
        <span className={`block h-3.5 w-24 ${bone}`} />
        <span className={`mt-2 block h-6 w-20 ${bone}`} />
      </div>
      <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            data-skeleton-row=""
            className="flex min-h-[52px] items-center gap-3 border-t border-sam-border-soft px-4 first:border-t-0"
          >
            <span className="h-9 w-9 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <span className={`h-3.5 flex-1 ${bone}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

type BenefitsState =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "error" }
  | { kind: "ready"; memberType: string; policies: MemberBenefitPolicy[] };

type ReadyBenefits = Extract<BenefitsState, { kind: "ready" }>;

/** 재진입 캐시(Part A §1.7-4) — viewer 키 메모리 5분. 재진입은 즉시 그리고 30초가 지났으면 조용히 재검증 1회. */
const BENEFITS_CACHE_TTL_MS = 5 * 60_000;
const BENEFITS_REVALIDATE_AFTER_MS = 30_000;
let benefitsCache: { viewerId: string; value: ReadyBenefits; at: number } | null = null;

function readBenefitsCache(viewerId: string): { value: ReadyBenefits; at: number } | null {
  if (!viewerId || !benefitsCache || benefitsCache.viewerId !== viewerId) return null;
  if (Date.now() - benefitsCache.at > BENEFITS_CACHE_TTL_MS) return null;
  return benefitsCache;
}

type BenefitsFetch = { status: number; ok: boolean; json: { ok?: boolean; memberType?: string; policies?: MemberBenefitPolicy[] } };

export default function MypageBenefitsPage() {
  const { t } = useI18n();
  const [state, setState] = useState<BenefitsState>(() => {
    const hit = readBenefitsCache(getSyncViewerUserIdForClient() ?? "");
    return hit ? hit.value : { kind: "loading" };
  });

  /** D19 — 정책 SSOT(member_benefit_policies) 중 내 회원 구분에 적용되는 활성 정책만. 하드코딩 빈 배열 제거 */
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setState({ kind: "loading" });
    const viewerId = getSyncViewerUserIdForClient() ?? "";
    try {
      // 본문은 비행 안에서 1회만 파싱 — 합류한 호출이 같은 Response 를 다시 읽지 않게
      const { status, ok, json } = await runSingleFlight(
        `me:benefits:get:${viewerId}`,
        async (): Promise<BenefitsFetch> => {
          const res = await fetch("/api/me/benefits", { credentials: "include", cache: "no-store" });
          const body = (await res.json().catch(() => ({}))) as BenefitsFetch["json"];
          return { status: res.status, ok: res.ok, json: body };
        }
      );
      if (status === 401) {
        benefitsCache = null;
        setState({ kind: "guest" });
        return;
      }
      if (!ok || !json.ok) {
        // 조용한 재검증 실패는 기존 값 유지
        if (!opts?.silent) setState({ kind: "error" });
        return;
      }
      const next: ReadyBenefits = {
        kind: "ready",
        memberType: json.memberType ?? "normal",
        policies: Array.isArray(json.policies) ? json.policies : [],
      };
      if (viewerId) benefitsCache = { viewerId, value: next, at: Date.now() };
      setState(next);
    } catch {
      if (!opts?.silent) setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    const hit = readBenefitsCache(getSyncViewerUserIdForClient() ?? "");
    if (!hit) {
      void load();
      return;
    }
    if (Date.now() - hit.at > BENEFITS_REVALIDATE_AFTER_MS) void load({ silent: true });
  }, [load]);

  function memberTypeLabel(memberType: string): string {
    if (memberType === "admin") return t("benefits_role_admin");
    if (memberType === "premium") return t("benefits_role_premium");
    return t("benefits_role_general");
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("route_benefits_title")}
        subtitle={t("route_benefits_subtitle")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={MYPAGE_SCROLL_BODY_CLASS}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-col gap-3 py-4`}>
          {state.kind === "loading" ? (
            <BenefitsSkeleton />
          ) : (
            <>
              <div className={CARD_CLASS}>
                <p className="sam-text-body-secondary text-sam-muted">{t("benefits_member_tier_label")}</p>
                <div className="mt-1 flex items-center gap-2">
                  {state.kind === "guest" ? (
                    <span className="sam-text-body text-sam-muted">{t("benefits_login_prompt")}</span>
                  ) : state.kind === "error" ? (
                    <span className="sam-text-body text-sam-muted">—</span>
                  ) : (
                    <span className="rounded-full bg-sam-primary-soft px-2 py-1 sam-text-body font-medium text-sam-fg">
                      {memberTypeLabel(state.memberType)}
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft sam-card-pad sam-text-body-secondary text-sam-fg">
                {t("benefits_policy_notice")}
              </div>
              <div>
                <h2 className="mb-2 sam-text-section-title text-sam-fg">{t("benefits_applied_section")}</h2>
                {state.kind === "error" ? (
                  <MyStateView kind="error" error={{ message: t("benefits_load_failed"), onRetry: () => void load() }} />
                ) : (
                  <MemberBenefitList
                    policies={state.kind === "ready" ? state.policies : []}
                    emptyMessage={state.kind === "guest" ? t("benefits_login_prompt") : t("benefits_empty_list")}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
