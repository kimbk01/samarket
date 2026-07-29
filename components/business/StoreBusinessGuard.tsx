"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { useEffect, useState } from "react";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import {
  fetchMeStoresListDeduped,
  invalidateMeStoresListDedupedCache,
  peekMeStoresListClientCache,
} from "@/lib/me/fetch-me-stores-deduped";
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
  const gate = getOwnerStoreGateState(stores);
  if (gate.kind === "approved") {
    return { kind: "ok" };
  }
  const firstStoreId = stores[0]?.id;
  return { kind: "blocked", state: gate, firstStoreId };
}

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
  const { t } = useI18n();
  const router = useRouter();
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
        />
      </>
    );
  }

  return <div className={OWNER_STORE_BUSINESS_GUARD_OK_SHELL_CLASS}>{children}</div>;
}
