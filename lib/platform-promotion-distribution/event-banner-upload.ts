/**
 * EV-1 (광고 표면 연동 2026-11-04): 이벤트 배포 패널 배너 이미지 업로드.
 *
 * 새 업로드 API 를 만들지 않고 `/api/admin/feed-ads/upload` 를 재사용한다 (같은 ads 권한 키).
 *  - 인라인 배너(3:1 · 최소 1200×400) = purpose `feed_ad` — 피드 배너와 같은 검사
 *  - 히어로 배너(39:16 · 최소 1170×480) = purpose `event_hero_banner` — 배달 홈 히어로와 같은 검사
 * 거부 사유는 서버가 준 한국어 문구(message)를 우선 쓰고, 코드값은 화면에 내보내지 않는다.
 */
import type { EventBannerPresentation } from "@/lib/platform-promotion-distribution/banner-presentation";
import { feedAdUploadRejectMessage } from "@/lib/ads/feed-ad-upload-geometry";

export type EventBannerUploadPurpose = "feed_ad" | "event_hero_banner";

export function eventBannerUploadPurpose(presentation: EventBannerPresentation): EventBannerUploadPurpose {
  return presentation === "HERO_BANNER" ? "event_hero_banner" : "feed_ad";
}

export function eventBannerUploadErrorMessage(input: {
  error?: string | null;
  message?: string | null;
  lang: "ko" | "en";
}): string {
  const code = String(input.error ?? "").trim();
  if (input.lang === "ko" && input.message?.trim()) return input.message.trim();
  if (input.lang === "en" && (code === "aspect_mismatch" || code === "below_min_pixels")) {
    // 영어 화면: 히어로 문구는 서버 한국어만 있으므로 비율·크기 안내를 공용 문장으로
    return "This image does not match the banner size for this type. Check the ratio and minimum size.";
  }
  if (code === "image_decode_failed" || code === "invalid_dimensions") {
    return feedAdUploadRejectMessage("image_decode_failed", input.lang);
  }
  if (code === "file_too_large") {
    return input.lang === "en" ? "The file is too large (max 2MB)." : "파일 용량이 너무 큽니다. 최대 2MB 까지 올릴 수 있습니다.";
  }
  if (code === "invalid_type") {
    return input.lang === "en" ? "Only JPG, PNG, or WebP images are allowed." : "JPG·PNG·WebP 이미지만 올릴 수 있습니다.";
  }
  return input.lang === "en" ? "Could not upload the image." : "이미지를 올리지 못했습니다.";
}
