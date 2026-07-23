/**
 * Phase 1 — Domain cutover kill-switch 계약 (타입 + 순수 헬퍼).
 * 런타임 wiring / legacy writer 차단은 Phase 11. 여기선 이중 writer 금지 규칙만 고정.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type DomainCutoverMode = "off" | "on";

export type DomainCutoverState = Readonly<{
  domain: ChatDomain;
  mode: DomainCutoverMode;
}>;

/**
 * cutover OFF: legacy writer 만, 신규 Domain writer 금지 (shadow read 허용)
 * cutover ON: 신규 Domain writer 만, legacy writer 즉시 차단, legacy read fallback 금지
 */
export function assertDomainWriterAllowed(input: {
  cutover: DomainCutoverMode;
  writer: "legacy" | "domain";
}): void {
  if (input.cutover === "off" && input.writer === "domain") {
    throw new Error("dibay_domain_writer_forbidden_until_cutover");
  }
  if (input.cutover === "on" && input.writer === "legacy") {
    throw new Error("dibay_legacy_writer_forbidden_after_cutover");
  }
}

export function assertNoDualWrite(activeWriters: ReadonlyArray<"legacy" | "domain">): void {
  const unique = new Set(activeWriters);
  if (unique.has("legacy") && unique.has("domain")) {
    throw new Error("dibay_dual_write_forbidden");
  }
  if (unique.size !== 1 && activeWriters.length > 0) {
    throw new Error("dibay_writer_single_required");
  }
}

/** Phase 1 기본: 전 Domain cutover OFF — 런타임 권위 변경 없음 */
export const PHASE1_DEFAULT_CUTOVER: ReadonlyArray<DomainCutoverState> = [
  { domain: "general_direct", mode: "off" },
  { domain: "group", mode: "off" },
  { domain: "trade", mode: "off" },
  { domain: "store_order", mode: "off" },
] as const;
