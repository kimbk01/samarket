"use client";

/** 조회·공감·댓글 작은 메타 줄 (카드/상세 공통) */
export function CommunityMetaBar({
  viewCount,
  likeCount,
  commentCount,
}: {
  viewCount: number;
  likeCount: number;
  commentCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-3 text-[12px] text-gray-500">
      <span>조회 {viewCount}</span>
      <span>공감 {likeCount}</span>
      <span>댓글 {commentCount}</span>
    </div>
  );
}
