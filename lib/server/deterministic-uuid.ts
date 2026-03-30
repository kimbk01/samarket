import { createHash } from "node:crypto";

/** RFC 4122 UUID v4 형식 (8-4-4-4-12 hex), variant 비트 포함 */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * SHA-256 상위 128비트(32 hex) → 결정적 UUID v4 문자열.
 * PostgreSQL `uuid` 타입·RFC 4122 길이·variant(8–b) 규칙을 만족해야 함.
 */
function hex32ToUuidV4(hex32: string): string {
  if (!/^[0-9a-f]{32}$/i.test(hex32)) {
    throw new Error("deterministicUuid: expected 32 lowercase hex characters");
  }
  const h = hex32.toLowerCase();
  const a = h.slice(0, 8);
  const b = h.slice(8, 12);
  const c = `4${h.slice(12, 15)}`;
  const byte15_16 = parseInt(h.slice(15, 17), 16);
  const d =
    ((byte15_16 & 0x3f) | 0x80).toString(16).padStart(2, "0") + h.slice(17, 19);
  const e = h.slice(19, 31);
  const uuid = `${a}-${b}-${c}-${d}-${e}`;
  if (!UUID_V4_RE.test(uuid)) {
    throw new Error(`deterministicUuid: internal error, invalid shape: ${uuid}`);
  }
  return uuid;
}

/** 비즈/모임 등 문자열 키 → DB uuid 컬럼용 결정적 UUID (v4) */
export function deterministicUuid(namespace: string, name: string): string {
  const hex = createHash("sha256")
    .update(`${namespace}:${name}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return hex32ToUuidV4(hex);
}
