import "server-only";
import { createHash, createHmac } from "node:crypto";

/**
 * 연락처 번호 변환값 — 서버 비밀키 HMAC-SHA256(E.164). 원 번호는 저장하지 않는다 (SSOT §1-7).
 * 키: `CONTACTS_PHONE_HMAC_KEY` (Vercel 환경변수 · Owner 승인 후 추가). 없으면 연락처 기능은 「설정 안 됨」.
 */
export const CONTACTS_PHONE_KEY_VERSION = 1;

export function readContactsPhoneHmacKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = String(env.CONTACTS_PHONE_HMAC_KEY ?? "").trim();
  return key.length >= 32 ? key : null;
}

/** 64자리 16진수 (32바이트) */
export function contactsPhoneHmacHex(e164: string, key: string): string {
  return createHmac("sha256", key).update(e164, "utf8").digest("hex");
}

/** 계정에 묶인 불투명 설치 값 sha256(user_id ‖ ':' ‖ client_instance_id) — 다른 계정과 연결 불가 */
export function contactsInstallRefHex(userId: string, installId: string): string {
  return createHash("sha256").update(`${userId}:${installId.trim()}`, "utf8").digest("hex");
}

/** PostgREST bytea 인자 (`\x` + 16진수) */
export function toByteaParam(hex: string): string {
  return `\\x${hex}`;
}
