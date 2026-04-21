"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { useEffect, useState } from "react";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";
import {
  fetchMeStoresListDeduped,
  invalidateMeStoresListDedupedCache,
} from "@/lib/me/fetch-me-stores-deduped";
import { StoreBusinessBlockedModal } from "@/components/business/StoreBusinessBlockedModal";

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

async function resolveStoreBusinessPhase(): Promise<ResolvedPhase> {
  try {
    const { status, json: raw } = await fetchMeStoresListDeduped();
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
  } catch {
    return { kind: "error", message: "network_error" };
  }
}

export function StoreBusinessGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void resolveStoreBusinessPhase().then((p) => {
      if (!cancelled) setPhase(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const retry = () => {
    invalidateMeStoresListDedupedCache();
    setPhase({ kind: "loading" });
    void resolveStoreBusinessPhase().then(setPhase);
  };

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
          <p className="sam-text-body text-sam-fg">로그인이 필요합니다.</p>
          <Link href="/mypage" className="mt-4 inline-block sam-text-body font-medium text-signature">
            내 정보로
          </Link>
        </div>
      </div>
    );
  }

  if (phase.kind === "config") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10">
        <div className="mx-auto max-w-md rounded-ui-rect bg-sam-surface p-6 text-center shadow-sm">
          <p className="sam-text-body text-sam-fg">매장 서비스 설정이 완료되지 않았습니다.</p>
          <Link href="/mypage" className="mt-4 inline-block sam-text-body font-medium text-signature">
            내 정보로
          </Link>
        </div>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="min-h-screen bg-sam-app px-4 py-10">
        <div className="mx-auto max-w-md rounded-ui-rect bg-sam-surface p-6 text-center shadow-sm">
          <p className="sam-text-body text-red-700">불러오지 못했습니다. ({phase.message})</p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-4 sam-text-body font-medium text-signature"
          >
            다시 시도
          </button>
          <div className="mt-4">
            <Link href="/mypage" className="sam-text-body text-sam-muted underline">
              내 정보로
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

  return <div className="min-h-screen">{children}</div>;
}
