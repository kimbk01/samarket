/**
 * 포인트 원장 설명 (`point_ledger.description`) — 언어 재감사 2026-11-27 설계 §4-3.
 *
 * `point_ledger` 에는 종류·값을 둘 metadata 열이 없다(DB 열 추가 금지 · 운영 457행).
 * 그래서 저장은 지금과 글자가 같은 정본 문장(카탈로그 `point_desc_*` 의 ko 값 — 관리자 원장 화면·옛 행과 호환)으로 두고,
 * 회원 화면(`PointFinancialHistoryList`)은 그 문장을 키 + 값으로 되돌려 보는 사람 언어로 그린다.
 * 정본 문장을 만드는 함수와 되돌리는 함수가 같은 키를 쓰므로 새 행·옛 행이 같은 길로 그려진다.
 * 대응표에 없는 설명(관리자가 쓴 사유 등)은 그대로 보인다 — 영어 화면에서도 숨기지 않는다.
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { createCatalogTemplateMatcher } from "@/lib/i18n/stored-text-template-match";

/** 저장 정본 언어 — 화면 언어가 아니다(열이 없어 기존 저장 글자를 유지하는 값) */
const POINT_LEDGER_STORED_LANGUAGE: AppLanguageCode = "ko";

const SEP = " · ";

export type PointLedgerSimpleKey =
  | "point_desc_ad_purchase"
  | "point_desc_ad_apply_refund"
  | "point_desc_feed_ad_hold"
  | "point_desc_feed_ad_hold_rollback"
  | "point_desc_feed_ad_release"
  | "point_desc_feed_ad_capture"
  | "point_desc_feed_ad_comp_refund"
  | "point_desc_feed_ad_comp_release";

const SIMPLE_KEYS: readonly PointLedgerSimpleKey[] = [
  "point_desc_ad_purchase",
  "point_desc_ad_apply_refund",
  "point_desc_feed_ad_hold",
  "point_desc_feed_ad_hold_rollback",
  "point_desc_feed_ad_release",
  "point_desc_feed_ad_capture",
  "point_desc_feed_ad_comp_refund",
  "point_desc_feed_ad_comp_release",
];

/** 광고·피드 광고 원장 설명 (저장 정본) */
export function buildPointLedgerDescription(
  key: PointLedgerSimpleKey,
  vars?: Record<string, string | number>
): string {
  return translate(POINT_LEDGER_STORED_LANGUAGE, key, vars);
}

/** 커뮤니티 글·댓글 보상 (`apply-community-point.ts`) — 저장 글자는 예전과 같다 */
export function buildCommunityPointLedgerDescription(input: {
  actionType: "write" | "comment";
  isQna: boolean;
  topicSlug: string;
  boardName: string;
  rewardType: "fixed" | "random";
  randomMin: number;
  randomMax: number;
  basePoint: number;
  multiplier: number;
  content: string;
}): string {
  const L = POINT_LEDGER_STORED_LANGUAGE;
  const action = translate(L, communityActionKey(input.actionType, input.isQna));
  const board =
    input.boardName || input.topicSlug || (input.isQna ? "Q&A" : translate(L, "mypage_hub_community_fallback"));
  const preview = input.content.replace(/\s+/g, " ").trim().slice(0, 40);
  const rewardBit =
    input.rewardType === "random"
      ? translate(L, "point_desc_reward_random", { min: input.randomMin, max: input.randomMax, base: input.basePoint })
      : translate(L, "point_desc_reward_fixed", { base: input.basePoint });
  const mult = input.multiplier && input.multiplier !== 1 ? ` ×${input.multiplier}` : "";
  return `${action}${SEP}${board}${SEP}${rewardBit}${mult}${SEP}"${preview}"`.slice(0, 500);
}

