"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { OWNER_ROUTES_BASE } from "@/lib/business/owner-routes";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { useEffect, useState } from "react";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import {
  fetchMeStoresListDeduped,
  invalidateMeStoresListDedupedCache,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import { StoreBusinessBlockedModal } from "@/components/business/StoreBusinessBlockedModal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS } from "@/lib/business/owner-store-business-guard-layout";

type MeStore = {
  id: string;
  approval_status: string;
  rejected_reason?: string | null;
  revision_note?: string | null;
};

type ResolvedPhase =
  | { kind: "unauth" }
  | { kind: "config" }
  | { kind: "error"; message: string }
  | {
      kind: "blocked";
      state: ReturnType<typeof getOwnerStoreGateState>;
      /** 승인 전에도 프로필 폼으로 이동할 수 있도록 */
      firstStoreId?: string;
    }
  | { kind: "ok" };

type Phase = { kind: "loading" } | ResolvedPhase;

function resolvedPhaseFromStoresApi(status: number, raw: unknown): ResolvedPhase {
  const json = raw as {
    ok?: boolean;
    error?: string;
    stores?: MeStore[];
  };
  if (status === 401) {
    return { kind: "unauth" };
  }
  if (status === 503 && json?.error === "supabase_unconfigured") {
    return { kind: "config" };
  }
  if (!json?.ok) {
    return {
      kind: "error",
      message: typeof json?.error === "string" ? json.error : "load_failed",
    };
  }
  const stores = (json.stores ?? []) as MeStore[];
  // IA-02 — 계정의 아무 승인 매장이 아니라 지금 선택된 매장(`?storeId` → 세션 선호 → 첫 매장) 상태로 판정한다.
  const activeId = resolveOwnerActiveStoreIdFromOwnedList(stores, currentRouteStoreId());
  const active = activeId ? stores.find((s) => s.id === activeId) : undefined;
  const gate = getOwnerStoreGateState(active ? [active] : []);
  if (gate.kind === "approved") {
    return { kind: "ok" };
  }
  return { kind: "blocked", state: gate, firstStoreId: active?.id };
}

function currentRouteStoreId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("storeId")?.trim() || null;
}

/** 심사 중·보완 요청 매장 — 신청·프로필·기본 정보(온보딩) 화면은 열어 준다 (IA-01, store-business-hub-nav-intercept 와 동일 규칙). */
const ONBOARDING_APPROVAL_STATUSES = new Set(["pending", "under_review", "revision_requested"]);

function resolvedPhaseFromPeek(): ResolvedPhase | null {
  const peek = peekMeStoresListClientCache();
  if (!peek) return null;
  try {
    return resolvedPhaseFromStoresApi(peek.status, peek.json);
  } catch {
    return null;
  }
}

async function resolveStoreBusinessPhase(): Promise<ResolvedPhase> {
  try {
    const { status, json: raw } = await fetchMeStoresListDeduped();
    return resolvedPhaseFromStoresApi(status, raw);
  } catch {
    return { kind: "error", message: "network_error" };
  }
}

