/**
 * `/support/enter?category=…&referenceType=…&referenceId=…` — 알림·푸시에서 문의 시작 맥락을 넘기는 링크.
 * 세션 맥락(sessionStorage)이 없을 때만 쓰인다. 참조 소유 확인은 서버 문의 생성 시 그대로 한다
 * (`support-reference-authority`). 클라이언트·서버 공용 (순수 함수).
 * 거래 Admin 설계 v2 §G-4 · D-28 (거래 제한·숨김 알림 → 거래 이의신청).
 */
import { buildMemberSupportContext, type SupportContext } from "@/lib/support/support-context";
import { MEMBER_SUPPORT_CATEGORIES, type MemberSupportCategory } from "@/lib/support/support-category-registry";

const ENTER_PATH = "/support/enter";
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const REF_TYPE_RE = /^[A-Z_]{1,40}$/;

export function buildSupportEnterHref(input: {
  category: MemberSupportCategory;
  referenceType?: string;
  referenceId?: string;
}): string {
  const p = new URLSearchParams({ category: input.category });
  if (input.referenceType && input.referenceId) {
    p.set("referenceType", input.referenceType);
    p.set("referenceId", input.referenceId);
  }
  return `${ENTER_PATH}?${p.toString()}`;
}

/** 링크 쿼리 → 회원 문의 맥락. 형식이 맞지 않으면 null (임의 값 생성 없음). */
export function supportContextFromEnterQuery(search: URLSearchParams | null | undefined): SupportContext | null {
  if (!search) return null;
  const category = String(search.get("category") ?? "").trim();
  if (!(MEMBER_SUPPORT_CATEGORIES as readonly string[]).includes(category)) return null;
  const referenceType = String(search.get("referenceType") ?? "").trim();
  const referenceId = String(search.get("referenceId") ?? "").trim();
  const withRef = REF_TYPE_RE.test(referenceType) && ID_RE.test(referenceId);
  return buildMemberSupportContext({
    enabled: true,
    category: category as MemberSupportCategory,
    sourceSurface: "notification_link",
    ...(withRef ? { referenceType, referenceId } : {}),
  });
}
