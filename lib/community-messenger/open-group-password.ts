import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";

/**
 * 메신저 오픈그룹(`community_messenger_rooms.password_hash`) 입장 비밀번호.
 * 모임 감사 5번 묶음 P1·P2 (docs/audit/moim-bundle5-design-2026-11-28.md):
 * - 저장: `scrypt$N$r$p$<salt b64>$<hash b64>` (salt 16바이트·결과 32바이트) — 매번 salt 가 달라 같은 비밀번호도 다른 값.
 * - 비교: timingSafeEqual. 예전 형식(64자 16진수 sha256(trim))도 고정 시간 비교로 계속 읽는다.
 * - 길이: 공백을 자른 뒤 4~32자 (만들기·수정만 검사, 입장은 틀린 비밀번호로 처리).
 */

import { OPEN_GROUP_PASSWORD_MAX_LENGTH, OPEN_GROUP_PASSWORD_MIN_LENGTH } from "@/lib/community-messenger/open-group-password-rules";

export { OPEN_GROUP_PASSWORD_MAX_LENGTH, OPEN_GROUP_PASSWORD_MIN_LENGTH };

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SALT_BYTES = 16;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const LEGACY_SHA256_RE = /^[0-9a-f]{64}$/i;
/** 입장 비교 입력 상한 — 아주 긴 입력으로 해시 비용을 키우지 않는다(정상 비밀번호는 32자 이하) */
const VERIFY_INPUT_MAX_CHARS = 256;

function normalizeOpenGroupPassword(password: string) {
  return password.trim();
}

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { N: n, r, p, maxmem: SCRYPT_MAXMEM }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** 만들기·설정 수정에서만 쓴다. 통과면 null, 아니면 오류 코드. */
export function openGroupPasswordLengthError(password: string): "password_too_short" | "password_too_long" | null {
  const len = Array.from(normalizeOpenGroupPassword(password)).length;
  if (len < OPEN_GROUP_PASSWORD_MIN_LENGTH) return "password_too_short";
  if (len > OPEN_GROUP_PASSWORD_MAX_LENGTH) return "password_too_long";
  return null;
}

export async function hashOpenGroupPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(normalizeOpenGroupPassword(password), salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEYLEN);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyOpenGroupPassword(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  const stored = String(passwordHash ?? "").trim();
  if (!stored) return false;
  const normalized = normalizeOpenGroupPassword(password);
  if (!normalized || normalized.length > VERIFY_INPUT_MAX_CHARS) return false;
  if (LEGACY_SHA256_RE.test(stored)) {
    const actual = createHash("sha256").update(normalized, "utf8").digest();
    return timingSafeEqual(actual, Buffer.from(stored, "hex"));
  }
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  /** 저장값이 비용을 정한다 — 이상한 값으로 서버를 멈추게 하지 않도록 상한을 둔다 */
  if (
    !Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) ||
    n < 2 || n > 1 << 17 || (n & (n - 1)) !== 0 || r < 1 || r > 16 || p < 1 || p > 4 ||
    128 * n * r > SCRYPT_MAXMEM / 2
  ) {
    return false;
  }
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (salt.length === 0 || expected.length < 16 || expected.length > 64) return false;
  /** 재감사 L2 — 계산이 실패하면 틀린 비밀번호로 본다(요청이 처리되지 않은 오류로 끝나지 않게) */
  try {
    const actual = await scryptAsync(normalized, salt, n, r, p, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