export function StoreBusinessGuard({
  children,
  enforce = true,
}: {
  children: React.ReactNode;
  /**
   * Owner hub (`/stores/owner`) must stay ungated so pending stores still render.
   * Keep this component mounted with `enforce={false}` so hub↔stack navigation does not
   * remount Guard/Shell and flash pulse / re-hit `/api/me/stores`.
   */
  enforce?: boolean;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [phase, setPhase] = useState<Phase>(() => resolvedPhaseFromPeek() ?? { kind: "loading" });

  useEffect(() => {
    if (!enforce) return;
    if (phase.kind !== "loading") return;
    const fromPeek = resolvedPhaseFromPeek();
    if (fromPeek) {
      setPhase(fromPeek);
      return;
    }
    let cancelled = false;
    void resolveStoreBusinessPhase().then((p) => {
      if (!cancelled) setPhase(p);
    });
    return () => {
      cancelled = true;
    };
  }, [phase.kind, enforce]);

  // 같은 셸 트리가 화면 이동 간 유지되므로(Phase 5) 경로가 바뀌면 선택 매장 기준으로 다시 판정한다.
  useEffect(() => {
    if (!enforce) return;
    const fromPeek = resolvedPhaseFromPeek();
    if (fromPeek) setPhase(fromPeek);
  }, [pathname, enforce]);

  const retry = () => {
    invalidateMeStoresListDedupedCache();
    setPhase({ kind: "loading" });
  };

  if (!enforce) {
    return <>{children}</>;
  }

  if (phase.kind === "loading") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10">
        <div className={`mx-auto max-w-md ${OWNER_STORE_STACK_Y_CLASS} rounded-ui-rect bg-sam-surface p-6 shadow-sm`}>
          <div className="h-4 w-3/4 animate-pulse rounded bg-sam-border-soft" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-sam-border-soft" />
        </div>
      </div>
    );
  }

  if (phase.kind === "unauth") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10">
        <div className="mx-auto max-w-md rounded-ui-rect bg-sam-surface p-6 text-center shadow-sm">
          <p className="sam-text-body text-sam-fg">{t("common_login_required")}</p>
          <Link href="/mypage" className="mt-4 inline-block sam-text-body font-medium text-signature">
            {t("business_phase7_618")}
          </Link>
        </div>
      </div>
    );
  }

  if (phase.kind === "config") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10">
        <div className="mx-auto max-w-md rounded-ui-rect bg-sam-surface p-6 text-center shadow-sm">
          <p className="sam-text-body text-sam-fg">{t("business_phase7_069")}</p>
          <Link href="/mypage" className="mt-4 inline-block sam-text-body font-medium text-signature">
            {t("business_phase7_618")}
          </Link>
        </div>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10">
        <div className="mx-auto max-w-md rounded-ui-rect bg-sam-surface p-6 text-center shadow-sm">
          <p className="sam-text-body text-red-700">{t("business_phase7_131", { v1: phase.message })}</p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-4 sam-text-body font-medium text-signature"
          >
            {t("business_phase7_466")}
          </button>
          <div className="mt-4">
            <Link href="/mypage" className="sam-text-body text-sam-muted underline">
              {t("business_phase7_618")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 운영 중지 매장 — 진행 중 주문은 끝까지 처리할 수 있도록 주문·주문 채팅 화면만 허용 (DEF-71, Owner 승인).
  // 새 주문은 매장 비노출 + 결제 차단으로 들어오지 않는다.
  if (
    phase.kind === "blocked" &&
    phase.state.kind === "pending" &&
    phase.state.approval_status === "suspended" &&
    isSuspendedStoreAllowedOwnerPath(pathname)
  ) {
    const ko = language !== "en";
    return (
      <div className={OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS}>
        <div
          role="status"
          data-owner-store-suspended-orders-only="1"
          className="mx-4 mt-3 rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-950"
        >
          {ko
            ? "매장 운영이 중지되어 새 주문은 받지 않습니다. 진행 중인 주문만 처리할 수 있습니다."
            : "Your store is suspended and won't receive new orders. You can still finish orders in progress."}
        </div>
        {children}
      </div>
    );
  }

  if (
    phase.kind === "blocked" &&
    phase.state.kind === "pending" &&
    ONBOARDING_APPROVAL_STATUSES.has(phase.state.approval_status) &&
    !shouldInterceptBusinessHubHref(pathname)
  ) {
    const ko = language !== "en";
    return (
      <div className={OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS}>
        <div
          role="status"
          data-owner-store-onboarding-edit="1"
          className="mx-4 mt-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[13px] text-sam-fg"
        >
          {ko
            ? "매장 심사가 진행 중입니다. 승인 전에는 매장 정보만 수정할 수 있습니다."
            : "Your store is under review. Until approval you can only edit store information."}
        </div>
        {children}
      </div>
    );
  }

  if (phase.kind === "blocked") {
    const { state, firstStoreId } = phase;
    return (
      <>
        <div className="min-h-[100dvh] bg-background" aria-hidden />
        <StoreBusinessBlockedModal
          open
          state={state}
          firstStoreId={firstStoreId}
          onClose={() => router.push("/mypage")}
          onLinkClick={() => {}}
        />
      </>
    );
  }

  return <div className={OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS}>{children}</div>;
}

function isSuspendedStoreAllowedOwnerPath(pathname: string): boolean {
  return (
    pathname === `${OWNER_ROUTES_BASE}/orders` ||
    pathname.startsWith(`${OWNER_ROUTES_BASE}/orders/`) ||
    pathname === `${OWNER_ROUTES_BASE}/order-chats` ||
    pathname.startsWith(`${OWNER_ROUTES_BASE}/order-chats/`) ||
    pathname === `${OWNER_ROUTES_BASE}/order-chat` ||
    pathname.startsWith(`${OWNER_ROUTES_BASE}/order-chat/`)
  );
}
