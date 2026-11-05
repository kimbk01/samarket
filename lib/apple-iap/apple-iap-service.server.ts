import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appleIapIsUuid,
  appleIapPhaseFromServer,
  parseAppleIapAttemptStatus,
  parseAppleIapRefundStatus,
  type AppleIapAttemptView,
  type AppleIapKind,
  type AppleIapProductView,
  type AppleIapUiPhase,
} from "@/lib/apple-iap/apple-iap-contract";
import type { AppleIapServerConfig } from "@/lib/apple-iap/apple-iap-config.server";
import {
  AppleSignedDataError,
  verifyAppleSignedData,
  type AppleSignedDataVerifyOptions,
} from "@/lib/apple-iap/apple-signed-data-verify.server";

type RpcResult = Record<string, unknown> & { ok?: boolean; error?: string };

export const APPLE_IAP_ATTEMPT_SELECT =
  "id, kind, user_id, store_id, product_id, status, refund_status, point_amount, cash_amount_minor, transaction_id, reserve_expires_at, created_at, credited_at";

async function callRpc(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}:${error.message}`);
  return (data ?? {}) as RpcResult;
}

function msToIso(raw: unknown): string | null {
  return typeof raw === "number" && Number.isFinite(raw) ? new Date(raw).toISOString() : null;
}

function str(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s ? s : null;
}

export function toAppleIapAttemptView(row: Record<string, unknown>): AppleIapAttemptView | null {
  const status = parseAppleIapAttemptStatus(row.status);
  const kind = row.kind === "point" || row.kind === "cash" ? row.kind : null;
  if (!status || !kind) return null;
  const refundStatus = parseAppleIapRefundStatus(row.refund_status);
  return {
    attemptId: String(row.id),
    kind,
    productId: String(row.product_id ?? ""),
    status,
    refundStatus,
    phase: appleIapPhaseFromServer(status, refundStatus),
    pointAmount: typeof row.point_amount === "number" ? row.point_amount : null,
    cashAmountMinor: row.cash_amount_minor == null ? null : Number(row.cash_amount_minor),
    transactionId: str(row.transaction_id),
    createdAt: String(row.created_at ?? ""),
    creditedAt: str(row.credited_at),
  };
}

/* ─── 서명 거래 해석 ─────────────────────────────────────────────────────── */

export type AppleVerifiedTransaction = {
  transactionId: string;
  originalTransactionId: string | null;
  productId: string;
  bundleId: string;
  environment: "Production" | "Sandbox";
  appAccountToken: string | null;
  purchaseDate: string | null;
  priceMilli: number | null;
  currency: string | null;
  storefront: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  signedTransaction: string;
};

export type AppleTransactionParseError =
  | `signature_${AppleSignedDataError["code"]}`
  | "bundle_mismatch"
  | "environment_not_allowed"
  | "not_consumable"
  | "transaction_invalid";

export function parseAppleSignedTransaction(
  signedTransaction: string,
  config: AppleIapServerConfig,
  verifyOptions?: AppleSignedDataVerifyOptions
): { ok: true; tx: AppleVerifiedTransaction } | { ok: false; error: AppleTransactionParseError } {
  let payload: Record<string, unknown>;
  try {
    payload = verifyAppleSignedData(signedTransaction, verifyOptions);
  } catch (e) {
    if (e instanceof AppleSignedDataError) return { ok: false, error: `signature_${e.code}` };
    throw e;
  }
  const transactionId = str(payload.transactionId);
  const productId = str(payload.productId);
  const bundleId = str(payload.bundleId);
  if (!transactionId || !productId || !bundleId) return { ok: false, error: "transaction_invalid" };
  if (bundleId !== config.bundleId) return { ok: false, error: "bundle_mismatch" };
  const environment = payload.environment;
  if (environment !== "Production" && !(environment === "Sandbox" && config.allowSandbox)) {
    return { ok: false, error: "environment_not_allowed" };
  }
  if (payload.type !== "Consumable") return { ok: false, error: "not_consumable" };
  const token = str(payload.appAccountToken);
  return {
    ok: true,
    tx: {
      transactionId,
      originalTransactionId: str(payload.originalTransactionId),
      productId,
      bundleId,
      environment,
      appAccountToken: token && appleIapIsUuid(token) ? token.toLowerCase() : null,
      purchaseDate: msToIso(payload.purchaseDate),
      priceMilli: typeof payload.price === "number" ? Math.trunc(payload.price) : null,
      currency: str(payload.currency),
      storefront: str(payload.storefront),
      revokedAt: msToIso(payload.revocationDate),
      revocationReason: payload.revocationReason == null ? null : String(payload.revocationReason),
      signedTransaction,
    },
  };
}

/* ─── 준비 · 결과 ─────────────────────────────────────────────────────────── */

export async function prepareAppleIapAttempt(
  sb: SupabaseClient,
  input: { userId: string; kind: AppleIapKind; productId: string; storeId: string | null; clientKey: string }
): Promise<RpcResult> {
  return callRpc(sb, "apple_iap_prepare", {
    p_user_id: input.userId,
    p_kind: input.kind,
    p_product_id: input.productId,
    p_store_id: input.storeId,
    p_client_key: input.clientKey,
  });
}

export async function markAppleIapOutcome(
  sb: SupabaseClient,
  input: { attemptId: string; userId: string; outcome: "user_cancelled" | "failed" | "deferred" }
): Promise<RpcResult> {
  return callRpc(sb, "apple_iap_mark_outcome", {
    p_attempt_id: input.attemptId,
    p_user_id: input.userId,
    p_outcome: input.outcome,
  });
}

/* ─── 검증 거래 기록 + 자동 지급 ──────────────────────────────────────────── */

export type AppleDeliverResult =
  | {
      ok: true;
      attemptId: string;
      phase: AppleIapUiPhase;
      duplicate: boolean;
      /** 지급 RPC 가 거부한 이유 (기록은 남음 — 재처리 대상) */
      creditError: string | null;
      ownerUserId: string | null;
      attempt: AppleIapAttemptView | null;
    }
  | { ok: false; error: string; transactionId: string | null };

async function loadAttemptRow(sb: SupabaseClient, attemptId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb
    .from("apple_iap_transactions")
    .select(APPLE_IAP_ATTEMPT_SELECT)
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(`apple_iap_transactions:${error.message}`);
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * 검증 거래 기록(거래번호 1회) → received 면 지급 1회.
 * 이미 기록된 거래가 received 로 남아 있으면 지급을 다시 시도한다 (결제 후 지급 지연 재처리).
 */
export async function recordAndCreditAppleTransaction(
  sb: SupabaseClient,
  tx: AppleVerifiedTransaction,
  via: "app" | "notification" | "admin"
): Promise<AppleDeliverResult> {
  const recorded = await callRpc(sb, "apple_iap_record_verified_transaction", {
    p_attempt_id: tx.appAccountToken,
    p_transaction_id: tx.transactionId,
    p_original_transaction_id: tx.originalTransactionId,
    p_product_id: tx.productId,
    p_bundle_id: tx.bundleId,
    p_environment: tx.environment,
    p_purchase_date: tx.purchaseDate,
    p_price_milli: tx.priceMilli,
    p_currency: tx.currency,
    p_storefront: tx.storefront,
    p_revoked_at: tx.revokedAt,
    p_signed_transaction: tx.signedTransaction,
    p_via: via,
  });
  if (recorded.ok !== true) {
    return { ok: false, error: String(recorded.error ?? "record_failed"), transactionId: tx.transactionId };
  }
  const attemptId = String(recorded.attempt_id);
  let creditError: string | null = null;
  if (recorded.status === "received") {
    const credit = await callRpc(sb, "apple_iap_credit", { p_attempt_id: attemptId, p_admin_user_id: null });
    if (credit.ok !== true) creditError = String(credit.error ?? "credit_failed");
  }
  const row = await loadAttemptRow(sb, attemptId);
  const view = row ? toAppleIapAttemptView(row) : null;
  return {
    ok: true,
    attemptId,
    phase: view?.phase ?? "verifying",
    duplicate: recorded.duplicate === true,
    creditError,
    ownerUserId: row ? str(row.user_id) : null,
    attempt: view,
  };
}

/* ─── 화면 조회 ───────────────────────────────────────────────────────────── */

export async function listActiveAppleIapProducts(
  sb: SupabaseClient,
  kind: AppleIapKind
): Promise<AppleIapProductView[]> {
  const { data, error } = await sb
    .from("apple_iap_products")
    .select("product_id, kind, point_plan_id, cash_amount_minor, sort_order, point_plans(point_amount, bonus_amount, payment_amount, is_active)")
    .eq("kind", kind)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`apple_iap_products:${error.message}`);
  const out: AppleIapProductView[] = [];
  for (const raw of (data ?? []) as Record<string, unknown>[]) {
    const planRel = raw.point_plans;
    const plan = (Array.isArray(planRel) ? planRel[0] : planRel) as Record<string, unknown> | null | undefined;
    if (kind === "point" && (!plan || plan.is_active !== true)) continue;
    const points = plan
      ? Math.max(0, Number(plan.point_amount ?? 0)) + Math.max(0, Number(plan.bonus_amount ?? 0))
      : null;
    out.push({
      productId: String(raw.product_id),
      kind,
      pointPlanId: str(raw.point_plan_id),
      pointAmount: points,
      paymentAmount: plan ? Number(plan.payment_amount ?? 0) : null,
      cashAmountMinor: raw.cash_amount_minor == null ? null : Number(raw.cash_amount_minor),
      sortOrder: Number(raw.sort_order ?? 0),
    });
  }
  return out;
}

/** 사용자에게 계속 보여야 하는 Apple 거래 (승인 대기·지급 확인 중·검토·환불 검토) — 최근 30일 */
export async function listAppleIapAttentionAttempts(
  sb: SupabaseClient,
  input: { userId: string; kind: AppleIapKind; storeId: string | null }
): Promise<AppleIapAttemptView[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let q = sb
    .from("apple_iap_transactions")
    .select(APPLE_IAP_ATTEMPT_SELECT)
    .eq("user_id", input.userId)
    .eq("kind", input.kind)
    .gte("created_at", since)
    .or("status.in.(deferred,received,review),refund_status.in.(review,reversed_review)")
    .order("created_at", { ascending: false })
    .limit(5);
  if (input.kind === "cash" && input.storeId) q = q.eq("store_id", input.storeId);
  const { data, error } = await q;
  if (error) throw new Error(`apple_iap_transactions:${error.message}`);
  const now = Date.now();
  return ((data ?? []) as Record<string, unknown>[])
    .filter((row) => row.status !== "deferred" || Date.parse(String(row.reserve_expires_at ?? "")) > now)
    .map(toAppleIapAttemptView)
    .filter((v): v is AppleIapAttemptView => v != null);
}

export async function loadAppleIapAttemptForUser(
  sb: SupabaseClient,
  attemptId: string,
  userId: string
): Promise<AppleIapAttemptView | null> {
  const row = await loadAttemptRow(sb, attemptId);
  if (!row || row.user_id !== userId) return null;
  return toAppleIapAttemptView(row);
}

/* ─── App Store Server Notifications V2 ──────────────────────────────────── */

export type AppleNotificationOutcome = {
  /** 200 = 처리 완료(무시 포함) · 400 = 서명·형식 오류 · 500 = 일시 오류 (Apple 재전송) */
  httpStatus: 200 | 400 | 500;
  result: string;
};

const REFUND_TYPES = new Set(["REFUND", "REFUND_REVERSED", "REFUND_DECLINED"]);

export async function processAppleServerNotification(
  sb: SupabaseClient,
  signedPayload: string,
  config: AppleIapServerConfig,
  verifyOptions?: AppleSignedDataVerifyOptions
): Promise<AppleNotificationOutcome> {
  let payload: Record<string, unknown>;
  try {
    payload = verifyAppleSignedData(signedPayload, verifyOptions);
  } catch (e) {
    if (e instanceof AppleSignedDataError) return { httpStatus: 400, result: `signature_${e.code}` };
    throw e;
  }
  const uuid = str(payload.notificationUUID);
  const type = str(payload.notificationType);
  if (!uuid || !type) return { httpStatus: 400, result: "malformed" };
  const subtype = str(payload.subtype);
  const signedDate = msToIso(payload.signedDate);
  const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
  const environment = str(data.environment);

  const log = async (result: string, transactionId: string | null): Promise<AppleNotificationOutcome> => {
    await callRpc(sb, "apple_iap_log_notification", {
      p_notification_uuid: uuid,
      p_type: type,
      p_subtype: subtype,
      p_environment: environment === "Production" || environment === "Sandbox" ? environment : null,
      p_transaction_id: transactionId,
      p_signed_date: signedDate,
      p_result: result,
    });
    return { httpStatus: 200, result };
  };

  if (str(data.bundleId) !== config.bundleId) return log("ignored_bundle", null);
  if (environment !== "Production" && !(environment === "Sandbox" && config.allowSandbox)) {
    return log("ignored_environment", null);
  }

  const signedTx = str(data.signedTransactionInfo);
  if (type !== "ONE_TIME_CHARGE" && !REFUND_TYPES.has(type)) return log("ignored_type", null);
  if (!signedTx) return log("missing_transaction", null);

  const parsed = parseAppleSignedTransaction(signedTx, config, verifyOptions);
  if (!parsed.ok) return log(`transaction_${parsed.error}`, null);
  const tx = parsed.tx;

  if (type === "ONE_TIME_CHARGE") {
    const delivered = await recordAndCreditAppleTransaction(sb, tx, "notification");
    if (!delivered.ok) return log(`charge_${delivered.error}`, tx.transactionId);
    return log(
      delivered.creditError ? `charge_recorded_credit_${delivered.creditError}` : `charge_${delivered.phase}`,
      tx.transactionId
    );
  }

  /* 환불 알림 — 아직 기록 안 된 거래면 먼저 기록(지급 없이 검토로) 후 환불 검토 상태만 바꾼다 */
  if (tx.appAccountToken) {
    await callRpc(sb, "apple_iap_record_verified_transaction", {
      p_attempt_id: tx.appAccountToken,
      p_transaction_id: tx.transactionId,
      p_original_transaction_id: tx.originalTransactionId,
      p_product_id: tx.productId,
      p_bundle_id: tx.bundleId,
      p_environment: tx.environment,
      p_purchase_date: tx.purchaseDate,
      p_price_milli: tx.priceMilli,
      p_currency: tx.currency,
      p_storefront: tx.storefront,
      p_revoked_at: tx.revokedAt,
      p_signed_transaction: tx.signedTransaction,
      p_via: "notification",
    });
  }
  const refund = await callRpc(sb, "apple_iap_record_refund_notification", {
    p_notification_uuid: uuid,
    p_type: type,
    p_subtype: subtype,
    p_environment: environment,
    p_transaction_id: tx.transactionId,
    p_signed_date: signedDate,
    p_revocation_reason: tx.revocationReason,
  });
  if (refund.ok !== true) throw new Error(`apple_iap_record_refund_notification:${String(refund.error)}`);
  return { httpStatus: 200, result: refund.duplicate === true ? "duplicate" : String(refund.result ?? "recorded") };
}
