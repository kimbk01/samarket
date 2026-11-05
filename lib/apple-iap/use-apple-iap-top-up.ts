"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  appleIapPhaseBlocksNewPurchase,
  appleIapPhaseFromPrepareError,
  type AppleIapAttemptView,
  type AppleIapKind,
  type AppleIapProductView,
  type AppleIapUiPhase,
} from "@/lib/apple-iap/apple-iap-contract";
import {
  isAppleIapNativeAvailable,
  storeKitFinishTransaction,
  storeKitGetProducts,
  storeKitGetUnfinishedTransactions,
  storeKitPurchase,
} from "@/lib/apple-iap/native-storekit-bridge";
import { newOwnerFormRequestKey } from "@/lib/business/owner-form-request-key";

type VerifyResponse = {
  ok?: boolean;
  error?: string;
  phase?: AppleIapUiPhase;
  finish?: boolean;
  attempt?: AppleIapAttemptView | null;
};

type StatusResponse = {
  ok?: boolean;
  configured?: boolean;
  products?: AppleIapProductView[];
  attention?: AppleIapAttemptView[];
  attempt?: AppleIapAttemptView | null;
};

export type AppleIapTopUpState = {
  /** iOS 앱에 StoreKit 플러그인이 있음 — 이때만 Apple 결제 화면으로 바꾼다 */
  available: boolean;
  loading: boolean;
  products: AppleIapProductView[];
  /** StoreKit 현지 통화 가격 */
  prices: Record<string, string>;
  phase: AppleIapUiPhase;
  attempt: AppleIapAttemptView | null;
  /** 준비 단계 서버 오류 코드 (한도 등) */
  errorCode: string | null;
  /** 검증 재시도 후에도 지급 확인이 안 됨 */
  delayed: boolean;
  busy: boolean;
};

const VERIFY_RETRY_DELAYS_MS = [0, 1500, 4000] as const;

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Apple 결제 흐름 — 준비(서버) → StoreKit 결제 → 서명 거래 서버 검증 → 서버가 지급 완료를 돌려줄 때만 완료.
 * 지급 완료·검토 기록 전에는 Apple 거래를 닫지 않는다 (앱 재실행 때 다시 받아 재처리).
 */
