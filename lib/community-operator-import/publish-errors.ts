/**
 * Map RPC exceptions to operator-facing codes.
 * `message` 도 코드만 담는다(서버 한국어 문장 금지 — 언어 재감사 2026-11-27). 관리자 화면은
 * `components/admin/community/external-import/api.ts` `importErrorText` 가 코드로 문구를 고른다.
 */
export function mapPublishRpcError(message: string): { code: string; message: string } {
  const m = String(message || "");
  const coded = (code: string) => ({ code, message: code });
  if (m.includes("published_under_other_key")) return coded("published_under_other_key");
  if (m.includes("already_published")) return coded("already_published");
  if (m.includes("not_published")) return coded("not_published");
  if (m.includes("post_missing")) return coded("post_missing");
  if (m.includes("empty_content")) return coded("empty_content");
  if (m.includes("Could not find the function") || m.includes("does not exist")) {
    return coded("publish_rpc_missing");
  }
  if (m) console.error("[community-operator-import] publish rpc", m);
  return coded("publish_failed");
}
