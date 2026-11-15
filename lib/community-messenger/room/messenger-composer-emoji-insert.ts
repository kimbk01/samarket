/**
 * 이모지를 입력창 글의 커서 위치에 삽입한다(전송/PATCH 없음) — 수정 중·새 글 모두 (2026-11-16 이모지 바로 전송 정정).
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
