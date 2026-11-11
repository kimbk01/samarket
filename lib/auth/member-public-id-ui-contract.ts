/**
 * 회원 아이디 화면·CTA 단일 계약 (설계안 v3 §3.1·§3.8, Owner 2026-11-11 「정확한 ui ux cta ssot」)
 *
 * CONTRACT
 * - 회원 화면에는 아이디 1개(`dibay_id`)만 보인다. 기본 아이디(`dibay_id_initial`)는 어드민 전용.
 * - 상태·변경권은 DB 생성 컬럼(`dibay_id_state`·`dibay_id_can_change`) 단일 판정 — `dibay-public-id-ssot`.
 * - 내 프로필·필수 정보·아이디 변경 시트·프로필 편집은 배지·안내·CTA 문구 키를 이 함수에서만 얻는다.
 *
 * DO NOT
 * - 화면에서 `dibay_id_auto_assigned`·`dibay_id_changed_once`·아이디 모양으로 배지·CTA 를 따로 정하지 않는다.
 */

import {
  resolvePublicIdCanChange,
  resolvePublicIdState,
  type ProfilePublicIdFields,
  type PublicIdState,
} from "@/lib/auth/dibay-public-id-ssot";
import { normalizeDibayIdInput } from "@/lib/auth/dibay-id-policy";
import { formatAtUsername } from "@/lib/users/user-label";

export type MemberPublicIdHintKey =
  | "member_id_hint_auto"
  | "member_id_hint_legacy"
  | "member_id_hint_custom"
  | "member_id_hint_search_off";

export type MemberPublicIdUi = {
  state: PublicIdState;
  /** 회원 화면의 유일한 아이디 (`@48213sun`) — 없으면 null */
  atDisplay: string | null;
  /** 아이디 (`48213sun`, @ 없음) */
  id: string | null;
  canChange: boolean;
  /** 「1회 변경 가능」 배지 — 변경권이 있을 때만 */
  badgeKey: "member_id_badge_can_change" | null;
  /** 친구가 나를 찾는 방법 안내 */
  hintKey: MemberPublicIdHintKey | null;
  hintVars: Record<string, string>;
  /** [아이디 변경] — 변경권이 있을 때만 */
  changeCtaKey: "member_id_cta_change" | null;
  /** 변경 확인 시트 안내 — 지금 아이디로는 더 이상 찾을 수 없음 */
  changeConfirmNoteKey: "member_id_change_confirm_note";
  changeConfirmNoteVars: Record<string, string>;
};

const HINT_BY_STATE: Record<Exclude<PublicIdState, "none">, MemberPublicIdHintKey> = {
  auto: "member_id_hint_auto",
  auto_legacy: "member_id_hint_legacy",
  custom: "member_id_hint_custom",
};

export function resolveMemberPublicIdUi(
  row: ProfilePublicIdFields | null | undefined,
  /** 「아이디로 나를 찾기」 — false 면 찾는 방법 대신 「검색이 꺼져 있어요」 (재감사 E4). 모르면 생략 */
  opts?: { allowIdSearch?: boolean | null },
): MemberPublicIdUi {
  const state = resolvePublicIdState(row);
  const id = normalizeDibayIdInput(row?.dibay_id ?? "") || null;
  const canChange = resolvePublicIdCanChange(row);
  const searchOff = opts?.allowIdSearch === false;
  const hintKey: MemberPublicIdHintKey | null =
    state === "none" ? null : searchOff ? "member_id_hint_search_off" : HINT_BY_STATE[state];
  return {
    state,
    atDisplay: id ? formatAtUsername(id) : null,
    id,
    canChange,
    badgeKey: canChange ? "member_id_badge_can_change" : null,
    hintKey,
    hintVars: { digits: !searchOff && state === "auto" && id ? id.slice(0, 5) : "" },
    changeCtaKey: canChange ? "member_id_cta_change" : null,
    changeConfirmNoteKey: "member_id_change_confirm_note",
    changeConfirmNoteVars: { current: id ?? "" },
  };
}
