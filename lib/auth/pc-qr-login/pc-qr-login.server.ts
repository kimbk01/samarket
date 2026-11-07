import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PC_QR_LOGIN_TTL_MS, type PcQrLoginStatus } from "@/lib/auth/pc-qr-login/pc-qr-login-contract";

/**
 * PC QR 로그인 요청 저장소 — `public.pc_login_requests` (service_role 전용, RLS 강제).
 * 상태 전이는 **조건부 UPDATE 한 번**으로만 한다 (동시 승인·재사용 방지):
 *   pending ──approve(nonce)──▶ approved ──consume(PC 비밀값)──▶ consumed
 * 만료는 시각으로 판정한다 (expires_at <= now → 승인·소비 불가).
 */

const TABLE = "pc_login_requests";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 추측 불가 값 — base64url 32바이트 (43자) */
export function newPcQrLoginSecret(): string {
  return randomBytes(32).toString("base64url");
}

export type PcQrLoginRequestMeta = {
  ip: string | null;
  userAgent: string | null;
  client: string | null;
  geoCountry: string | null;
  geoCity: string | null;
};

export type CreatedPcQrLoginRequest = {
  requestId: string;
  nonce: string;
  pcSecret: string;
  expiresAt: string;
};

/** 표가 아직 운영에 없을 때(마이그레이션 미적용) — 화면은 QR 영역을 숨긴다 */
export class PcQrLoginUnavailableError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "pc_qr_login_unavailable";
  }
}

function isMissingTableError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /pc_login_requests/.test(err.message ?? "");
}

export async function createPcQrLoginRequest(
  adminSb: SupabaseClient,
  meta: PcQrLoginRequestMeta,
  now = Date.now(),
): Promise<CreatedPcQrLoginRequest> {
  const nonce = newPcQrLoginSecret();
  const pcSecret = newPcQrLoginSecret();
  const expiresAt = new Date(now + PC_QR_LOGIN_TTL_MS).toISOString();
  const { data, error } = await adminSb
    .from(TABLE)
    .insert({
      pc_secret_hash: sha256Hex(pcSecret),
      qr_nonce_hash: sha256Hex(nonce),
      status: "pending",
      expires_at: expiresAt,
      pc_ip: meta.ip,
      pc_user_agent: meta.userAgent?.slice(0, 400) ?? null,
      pc_client: meta.client,
      pc_geo_country: meta.geoCountry,
      pc_geo_city: meta.geoCity,
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    if (isMissingTableError(error)) throw new PcQrLoginUnavailableError(error?.message ?? "missing table");
    throw new Error(error?.message || "pc_qr_login_create_failed");
  }
  return { requestId: String(data.id), nonce, pcSecret, expiresAt };
}

export type PcQrLoginRow = {
  id: string;
  status: PcQrLoginStatus;
  created_at: string;
  expires_at: string;
  approved_by_user_id: string | null;
  pc_client: string | null;
  pc_geo_country: string | null;
  pc_geo_city: string | null;
};

const ROW_COLUMNS =
  "id,status,created_at,expires_at,approved_by_user_id,pc_client,pc_geo_country,pc_geo_city";

export function isPcQrLoginRowExpired(row: Pick<PcQrLoginRow, "expires_at">, now = Date.now()): boolean {
  return Date.parse(row.expires_at) <= now;
}

/** PC — 자기 요청만 (PC 비밀값 해시 일치) */
export async function readPcQrLoginRequestForPc(
  adminSb: SupabaseClient,
  requestId: string,
  pcSecret: string,
): Promise<PcQrLoginRow | null> {
  const { data, error } = await adminSb
    .from(TABLE)
    .select(ROW_COLUMNS)
    .eq("id", requestId)
    .eq("pc_secret_hash", sha256Hex(pcSecret))
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) throw new PcQrLoginUnavailableError(error.message);
    throw new Error(error.message);
  }
  return (data as PcQrLoginRow | null) ?? null;
}

/** 휴대폰 — QR 의 nonce 로만 (확인 화면용) */
export async function readPcQrLoginRequestForApprover(
  adminSb: SupabaseClient,
  requestId: string,
  nonce: string,
): Promise<PcQrLoginRow | null> {
  const { data, error } = await adminSb
    .from(TABLE)
    .select(ROW_COLUMNS)
    .eq("id", requestId)
    .eq("qr_nonce_hash", sha256Hex(nonce))
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) throw new PcQrLoginUnavailableError(error.message);
    throw new Error(error.message);
  }
  return (data as PcQrLoginRow | null) ?? null;
}

/** 승인 — pending·미만료·nonce 일치일 때만 1회. 바뀐 행이 없으면 false */
export async function approvePcQrLoginRequest(
  adminSb: SupabaseClient,
  input: { requestId: string; nonce: string; approverUserId: string; approverIp: string | null },
  now = Date.now(),
): Promise<boolean> {
  const nowIso = new Date(now).toISOString();
  const { data, error } = await adminSb
    .from(TABLE)
    .update({
      status: "approved",
      approved_by_user_id: input.approverUserId,
      approved_at: nowIso,
      approver_ip: input.approverIp,
    })
    .eq("id", input.requestId)
    .eq("qr_nonce_hash", sha256Hex(input.nonce))
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length === 1;
}

/** 소비 — approved·미만료·PC 비밀값 일치일 때만 1회. 승인한 회원 id 를 돌려준다 */
export async function consumeApprovedPcQrLoginRequest(
  adminSb: SupabaseClient,
  input: { requestId: string; pcSecret: string },
  now = Date.now(),
): Promise<string | null> {
  const nowIso = new Date(now).toISOString();
  const { data, error } = await adminSb
    .from(TABLE)
    .update({ status: "consumed", consumed_at: nowIso })
    .eq("id", input.requestId)
    .eq("pc_secret_hash", sha256Hex(input.pcSecret))
    .eq("status", "approved")
    .gt("expires_at", nowIso)
    .select("approved_by_user_id");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) && data.length === 1 ? (data[0] as { approved_by_user_id: string | null }) : null;
  return row?.approved_by_user_id ?? null;
}

/** PC 화면 닫힘·새 QR — 이전 pending 요청 취소 (실패해도 만료로 정리됨) */
export async function cancelPcQrLoginRequest(
  adminSb: SupabaseClient,
  input: { requestId: string; pcSecret: string },
): Promise<void> {
  await adminSb
    .from(TABLE)
    .update({ status: "cancelled" })
    .eq("id", input.requestId)
    .eq("pc_secret_hash", sha256Hex(input.pcSecret))
    .eq("status", "pending");
}
