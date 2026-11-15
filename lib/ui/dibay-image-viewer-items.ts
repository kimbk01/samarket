import { originalImageUrl } from "@/lib/community/post-media-embed";

/** 공용 사진 뷰어(`components/common/media/DibayImageViewer.tsx`) 입력 항목 — 뷰어를 늦게 불러오는 화면도 쓰도록 분리. */
export type DibayImageViewerItem = {
  /** 화면용 주소. 실패하면 `original` 로 1회 자동 재시도. */
  display: string;
  /** 「원본」 보기·저장 주소. */
  original: string;
  /** 이미 화면에 그려진 작은 사진(말풍선 썸네일 등) — 화면용을 받는 동안 같은 자리에 먼저 그린다. */
  placeholder?: string;
};

/** 주소 목록 → 뷰어 항목. 원본은 `originalImageUrl`(Storage render → object), 화면용은 `displayUrlFor` 또는 원본. */
export function dibayImageViewerItemsFromUrls(
  urls: string[],
  displayUrlFor?: (url: string) => string,
): DibayImageViewerItem[] {
  return urls.map((u) => ({ display: displayUrlFor ? displayUrlFor(u) : u, original: originalImageUrl(u) }));
}
