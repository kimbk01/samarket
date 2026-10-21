/**
 * Stage 3-C (RC-8) — 쿠폰 캠페인 상태 단일 정의.
 *
 * - `effectiveCouponState` (ADS-23): `lifecycle_state` + `is_active` + 기간을 합친 **읽기 파생 상태**.
 *   `claim_store_coupon` 의 발급 조건(lifecycle active|scheduled · is_active · start_at<=now<end_at)과 같은 판정이라
 *   「표시 active 인데 claim 불가」가 생기지 않는다. 과거 행은 고치지 않고(D-5) 읽을 때만 파생한다.
 * - `OWNER_COUPON_TRANSITIONS` (IA-04, D-18 권장안): 오너 pause/resume/end 전이표. 종료·회수 쿠폰은 재활성 불가,
 *   관리자가 일시정지한(`paused_by='admin'`) 쿠폰은 오너가 재개할 수 없다. `paused_by` NULL(과거 행)은 재개 허용.
 * - `STORE_COUPON_MAX_USES_PER_USER` (ADS-24): 1인 1회 사용 고정 — redemptions 부분 UNIQUE
 *   (buyer_user_id, campaign_id) WHERE reversed_at IS NULL 과 같은 계약.
 */

export type EffectiveCouponState =
  | "draft"
  | "requested"
  | "approved"
  | "rejected"
  | "scheduled"
  | "active"
  /** lifecycle paused */
  | "paused"
  /** lifecycle active|scheduled 인데 is_active=false (과거 관리자 비활성) — claim 불가, 오너 재개 대상 아님 */
  | "inactive"
  | "ended"
  | "revoked";

export type CouponStateRowInput = {
  lifecycle_state?: string | null;
  is_active?: boolean | null;
  start_at?: string | null;
  end_at?: string | null;
};

function parseMs(iso: string | null | undefined): number | null {
  const ms = Date.parse(String(iso ?? ""));
  return Number.isFinite(ms) ? ms : null;
}

export function effectiveCouponState(row: CouponStateRowInput, nowMs: number = Date.now()): EffectiveCouponState {
  const st = String(row.lifecycle_state ?? "").trim().toLowerCase();
  if (st === "revoked" || st === "rejected" || st === "ended") return st;
  const endMs = parseMs(row.end_at);
  if (endMs != null && endMs <= nowMs) return "ended";
  if (st === "active" || st === "scheduled") {
    if (row.is_active === false) return "inactive";
    const startMs = parseMs(row.start_at);
    if (startMs != null && startMs > nowMs) return "scheduled";
    return "active";
  }
  if (st === "paused" || st === "draft" || st === "requested" || st === "approved") return st;
  return "inactive";
}

/** 구매자 노출(쿠폰 받기 목록) — claim RPC 가 받아 줄 상태만. */
export function isCouponClaimableState(row: CouponStateRowInput, nowMs: number = Date.now()): boolean {
  return effectiveCouponState(row, nowMs) === "active";
}

/** 쓰기 경로: `is_active` 는 lifecycle 파생값으로만 기록한다. */
export function couponIsActiveForLifecycle(lifecycleState: string): boolean {
  return lifecycleState === "active";
}

export type CouponPausedBy = "owner" | "admin";

export type OwnerCouponTransitionAction = "pause" | "resume" | "end";

export type OwnerCouponTransition = {
  /** CAS — `.in("lifecycle_state", from)` */
  from: readonly string[];
  to: "paused" | "active" | "ended";
  /** pause: 이미 비활성(is_active=false)인 행은 오너가 일시정지·재개로 되살릴 수 없게 is_active=true 도 조건 */
  requireIsActive?: boolean;
  /** resume: paused_by 가 admin 이 아닌 행만 */
  excludeAdminPaused?: boolean;
  /** UPDATE 에 함께 쓰는 paused_by (undefined = 건드리지 않음) */
  pausedBy?: CouponPausedBy | null;
  audit: "owner_pause" | "owner_resume" | "owner_end";
};

export const OWNER_COUPON_TRANSITIONS: Readonly<Record<OwnerCouponTransitionAction, OwnerCouponTransition>> = {
  pause: {
    from: ["active", "scheduled"],
    to: "paused",
    requireIsActive: true,
    pausedBy: "owner",
    audit: "owner_pause",
  },
  resume: { from: ["paused"], to: "active", excludeAdminPaused: true, pausedBy: null, audit: "owner_resume" },
  end: { from: ["active", "scheduled", "paused", "draft"], to: "ended", audit: "owner_end" },
};

export function isOwnerCouponTransitionAction(v: string): v is OwnerCouponTransitionAction {
  return v === "pause" || v === "resume" || v === "end";
}

export type OwnerCouponTransitionCheck =
  | { ok: true; transition: OwnerCouponTransition }
  | { ok: false; error: "invalid_transition" | "admin_paused_resume_forbidden"; status: 409 | 403 };

/** 서버 선검사 + 화면 버튼 노출 공용. 최종 판정은 서버 CAS(같은 조건의 UPDATE)다. */
export function checkOwnerCouponTransition(
  action: OwnerCouponTransitionAction,
  row: { lifecycle_state?: string | null; is_active?: boolean | null; paused_by?: string | null }
): OwnerCouponTransitionCheck {
  const tr = OWNER_COUPON_TRANSITIONS[action];
  const st = String(row.lifecycle_state ?? "").trim().toLowerCase();
  if (!tr.from.includes(st)) return { ok: false, error: "invalid_transition", status: 409 };
  if (tr.requireIsActive && row.is_active === false) return { ok: false, error: "invalid_transition", status: 409 };
  if (tr.excludeAdminPaused && String(row.paused_by ?? "") === "admin") {
    return { ok: false, error: "admin_paused_resume_forbidden", status: 403 };
  }
  return { ok: true, transition: tr };
}

export const STORE_COUPON_MAX_USES_PER_USER = 1 as const;

/** 생성 body 의 1인 사용 횟수 — 없으면 1, 1 이 아니면 거부(ADS-24). */
export function readStoreCouponMaxUsesPerUser(body: Record<string, unknown>): { ok: true } | { ok: false } {
  const raw = body.maxUsesPerUser ?? body.max_uses_per_user;
  if (raw === undefined || raw === null || raw === "") return { ok: true };
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return n === STORE_COUPON_MAX_USES_PER_USER ? { ok: true } : { ok: false };
}

/** 재발행 폼 키 — DB CHECK(8..128) 와 같은 범위, URL·헤더 안전 문자만. */
export function parseCouponClientRequestId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.length < 8 || v.length > 128) return null;
  return /^[A-Za-z0-9._:-]+$/.test(v) ? v : null;
}
