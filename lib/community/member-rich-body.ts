import {
  contentFromRichBlocks,
  richBlocksNeedStorage,
  sanitizeMemberContentBlocks,
  type ImportedContentBlock,
} from "@/lib/community/imported-content-blocks";

/**
 * 회원 글 본문 확정 (POST·PATCH 공용 — Owner 승인 ① 2026-10-31).
 * - `contentBlocks` 를 보내면 서버가 정제하고 `content`(평문 + 사진 줄)를 **블록에서 만든다** — 클라이언트 `content` 무시(이중 원천 방지).
 * - 서식이 없으면(문단·사진뿐) 블록은 저장하지 않는다(`contentBlocks: null`) — 평문이 원천.
 * - `contentBlocks` 를 안 보내면 예전 계약 그대로(`content` 평문, 블록 null).
 * - 목록 요약문(`summary`)은 DB 트리거 `community_posts_summary_from_content` 가 저장 때 정한다(사진 설명 줄 제외 ·
 *   migration 20271102010000). 앱에서 따로 계산하지 않는다.
 */
export function resolveMemberRichBody(input: {
  content: unknown;
  contentBlocks: unknown;
}): { content: string; contentBlocks: ImportedContentBlock[] | null } {
  if (Array.isArray(input.contentBlocks)) {
    const blocks = sanitizeMemberContentBlocks(input.contentBlocks);
    const content = contentFromRichBlocks(blocks);
    return { content, contentBlocks: blocks.length && richBlocksNeedStorage(blocks) ? blocks : null };
  }
  return { content: String(input.content ?? "").trim(), contentBlocks: null };
}
