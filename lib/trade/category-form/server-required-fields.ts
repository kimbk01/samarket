/**
 * 거래 글 서버 필수 칸 검사 (감사 C7·R6·J6·P8 · Owner 2026-11-22 「권장안대로 구현」).
 * 설계: `docs/audit/trade-server-required-fields-design-2026-11-22.md`
 *
 * - 화면과 같은 판정: 주제 구성(어드민 설정 포함) + 행동 규칙(`applyTradeBehaviorAdapter`)에서
 *   「보이고 필수인 칸」을 뽑고, 저장될 행(posts 열 + meta)에서 값을 읽어 빈 칸을 찾는다.
 * - 1단계(지금): 막지 않고 서버 로그만 남긴다(`TRADE_REQUIRED_FIELDS_ENFORCE = false`).
 *   7일 동안 would_block 0건을 확인한 뒤 2단계로 상수를 바꾼다.
 * - 수정은 「이번 수정으로 새로 비게 된 칸」만 본다 — 예전 규칙으로 만든 글은 계속 수정할 수 있다.
 */
import { applyTradeBehaviorAdapter } from "./behavior-adapters";
import { behaviorContextFromDetailMeta } from "./detail-spec-route";
import type { ResolvedTradeComposition } from "./types";

/** 2단계(막기) 전환 스위치 — 1단계 7일 would_block 0건 확인 뒤 true (설계 §4-3) */
export const TRADE_REQUIRED_FIELDS_ENFORCE = false;

/**
 * 서버·화면 공통 제외 칸 — 다른 검사가 이미 있거나(사진·제목·내용·위치) 필수 판정 대상이 아닌 칸.
 * 화면(`GenericTradeWriteFields` SHELL_SKIP)은 여기에 「전용 위젯이 직접 검사하는 칸」을 더해 쓴다.
 */
export const TRADE_REQUIRED_FIELDS_BASE_SKIP: readonly string[] = [
  "images",
  "title",
  "description",
  "location",
  "trade_meet_spot",
  "is_price_offer",
  "is_free_share",
];

const BASE_SKIP = new Set(TRADE_REQUIRED_FIELDS_BASE_SKIP);

/** 화면 `validateAdaptedCompositionValues` 와 같은 빈 값 기준 + 빈 배열 */
export function isTradeRequiredValueEmpty(raw: unknown): boolean {
  if (raw == null) return true;
  if (typeof raw === "string") return !raw.trim();
  if (typeof raw === "number") return Number.isNaN(raw);
  if (Array.isArray(raw)) return raw.length === 0;
  return false;
}

function metaOf(row: Record<string, unknown>): Record<string, unknown> {
  const m = row.meta;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

/**
 * 저장될 행 기준 빈 필수 칸 id 목록.
 * @param row posts 행 모양 — 열(price·is_free_share·pay_type …) + `meta`
 */
export function findMissingRequiredTradeFields(
  composition: ResolvedTradeComposition,
  row: Record<string, unknown>
): string[] {
  const meta = metaOf(row);
  const adapted = applyTradeBehaviorAdapter(composition, behaviorContextFromDetailMeta(meta));
  const missing: string[] = [];
  for (const f of adapted) {
    if (!f.visible || !f.effectiveRequired) continue;
    if (BASE_SKIP.has(f.id)) continue;
    const def = f.definition;
    if (def.widget === "derived" || def.widget === "boolean") continue;
    /** 나눔 글은 가격이 없다(감사 G1 — 화면도 같은 기준) */
    if (f.id === "price" && row.is_free_share === true) continue;
    const st = def.storage;
    let value: unknown;
    if (st.kind === "meta") value = meta[st.key];
    else if (st.kind === "combined_meta") value = meta[st.writeKey];
    else if (st.kind === "column") value = row[st.column];
    else if (st.kind === "meta_or_column") {
      value = meta[st.metaKey];
      if (isTradeRequiredValueEmpty(value)) value = row[st.column];
    } else continue;
    if (isTradeRequiredValueEmpty(value)) missing.push(f.id);
  }
  return missing;
}

/** 수정: 수정 후에만 빈 칸(= 이번 수정으로 새로 비게 된 칸) */
export function findNewlyMissingRequiredTradeFields(
  composition: ResolvedTradeComposition,
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const was = new Set(findMissingRequiredTradeFields(composition, before));
  return findMissingRequiredTradeFields(composition, after).filter((id) => !was.has(id));
}

/** 1단계 기록 — 회원 id·글 내용은 넣지 않는다(설계 S-3) */
export function logTradeRequiredFieldsWouldBlock(input: {
  route: "create" | "update";
  profileId: string;
  fields: string[];
}): void {
  if (input.fields.length === 0) return;
  console.warn(
    `[trade-required-fields] would_block ${JSON.stringify({
      route: input.route,
      profileId: input.profileId,
      fields: input.fields,
      enforce: TRADE_REQUIRED_FIELDS_ENFORCE,
    })}`
  );
}
