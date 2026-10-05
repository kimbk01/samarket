/** Map RPC exceptions to operator-facing codes. */
export function mapPublishRpcError(message: string): { code: string; message: string } {
  const m = String(message || "");
  if (m.includes("published_under_other_key")) {
    return { code: "published_under_other_key", message: "같은 원문이 이미 커뮤니티에 게시되어 있습니다 (이전 수집 또는 다른 게시판). 새로 게시하지 않습니다." };
  }
  if (m.includes("already_published")) return { code: "already_published", message: "이미 게시된 글입니다. 「업데이트」를 사용하세요." };
  if (m.includes("not_published")) return { code: "not_published", message: "아직 게시되지 않은 글입니다. 「게시」를 사용하세요." };
  if (m.includes("post_missing")) return { code: "post_missing", message: "연결된 게시물이 없거나 수집 게시물이 아닙니다." };
  if (m.includes("empty_content")) return { code: "empty_content", message: "제목과 본문이 필요합니다." };
  if (m.includes("Could not find the function") || m.includes("does not exist")) {
    return { code: "publish_rpc_missing", message: "게시 DB 함수가 아직 적용되지 않았습니다 (마이그레이션 대기)." };
  }
  return { code: "publish_failed", message: m || "게시에 실패했습니다." };
}
