import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt16k$";
const KEYLEN = 64;

function scryptParams() {
  return { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
}

/** 참여 비밀번호 저장용 (평문 DB 저장 금지) */
export function hashCommunityChatJoinPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain.normalize("NFKC"), salt, KEYLEN, scryptParams());
  return `${PREFIX}${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyCommunityChatJoinPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored || typeof stored !== "string" || !stored.startsWith(PREFIX)) return false;
  const rest = stored.slice(PREFIX.length);
  const dollar = rest.indexOf("$");
  if (dollar < 1) return false;
  const saltB64 = rest.slice(0, dollar);
  const hashB64 = rest.slice(dollar + 1);
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    if (salt.length < 8 || expected.length < 16) return false;
    const hash = scryptSync(plain.normalize("NFKC"), salt, expected.length, scryptParams());
    return hash.length === expected.length && timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}
