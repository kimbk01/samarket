/**
 * 어드민 등록 이름 영어 필수 — 단일 정의 (`docs/i18n-ssot.md` §3-6, 언어 SSOT S7).
 * 고객 화면에 보이는 이름(커뮤니티 주제·거래 카테고리·매장 업종/주제/세부)은 ko·en 둘 다 있어야 한다.
 *
 * - 새로 만들 때: 영어 이름 필수.
 * - 수정할 때: 있던 영어 이름을 비우면 거부. 한국어 이름이 실제로 바뀌는데 영어 이름이 없으면 거부.
 * - 노출·순서·이미지만 바꾸는 저장(행 전체를 다시 보내도 이름이 같으면)은 통과 — 영어 이름이 아직 없는 기존 행도 운영을 막지 않는다.
 */
export const ADMIN_NAME_EN_REQUIRED_ERROR = "name_en_required" as const;

export function normalizeAdminNameEn(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t.slice(0, 120) : null;
}

/**
 * @param next 저장 후 값(요청에 없으면 기존 값)
 * @param prev 저장 전 값(새로 만들 때는 생략)
 */
export function adminNameEnViolation(input: {
  creating: boolean;
  next: { name: string | null; nameEn: string | null };
  prev?: { name: string | null; nameEn: string | null } | null;
}): boolean {
  const nextEn = normalizeAdminNameEn(input.next.nameEn);
  if (input.creating) return !nextEn;
  const prevEn = normalizeAdminNameEn(input.prev?.nameEn);
  if (prevEn && !nextEn) return true;
  const renamed = String(input.next.name ?? "").trim() !== String(input.prev?.name ?? "").trim();
  return renamed && !nextEn;
}
