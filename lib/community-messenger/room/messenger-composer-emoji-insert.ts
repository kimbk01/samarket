/**
 * K-4 — 수정 모드에서 이모지를 draft에 삽입 (전송/PATCH 없음).
 */

export function insertEmojiIntoComposerText(input: {
  current: string;
  emoji: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
}): { next: string; caret: number } {
  const emoji = String(input.emoji ?? "");
  const current = String(input.current ?? "");
  const start =
    typeof input.selectionStart === "number" && Number.isFinite(input.selectionStart)
      ? Math.max(0, Math.min(current.length, Math.floor(input.selectionStart)))
      : current.length;
  const endRaw =
    typeof input.selectionEnd === "number" && Number.isFinite(input.selectionEnd)
      ? Math.floor(input.selectionEnd)
      : start;
  const end = Math.max(start, Math.min(current.length, endRaw));
  const next = `${current.slice(0, start)}${emoji}${current.slice(end)}`;
  return { next, caret: start + emoji.length };
}
