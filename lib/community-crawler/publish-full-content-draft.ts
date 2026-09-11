/**
 * V2-1 FULL_CONTENT draft validation — operational Admin→DIBAY publish.
 * Allows dibay_body === source_body_normalized (no source_body_copy_forbidden).
 */

export function validateFullContentDraftForPublish(input: {
  draftTitle: string;
  draftContent: string;
}): { ok: true } | { ok: false; error: string } {
  const title = input.draftTitle.trim();
  const content = input.draftContent.trim();
  if (!title) return { ok: false, error: "title_required" };
  if (title.length < 2) return { ok: false, error: "title_too_short" };
  if (!content) return { ok: false, error: "dibay_body_required" };
  if (content.length < 20) return { ok: false, error: "dibay_body_too_short" };
  return { ok: true };
}
