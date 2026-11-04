/**
 * FA-3 (광고 표면 연동 2026-11-04): 피드 배너 업로드 기하 검사 — 3:1 · 최소 1200×400.
 *
 * 배달 배너 업로드(`/api/admin/delivery-ads/upload-banner-image`)와 같은 판정 함수를 재사용한다:
 *  - 비율 = `creativeMatchesInventoryAspect` (허용 오차 8%)
 *  - 거부 문구 = `bannerGeometryRejectMessage` (한국어·코드값 노출 없음)
 * 관리자 업로드(`/api/admin/feed-ads/upload`)·회원 신청 업로드(`/api/me/feed-ad-requests/upload`)
 * 와 회원 화면 사전 검사(`checkFeedAdMemberImageFile`)가 이 파일 하나를 쓴다.
 */
import { creativeMatchesInventoryAspect } from "@/lib/stores/advertising/delivery-ad-creative";
import type { BannerCreativePixelGuide } from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import {
  bannerGeometryRejectMessage,
  type BannerCreativeGeometryError,
} from "@/lib/stores/advertising/validate-banner-creative-geometry";
import {
  FEED_AD_MEDIA_ASPECT_H,
  FEED_AD_MEDIA_ASPECT_W,
  FEED_AD_RECOMMENDED_UPLOAD,
} from "@/lib/ads/feed-ad-geometry";

/** 피드 배너 업로드 규격 — 배달 배너 픽셀 안내와 같은 모양(배달 지면 키만 없음). */
export const FEED_AD_UPLOAD_PIXEL_GUIDE: Omit<BannerCreativePixelGuide, "inventoryKey"> = {
  ratioLabel: FEED_AD_RECOMMENDED_UPLOAD.aspectLabel,
  recommendedWidth: FEED_AD_RECOMMENDED_UPLOAD.standardWidthPx,
  recommendedHeight: FEED_AD_RECOMMENDED_UPLOAD.standardHeightPx,
  minWidth: FEED_AD_RECOMMENDED_UPLOAD.minWidthPx,
  minHeight: FEED_AD_RECOMMENDED_UPLOAD.minHeightPx,
  safeAreaNoteKo: "중요 텍스트·로고는 중앙 80% 안쪽에 배치하세요.",
  safeAreaNoteEn: "Keep critical text/logo inside the center 80% safe area.",
  objectFit: "cover",
};

export type FeedAdUploadGeometryError = Exclude<BannerCreativeGeometryError, "invalid_inventory">;

export type FeedAdUploadGeometryResult =
  | { ok: true }
  | { ok: false; error: FeedAdUploadGeometryError };

export function validateFeedAdUploadGeometry(input: {
  width: number;
  height: number;
}): FeedAdUploadGeometryResult {
  if (!(input.width > 0) || !(input.height > 0)) return { ok: false, error: "invalid_dimensions" };
  if (
    !creativeMatchesInventoryAspect(input.width, input.height, {
      aspectRatioWidth: FEED_AD_MEDIA_ASPECT_W,
      aspectRatioHeight: FEED_AD_MEDIA_ASPECT_H,
    })
  ) {
    return { ok: false, error: "aspect_mismatch" };
  }
  if (
    input.width < FEED_AD_UPLOAD_PIXEL_GUIDE.minWidth ||
    input.height < FEED_AD_UPLOAD_PIXEL_GUIDE.minHeight
  ) {
    return { ok: false, error: "below_min_pixels" };
  }
  return { ok: true };
}

/** 거부 사유 문구 (한국어 기본) — 배달 배너와 같은 문장틀. */
export function feedAdUploadRejectMessage(
  error: FeedAdUploadGeometryError | "image_decode_failed",
  lang: "ko" | "en" = "ko"
): string {
  if (error === "image_decode_failed" || error === "invalid_dimensions") {
    return lang === "en"
      ? "Could not read this image. Upload a JPG, PNG, or WebP file."
      : "이미지를 읽지 못했습니다. JPG·PNG·WebP 파일을 올려 주세요.";
  }
  return bannerGeometryRejectMessage({
    error,
    // 문구 함수는 비율·크기 값만 읽는다 (지면 키 미사용)
    guide: FEED_AD_UPLOAD_PIXEL_GUIDE as BannerCreativePixelGuide,
    lang,
    placementLabel: lang === "en" ? "feed banner" : "피드 배너",
  });
}