export function useAppleIapTopUp({
  kind,
  storeId,
  onCredited,
}: {
  kind: AppleIapKind;
  storeId?: string | null;
  onCredited?: (attempt: AppleIapAttemptView | null) => void | Promise<void>;
}) {
  const [state, setState] = useState<AppleIapTopUpState>({
    available: false,
    loading: false,
    products: [],
    prices: {},
    phase: "idle",
    attempt: null,
    errorCode: null,
    delayed: false,
    busy: false,
  });
  const busyRef = useRef(false);
  const stateRef = useRef(state);
  const onCreditedRef = useRef(onCredited);
  useEffect(() => {
    stateRef.current = state;
    onCreditedRef.current = onCredited;
  }, [state, onCredited]);

  const patch = useCallback((p: Partial<AppleIapTopUpState>) => setState((s) => ({ ...s, ...p })), []);

  const statusUrl = useCallback(
    (attemptId?: string) => {
      const qs = new URLSearchParams({ kind });
      if (kind === "cash" && storeId) qs.set("storeId", storeId);
      if (attemptId) qs.set("attemptId", attemptId);
      return `/api/me/apple-iap/status?${qs.toString()}`;
    },
    [kind, storeId]
  );

  /** 서버 검증 제출 — 지급 완료·검토 기록이면 Apple 거래를 닫는다 */
  const submitSignedTransaction = useCallback(
    async (transactionId: string, signedTransaction: string): Promise<VerifyResponse | null> => {
      let last: VerifyResponse | null = null;
      for (const wait of VERIFY_RETRY_DELAYS_MS) {
        if (wait) await sleep(wait);
        try {
          const { status, json } = await postJson<VerifyResponse>("/api/me/apple-iap/verify", { signedTransaction });
          last = json;
          const recorded = json.ok === true && (json.phase === "credited" || json.phase === "review" || json.phase === "refund_review");
          if (recorded || (status === 403 && json.finish === true)) {
            await storeKitFinishTransaction(transactionId).catch(() => undefined);
            return json;
          }
          if (status < 500 && json.ok !== true) return json;
          if (json.ok === true) return json;
        } catch {
          last = null;
        }
      }
      return last;
    },
    []
  );

  const applyVerifyResult = useCallback(
    async (r: VerifyResponse | null) => {
      if (r?.ok === true && r.attempt && r.attempt.kind !== kind) return;
      if (r?.ok === true && r.phase === "credited") {
        patch({ phase: "credited", attempt: r.attempt ?? null, delayed: false });
        await onCreditedRef.current?.(r.attempt ?? null);
        return;
      }
      if (r?.ok === true && r.phase) {
        patch({ phase: r.phase, attempt: r.attempt ?? null, delayed: r.phase === "verifying" });
        return;
      }
      patch({ phase: r?.error === "attempt_not_owned" ? "review" : "verifying", delayed: true });
    },
    [kind, patch]
  );

  /** 닫히지 않은 Apple 거래 재제출 (결제 후 지급 지연·앱 종료 복구) */
  const recoverUnfinished = useCallback(async () => {
    let txs: Awaited<ReturnType<typeof storeKitGetUnfinishedTransactions>> = [];
    try {
      txs = await storeKitGetUnfinishedTransactions();
    } catch {
      return;
    }
    for (const tx of txs) {
      const r = await submitSignedTransaction(tx.transactionId, tx.signedTransaction);
      await applyVerifyResult(r);
    }
  }, [applyVerifyResult, submitSignedTransaction]);

  const refresh = useCallback(
    async (attemptId?: string) => {
      try {
        const res = await fetch(statusUrl(attemptId), { credentials: "include" });
        const j = (await res.json().catch(() => ({}))) as StatusResponse;
        if (!res.ok || j.ok !== true) return;
        const products = j.products ?? [];
        const s = stateRef.current;
        const focus = j.attempt ?? (s.attempt ? null : (j.attention ?? [])[0] ?? null);
        const inFlight = appleIapPhaseBlocksNewPurchase(s.phase) && s.phase !== "verifying";
        const apply = focus && !inFlight && focus.kind === kind;
        patch({
          products,
          ...(apply ? { attempt: focus, phase: focus.phase, delayed: focus.phase === "verifying" } : {}),
        });
        if (apply && focus.phase === "credited" && s.phase === "verifying") {
          await onCreditedRef.current?.(focus);
        }
        if (products.length) {
          const listed = await storeKitGetProducts(products.map((p) => p.productId)).catch(() => []);
          patch({ prices: Object.fromEntries(listed.map((p) => [p.productId, p.displayPrice])) });
        }
      } catch {
        /* 다음 재확인에서 다시 */
      }
    },
    [kind, patch, statusUrl]
  );

  useEffect(() => {
    if (!isAppleIapNativeAvailable()) return;
    if (kind === "cash" && !storeId) return;
    let cancelled = false;
    void (async () => {
      patch({ available: true, loading: true });
      await recoverUnfinished();
      if (cancelled) return;
      await refresh();
      if (!cancelled) patch({ loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, storeId, patch, recoverUnfinished, refresh]);

  const purchase = useCallback(
    async (productId: string) => {
      if (busyRef.current || !productId) return;
      busyRef.current = true;
      patch({ busy: true, phase: "preparing", errorCode: null, delayed: false, attempt: null });
      try {
        const { json: prep } = await postJson<{ ok?: boolean; error?: string; attemptId?: string | null }>(
          "/api/me/apple-iap/prepare",
          { kind, productId, storeId: kind === "cash" ? storeId : null, clientKey: newOwnerFormRequestKey("apple_iap") }
        );
        if (prep.ok !== true || !prep.attemptId) {
          const code = String(prep.error ?? "prepare_failed");
          patch({ phase: appleIapPhaseFromPrepareError(code), errorCode: code });
          if (code === "apple_credit_pending") await refresh(prep.attemptId ?? undefined);
          return;
        }
        const attemptId = prep.attemptId;
        patch({ phase: "purchasing" });

        let result: Awaited<ReturnType<typeof storeKitPurchase>>;
        try {
          result = await storeKitPurchase(productId, attemptId);
        } catch {
          await postJson("/api/me/apple-iap/outcome", { attemptId, outcome: "failed" }).catch(() => undefined);
          patch({ phase: "failed" });
          return;
        }
        if (result.result === "userCancelled") {
          await postJson("/api/me/apple-iap/outcome", { attemptId, outcome: "user_cancelled" }).catch(() => undefined);
          patch({ phase: "cancelled" });
          return;
        }
        if (result.result === "pending") {
          await postJson("/api/me/apple-iap/outcome", { attemptId, outcome: "deferred" }).catch(() => undefined);
          patch({ phase: "awaiting_approval" });
          return;
        }
        patch({ phase: "verifying" });
        const verified = await submitSignedTransaction(result.transactionId, result.signedTransaction);
        await applyVerifyResult(verified);
      } catch {
        patch({ phase: "failed" });
      } finally {
        busyRef.current = false;
        patch({ busy: false });
      }
    },
    [applyVerifyResult, kind, patch, refresh, storeId, submitSignedTransaction]
  );

  const recheck = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    patch({ busy: true });
    try {
      await recoverUnfinished();
      await refresh(state.attempt?.attemptId);
    } finally {
      busyRef.current = false;
      patch({ busy: false });
    }
  }, [patch, recoverUnfinished, refresh, state.attempt?.attemptId]);

  const dismiss = useCallback(() => patch({ phase: "idle", attempt: null, errorCode: null, delayed: false }), [patch]);

  return { ...state, purchase, recheck, dismiss };
}
