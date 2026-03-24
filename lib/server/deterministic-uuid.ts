import { createHash } from "node:crypto";

/** 비즈/모임 등 문자열 키 → DB uuid 컬럼용 결정적 UUID (v4 variant 비트) */
export function deterministicUuid(namespace: string, name: string): string {
  const hex = createHash("sha256")
    .update(`${namespace}:${name}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  const p4 = "4" + hex.slice(13, 16);
  const p5 = ((parseInt(hex.slice(16, 18), 16) & 0x3) | 0x8).toString(16) + hex.slice(18, 20);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${p4}-${p5}-${hex.slice(20, 32)}`;
}
