/**
 * 필라이프 화면 — 서버·DB 에 남은 고정 문장을 화면 언어로 다시 그림 (재감사 2026-11-27 · 설계 §4-3 R3).
 *
 * - 새 행은 이름·주소·빈 값만 저장한다. 이미 저장된 옛 행은 DB 를 고치지 않고 여기서 「알려진 고정 문장 → 키」로 바꾼다.
 * - 대응표에 없는 글(사람이 쓴 내용)은 그대로 둔다. 회원 글에는 적용하지 않는다(가져온 글만).
 */
import type { ApiErrorTranslate } from "@/lib/i18n/api-error-text";
import { translate } from "@/lib/i18n/messages";

/**
 * 글 카드·상세·내 활동의 지역 표시 — 저장 기본값 「동네」는 화면 언어 키로.
 * 저장값 = `region_label`(NOT NULL)·`locations.name`(NOT NULL) 호환값 `COMMUNITY_PUBLIC_REGION_FALLBACK`
 * (lib/addresses/community-public-region-label.ts) = `community_local_filter_area_label` 의 ko 값 (테스트가 같음을 지킨다).
 */
export function communityRegionLabelText(label: string | null | undefined, t: ApiErrorTranslate): string {
  const v = (label ?? "").trim();
  if (v && v === translate("ko", "community_local_filter_area_label")) return t("community_local_filter_area_label");
  return v;
}

/** 작성자 이름 — 서버가 빈 값을 주면(작성자 id 없음) 화면 언어 「익명」 */
export function communityAuthorNameText(name: string | null | undefined, t: ApiErrorTranslate): string {
  const v = (name ?? "").trim();
  return v || t("community_anonymous");
}

/** 옛 가져온 글 본문 마지막 줄 `출처: {이름} {주소}` */
const LEGACY_SOURCE_LINE_RE = /^출처: (.+?) (https?:\/\/\S+)$/;
/** 옛 가져온 글 서식 본문 링크 글자 `출처: {이름}` */
const LEGACY_SOURCE_LINK_RE = /^출처: (.+)$/;
/** 옛 「원문 링크만」 글 본문 */
const LEGACY_LINK_ONLY_RE = /^(.+)에 게시된 글입니다\. 아래 출처에서 원문을 확인하세요\.$/;

/**
 * 가져온 글 본문(평문·교차 본문) — 옛 고정 줄을 화면 언어로.
 * 새 「원문 링크만」 글은 본문이 원문 주소 한 줄뿐이다 → 안내 문구로 그린다.
 */
export function localizeImportedPostBody(
  content: string,
  attribution: { sourceName?: string | null; canonicalUrl?: string | null } | null | undefined,
  t: ApiErrorTranslate
): string {
  if (!content) return content;
  const name = (attribution?.sourceName ?? "").trim();
  const url = (attribution?.canonicalUrl ?? "").trim();
  if (url && content.trim() === url) {
    return t("community_imported_link_only", { name: name || url });
  }
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const src = LEGACY_SOURCE_LINE_RE.exec(trimmed);
      if (src) return t("community_imported_source_line", { name: src[1]!, url: src[2]! });
      const only = LEGACY_LINK_ONLY_RE.exec(trimmed);
      if (only) return t("community_imported_link_only", { name: only[1]! });
      return line;
    })
    .join("\n");
}

/** 가져온 글 서식 본문 링크 글자 — 옛 `출처: {이름}` 을 화면 언어로 */
export function localizeImportedLinkText(text: string, t: ApiErrorTranslate): string {
  const m = LEGACY_SOURCE_LINK_RE.exec(text.trim());
  return m ? t("community_imported_source_link", { name: m[1]! }) : text;
}
