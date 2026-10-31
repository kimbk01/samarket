import { buildPostImageDetailFetchUrl, buildPostImageThumbnailFetchUrl } from "@/lib/media/post-image-transform";

/**
 * 커뮤니티 글 상세 사진 표시 SSOT (D1·D5·D13).
 *
 * - 화면 요청 주소: DIBAY `post-images` 원본이면 업로드 때 만든 파생본(.detail 1280 · .feed 640 정사각),
 *   외부·GIF·파생본 경로를 만들 수 없는 주소는 원본 그대로.
 * - 파생본이 없는 예전 파일(운영 PNG 일부 등)은 `<img>` 오류 시 원본으로 1회 재시도한다 — 네트워크 확인 없이.
 * - 원본 비율 정보는 저장돼 있지 않다 → 로드 전에는 고정 자리(`POST_IMAGE_PLACEHOLDER_ASPECT`)만 잡고,
 *   로드 후 실제 비율로 그린다. 자리 비율을 원본 비율로 취급하지 않는다.
 */

/** 로드 전 자리 비율(가로/세로) — 원본 비율이 아님 */
export const POST_IMAGE_PLACEHOLDER_ASPECT = "4 / 3";

/** 본문 사진 한 장 최대 높이 — 회원 글·가져온 글·모임 글 공통 */
export const POST_BODY_IMAGE_MAX_HEIGHT = "min(75vh, 640px)";

export type PostImageSurface = "detail" | "cell";

export type PostImageSources = {
  /** 처음 요청할 주소 */
  primary: string;
  /** primary 실패 시 1회 재시도할 원본(같으면 재시도 없음) */
  original: string;
};

export function resolvePostImageSources(raw: string, surface: PostImageSurface): PostImageSources {
  const original = (raw ?? "").trim();
  const primary =
    surface === "cell"
      ? buildPostImageThumbnailFetchUrl(original, 640) ?? original
      : buildPostImageDetailFetchUrl(original) ?? original;
  return { primary: primary || original, original };
}

/**
 * 페이스북형 첨부 사진 격자 배치 — 칸 수와 각 칸 모양.
 * 1장은 격자가 아니라 원본 비율 한 장(`single`).
 */
export type PostImageGridCell = { index: number; span: "full" | "half" | "third"; shape: "wide" | "square" };

export type PostImageGridLayout =
  | { kind: "single" }
  | { kind: "grid"; cells: PostImageGridCell[]; hiddenCount: number };

export const POST_IMAGE_GRID_MAX_CELLS = 5;

export function postImageGridLayout(count: number): PostImageGridLayout {
  if (count <= 1) return { kind: "single" };
  if (count === 2) {
    return {
      kind: "grid",
      cells: [0, 1].map((index) => ({ index, span: "half" as const, shape: "square" as const })),
      hiddenCount: 0,
    };
  }
  if (count === 3) {
    return {
      kind: "grid",
      cells: [
        { index: 0, span: "full", shape: "wide" },
        { index: 1, span: "half", shape: "square" },
        { index: 2, span: "half", shape: "square" },
      ],
      hiddenCount: 0,
    };
  }
  if (count === 4) {
    return {
      kind: "grid",
      cells: [0, 1, 2, 3].map((index) => ({ index, span: "half" as const, shape: "square" as const })),
      hiddenCount: 0,
    };
  }
  return {
    kind: "grid",
    cells: [
      { index: 0, span: "half", shape: "square" },
      { index: 1, span: "half", shape: "square" },
      { index: 2, span: "third", shape: "square" },
      { index: 3, span: "third", shape: "square" },
      { index: 4, span: "third", shape: "square" },
    ],
    hiddenCount: count - POST_IMAGE_GRID_MAX_CELLS,
  };
}

/** 사진 뷰어 화면용 주소 — `.detail`(1280) 파생본, 실패 시 뷰어가 원본으로 재시도 */
export function communityViewerDisplayUrl(url: string): string {
  return resolvePostImageSources(url, "detail").primary;
}