/** 게시판 보상 실행 (`execute-point-reward-server.ts`) — 저장 글자는 예전과 같다 */
export function buildRewardExecutionLedgerDescription(input: {
  actionType: "write" | "comment";
  boardName: string;
  reason?: string | null;
}): string {
  const L = POINT_LEDGER_STORED_LANGUAGE;
  const base = translate(L, input.actionType === "write" ? "point_desc_reward_write" : "point_desc_reward_comment", {
    board: input.boardName,
  });
  const reason = input.reason?.trim();
  return reason ? `${base}${SEP}${translate(L, "point_desc_admin_reason", { reason })}` : base;
}

function communityActionKey(actionType: "write" | "comment", isQna: boolean): MessageKey {
  if (actionType === "comment") return "point_fin_community_comment";
  return isQna ? "point_fin_community_question" : "point_fin_community_post";
}

const COMMUNITY_ACTION_KEYS: readonly MessageKey[] = [
  "point_fin_community_question",
  "point_fin_community_post",
  "point_fin_community_comment",
];
const matchSimple = createCatalogTemplateMatcher(SIMPLE_KEYS);
const matchCommunityAction = createCatalogTemplateMatcher(COMMUNITY_ACTION_KEYS);
const matchRewardBit = createCatalogTemplateMatcher(["point_desc_reward_random", "point_desc_reward_fixed"]);
const matchBoardFallback = createCatalogTemplateMatcher(["mypage_hub_community_fallback"]);
const matchRewardExecution = createCatalogTemplateMatcher(["point_desc_reward_write", "point_desc_reward_comment"]);
const matchAdminReason = createCatalogTemplateMatcher(["point_desc_admin_reason"]);

/** 문자열 안 모든 구분자 위치 */
function sepIndexes(s: string): number[] {
  const out: number[] = [];
  let i = s.indexOf(SEP);
  while (i >= 0) {
    out.push(i);
    i = s.indexOf(SEP, i + 1);
  }
  return out;
}

function localizeCommunity(lang: AppLanguageCode, text: string): string | null {
  const first = text.indexOf(SEP);
  if (first < 0) return null;
  const action = matchCommunityAction(text.slice(0, first));
  if (!action) return null;
  const rest = text.slice(first + SEP.length);
  for (const i of sepIndexes(rest)) {
    const board = rest.slice(0, i);
    const after = rest.slice(i + SEP.length);
    const q = after.indexOf(`${SEP}"`);
    if (q < 0) continue;
    const bitWithMult = after.slice(0, q);
    const multMatch = bitWithMult.match(/^([\s\S]*?)( ×[0-9.]+)?$/);
    const bit = matchRewardBit(multMatch?.[1] ?? bitWithMult);
    if (!bit) continue;
    const preview = after.slice(q + SEP.length);
    const boardShown = matchBoardFallback(board) ? translate(lang, "mypage_hub_community_fallback") : board;
    return `${translate(lang, action.key)}${SEP}${boardShown}${SEP}${translate(lang, bit.key, bit.vars)}${multMatch?.[2] ?? ""}${SEP}${preview}`;
  }
  return null;
}

function localizeRewardExecution(lang: AppLanguageCode, text: string): string | null {
  const whole = matchRewardExecution(text);
  if (whole) return translate(lang, whole.key, whole.vars);
  for (const i of sepIndexes(text)) {
    const head = matchRewardExecution(text.slice(0, i));
    if (!head) continue;
    const tail = matchAdminReason(text.slice(i + SEP.length));
    if (!tail) continue;
    return `${translate(lang, head.key, head.vars)}${SEP}${translate(lang, tail.key, tail.vars)}`;
  }
  return null;
}

/**
 * 저장된 원장 설명 → 보는 사람 언어. 알려진 시스템 문장이 아니면 null(호출자가 원문을 그대로 보인다).
 */
export function localizePointLedgerDescription(lang: AppLanguageCode, text: string | null | undefined): string | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const simple = matchSimple(s);
  if (simple) return translate(lang, simple.key, simple.vars);
  return localizeCommunity(lang, s) ?? localizeRewardExecution(lang, s);
}
