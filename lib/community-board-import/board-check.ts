import type { BoardCheckStatus } from "@/lib/community-board-import/product-lock";
import type { BoardRegistrationDuplicateResult } from "@/lib/community-board-import/source-board-identity";

/**
 * [게시판 확인] — capability gate for unknown SOURCE URLs.
 * Not an article ops status.
 * Must also surface existing registration duplicate (duplicate ≠ failure).
 */

export type BoardCheckSampleCard = {
  thumbnailUrl: string | null;
  title: string;
  bodyPreview: string;
  sourceAuthor: string | null;
  sourceDate: string | null;
};

export type BoardCheckCapability = {
  reachable: boolean;
  discoveredCount: number;
  titleOk: boolean;
  bodyOk: boolean;
  imageOk: boolean;
  validImageCount: number;
};

export type BoardCheckReason = {
  code: string;
  message: string;
};

export type BoardCheckResult = {
  status: BoardCheckStatus;
  capability: BoardCheckCapability;
  samples: BoardCheckSampleCard[];
  reasons: BoardCheckReason[];
  /** Existing SOURCE BOARD registration — duplicate ≠ failure. */
  registration: BoardRegistrationDuplicateResult;
  /** Always 0 Community writes from board check. */
  communityPostsWrite: 0;
};

export function resolveBoardCheckStatus(
  capability: BoardCheckCapability,
  blockedReason?: BoardCheckReason | null
): { status: BoardCheckStatus; reasons: BoardCheckReason[] } {
  if (blockedReason) {
    return { status: "UNSUPPORTED", reasons: [blockedReason] };
  }
  if (!capability.reachable) {
    return {
      status: "UNSUPPORTED",
      reasons: [{ code: "UNREACHABLE", message: "게시판 URL에 접속할 수 없습니다." }],
    };
  }
  if (capability.discoveredCount <= 0) {
    return {
      status: "UNSUPPORTED",
      reasons: [
        {
          code: "ARTICLE_DISCOVERY_FAILED",
          message: "게시글 링크를 발견하지 못했습니다.",
        },
      ],
    };
  }
  if (!capability.titleOk || !capability.bodyOk) {
    return {
      status: "UNSUPPORTED",
      reasons: [
        {
          code: "CONTENT_EXTRACT_FAILED",
          message: "제목 또는 유효 본문을 추출하지 못했습니다.",
        },
      ],
    };
  }
  if (!capability.imageOk) {
    return {
      status: "PARTIAL",
      reasons: [
        {
          code: "IMAGES_PARTIAL",
          message: `이미지는 ${capability.validImageCount}건만 유효합니다.`,
        },
      ],
    };
  }
  return {
    status: "READY",
    reasons: [
      {
        code: "READY",
        message: `게시글 ${capability.discoveredCount}건 발견 · 제목/본문/이미지 OK`,
      },
    ],
  };
}
