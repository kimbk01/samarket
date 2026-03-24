"use client";

import Link from "next/link";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { useEffect, useState } from "react";
import { getOwnerStoreGateState } from "@/lib/stores/store-admin-access";

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
    const res = await fetch("/api/me/stores", { credentials: "include" });
    if (res.status === 401) {
      return { kind: "unauth" };
    }
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      stores?: MeStore[];
    };
    if (res.status === 503 && json?.error === "supabase_unconfigured") {
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
    setPhase({ kind: "loading" });
    void resolveStoreBusinessPhase().then(setPhase);
  };

  if (phase.kind === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className={`mx-auto max-w-md ${OWNER_STORE_STACK_Y_CLASS} rounded-xl bg-white p-6 shadow-sm`}>
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  if (phase.kind === "unauth") {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-[14px] text-gray-700">로그인이 필요합니다.</p>
          <Link href="/mypage" className="mt-4 inline-block text-[14px] font-medium text-signature">
            내 정보로
          </Link>
        </div>
      </div>
    );
  }

  if (phase.kind === "config") {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-[14px] text-gray-700">매장 서비스 설정이 완료되지 않았습니다.</p>
          <Link href="/mypage" className="mt-4 inline-block text-[14px] font-medium text-signature">
            내 정보로
          </Link>
        </div>
      </div>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl bg-white p-6 text-center shadow-sm">
          <p className="text-[14px] text-red-700">불러오지 못했습니다. ({phase.message})</p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-4 text-[14px] font-medium text-signature"
          >
            다시 시도
          </button>
          <div className="mt-4">
            <Link href="/mypage" className="text-[14px] text-gray-600 underline">
              내 정보로
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (phase.kind === "blocked") {
    const { state, firstStoreId } = phase;
    let title = "매장 관리";
    let body = "승인된 매장만 매장 어드민을 이용할 수 있습니다.";
    if (state.kind === "empty") {
      title = "매장이 없습니다";
      body = "먼저 매장 등록 신청을 해 주세요. 심사가 완료되면 여기서 주문·상품·정산을 관리할 수 있습니다.";
    } else if (state.kind === "pending") {
      const st = state.approval_status;
      if (st === "rejected") {
        title = "신청이 반려되었습니다";
        body = state.rejected_reason?.trim()
          ? state.rejected_reason
          : "자세한 사유는 운영 정책에 따라 별도 안내될 수 있습니다.";
      } else if (st === "revision_requested") {
        title = "보완이 필요합니다";
        body = state.revision_note?.trim()
          ? state.revision_note
          : "안내에 따라 정보를 수정한 뒤 다시 제출해 주세요.";
      } else {
        title = "심사 중입니다";
        body = "승인이 완료되면 매장 관리 화면이 열립니다. 잠시만 기다려 주세요.";
      }
    }

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10">
        <div className={`mx-auto max-w-md ${OWNER_STORE_STACK_Y_CLASS} rounded-xl bg-white p-6 shadow-sm`}>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-[14px] leading-relaxed text-gray-600">{body}</p>
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/mypage"
              className="rounded-lg bg-gray-900 py-3 text-center text-[14px] font-medium text-white"
            >
              내 정보로
            </Link>
            {firstStoreId &&
            state.kind === "pending" &&
            state.approval_status !== "rejected" &&
            state.approval_status !== "suspended" ? (
              <Link
                href={`/my/business/profile?storeId=${encodeURIComponent(firstStoreId)}`}
                className="rounded-lg border border-signature/40 bg-signature/5 py-3 text-center text-[14px] font-medium text-signature"
              >
                매장 설정 (공개 페이지 미리보기용)
              </Link>
            ) : null}
            {state.kind === "empty" || (state.kind === "pending" && state.approval_status === "rejected") ? (
              <Link
                href="/my/business/apply"
                className="rounded-lg border border-gray-200 py-3 text-center text-[14px] font-medium text-gray-800"
              >
                매장 등록 신청
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return <div className="min-h-screen bg-gray-50 pb-4">{children}</div>;
}
