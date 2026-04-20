import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/** `messages.map` 한 패스 동안만 누적 — `service` 에서 reset / diagnostics 병합 */
const messengerImageMetaDiag = {
  imageMetaCallCount: 0,
  imageMetaAlbumCandidateCount: 0,
  imageMetaAlbumParseElementTotal: 0,
  imageMetaSingleFallbackCount: 0,
};

export function resetMessengerImageMetaDiagnosticsCounts(): void {
  messengerImageMetaDiag.imageMetaCallCount = 0;
  messengerImageMetaDiag.imageMetaAlbumCandidateCount = 0;
  messengerImageMetaDiag.imageMetaAlbumParseElementTotal = 0;
  messengerImageMetaDiag.imageMetaSingleFallbackCount = 0;
}

export function peekMessengerImageMetaDiagnosticsCounts(): Readonly<typeof messengerImageMetaDiag> {
  return { ...messengerImageMetaDiag };
}

function t(v: unknown): string {
  return String(v ?? "").trim();
}

/** `isHttpOrBlobUrl` 호출마다 리터럴 정규식 재평가 방지 — 앨범 파싱 루프·단일 URL 판별 공통 */
const MESSENGER_IMAGE_HTTP_OR_HTTPS = /^https?:\/\//i;

function isHttpOrBlobUrl(u: string): boolean {
  return MESSENGER_IMAGE_HTTP_OR_HTTPS.test(u) || u.startsWith("blob:");
}

/** `trustedElementCount` 는 방금 `raw.length` 를 읽은 값과 동일할 때만 전달 — 중복 length 읽기 제거 */
/** `arrayAlreadyVerified` 가 true 이면 호출부에서 `Array.isArray(raw)` 가 이미 참임 — 파서 첫 줄 중복 판정 생략 */
function parseMessengerImageUrlArray(
  raw: unknown,
  trustedElementCount?: number,
  arrayAlreadyVerified?: boolean
): string[] {
  if (!arrayAlreadyVerified && !Array.isArray(raw)) return [];
  const arr: unknown[] = Array.isArray(raw) ? raw : (raw as unknown[]);
  /** verified + 숫자 trusted 는 상위에서 배열·길이 확정 — `Array.isArray` / `raw.length` 폴백 미참조 */
  const n =
    arrayAlreadyVerified === true && typeof trustedElementCount === "number"
      ? trustedElementCount
      : trustedElementCount !== undefined
        ? trustedElementCount
        : Array.isArray(raw)
          ? raw.length
          : 0;
  if (n === 0) return [];
  messengerImageMetaDiag.imageMetaAlbumParseElementTotal += n;
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const el = arr[i];
    /** primitive string 은 `String(el)` ToString 생략 — 그 외 타입은 `t` 와 동일 규칙 `String(el ?? "").trim()` */
    const u = typeof el === "string" ? el.trim() : String(el ?? "").trim();
    if (u && isHttpOrBlobUrl(u)) out.push(u);
  }
  return out;
}

function messengerImageSingleClientFields(
  metadata: Record<string, unknown>,
  content: string
): Partial<Pick<CommunityMessengerMessage, "imagePreviewUrl" | "imageOriginalUrl">> {
  const pv = t(metadata.image_preview_url ?? metadata.imagePreviewUrl);
  const ov = t(metadata.image_original_url ?? metadata.imageOriginalUrl);
  const pvOk = pv.length > 0 && isHttpOrBlobUrl(pv);
  const ovOk = ov.length > 0 && isHttpOrBlobUrl(ov);
  /** 메타에 유효 단일 URL이 둘 다 있으면 content 폴백 미사용. `content` 는 호출부에서 이미 trim 됨 — `t(content)` 이중 정규화 생략 */
  const c = pvOk && ovOk ? "" : content;
  const out: Partial<Pick<CommunityMessengerMessage, "imagePreviewUrl" | "imageOriginalUrl">> = {};
  if (pvOk) out.imagePreviewUrl = pv;
  else if (c) out.imagePreviewUrl = c;
  if (ovOk) out.imageOriginalUrl = ov;
  else if (c) out.imageOriginalUrl = c;
  return out;
}

