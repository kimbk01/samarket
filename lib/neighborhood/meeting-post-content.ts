/** 생성 시 본문 앞에 붙던 메타 줄(구버전 글 호환) */
export function stripMeetupPostMetaFromContent(content: string): string {
  return content.replace(/^\[모임 유형 · [^\]\r\n]+\](?:\r?\n\s*)?/, "").replace(/^\s+/, "");
}
