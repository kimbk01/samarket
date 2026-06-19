/** @mention token parser — Kakao/Telegram style @nickname in group messages. */

const MENTION_TOKEN_RE = /@([\p{L}\p{N}_-]{1,32})/gu;

export type ParsedMentionToken = {
  raw: string;
  nickname: string;
  start: number;
  end: number;
};

export function parseMentionTokens(content: string): ParsedMentionToken[] {
  const text = String(content ?? "");
  const out: ParsedMentionToken[] = [];
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    const raw = match[0] ?? "";
    const nickname = (match[1] ?? "").trim();
    if (!nickname) continue;
    const start = match.index ?? 0;
    out.push({ raw, nickname, start, end: start + raw.length });
  }
  return out;
}

export function contentHasMentionSyntax(content: string): boolean {
  return parseMentionTokens(content).length > 0;
}

export function stripMentionTokensForPreview(content: string): string {
  return String(content ?? "").replace(MENTION_TOKEN_RE, "").replace(/\s+/g, " ").trim();
}