/**
 * DB `metadata` + `content` 에서 채팅·라이트박스·복사용 이미지 URL 필드를 채운다.
 * (구 메시지: `image_thumb_urls` 없이 `image_urls` 만 있는 앨범도 지원)
 */
export function messengerImageClientFieldsFromMetadata(
  safeMt: CommunityMessengerMessage["messageType"],
  metadata: Record<string, unknown>,
  content: string
): Partial<
  Pick<
    CommunityMessengerMessage,
    "imageAlbumUrls" | "imageAlbumPreviewUrls" | "imageAlbumOriginalUrls" | "imagePreviewUrl" | "imageOriginalUrl"
  >
> {
  messengerImageMetaDiag.imageMetaCallCount += 1;
  if (safeMt !== "image") return {};

  const rawThumbs = metadata.image_thumb_urls ?? metadata.imageThumbUrls;
  const rawLegacy = metadata.image_urls ?? metadata.imageUrls;
  /** `(a && b) || (c && d)` 와 동일한 단락 순서로만 읽기 — 파싱 단계의 `raw.length` 재읽기 제거용 캐시 */
  let mayHaveAlbum = false;
  let thumbsIs = false;
  let thumbsLen = 0;
  let legacyIs = false;
  let legacyLen = 0;
  if (Array.isArray(rawThumbs)) {
    thumbsIs = true;
    thumbsLen = rawThumbs.length;
    if (thumbsLen >= 2) mayHaveAlbum = true;
  }
  if (!mayHaveAlbum) {
    if (Array.isArray(rawLegacy)) {
      legacyIs = true;
      legacyLen = rawLegacy.length;
      if (legacyLen >= 2) mayHaveAlbum = true;
    }
  }

  if (mayHaveAlbum) {
    messengerImageMetaDiag.imageMetaAlbumCandidateCount += 1;
  }

  /** 앨범 원본 배열이 없으면 thumbs·legacy 는 항상 [] — albumDisplay / 분기 계산 생략 */
  if (!mayHaveAlbum) {
    messengerImageMetaDiag.imageMetaSingleFallbackCount += 1;
    return messengerImageSingleClientFields(metadata, content);
  }

  const thumbs = thumbsIs
    ? parseMessengerImageUrlArray(rawThumbs, thumbsLen, true)
    : [];
  const legacy = legacyIs
    ? parseMessengerImageUrlArray(rawLegacy, legacyLen, true)
    : [];

  const tl = thumbs.length;
  const ll = legacy.length;
  const thumbsAlbum = tl >= 2;
  const legacyAlbum = ll >= 2;
  const albumDisplay = thumbsAlbum ? thumbs : legacyAlbum ? legacy : [];
  /** 위에서 이미 읽은 tl / ll 재사용 — `albumDisplay.length` 로 동일 배열 길이 재읽기 제거 */
  const albumEntryLen = thumbsAlbum ? tl : legacyAlbum ? ll : 0;
  if (albumEntryLen >= 2) {
    const rawPreviews = metadata.image_preview_urls ?? metadata.imagePreviewUrls;
    /** `albumPreview` 가 previews 배열을 쓰려면 길이 ≥2 — 원본이 2 미만이면 파싱해도 불가 */
    const rawPreviewsIs = Array.isArray(rawPreviews);
    const rawPreviewsLen = rawPreviewsIs ? rawPreviews.length : 0;
    const previews = rawPreviewsIs
      ? rawPreviewsLen >= 2
        ? parseMessengerImageUrlArray(rawPreviews, rawPreviewsLen, true)
        : []
      : [];
    /** `albumDisplay` 는 위와 동일 삼항(이 분기에선 `[]` 꼴 없음) — thumbs/legacy 재선택 제거 */
    const albumPreview = previews.length >= 2 ? previews : albumDisplay;
    const originals = legacyAlbum ? legacy : albumDisplay;
    return {
      imageAlbumUrls: albumDisplay,
      imageAlbumPreviewUrls: albumPreview,
      imageAlbumOriginalUrls: originals,
    };
  }

  messengerImageMetaDiag.imageMetaSingleFallbackCount += 1;
  return messengerImageSingleClientFields(metadata, content);
}
