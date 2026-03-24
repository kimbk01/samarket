/**
 * 매장 신청 연락: 신규는 `kakao_id` 컬럼, 구버전은 description 끝의 `카카오톡: …` 블록.
 */
export function splitStoreDescriptionAndKakao(
  description: string | null | undefined,
  kakaoIdColumn: string | null | undefined
): { intro: string | null; kakao: string | null } {
  const col = (kakaoIdColumn ?? "").trim();
  if (col) {
    const intro = (description ?? "").trim() || null;
    return { intro, kakao: col };
  }

  const raw = (description ?? "").trim();
  if (!raw) return { intro: null, kakao: null };

  const parts = raw.split(/\n\n/);
  const last = parts[parts.length - 1]?.trim() ?? "";
  const kakaoMatch = last.match(/^카카오톡:\s*(.+)$/);
  if (kakaoMatch) {
    const kakao = kakaoMatch[1]?.trim() || null;
    const introParts = parts.slice(0, -1);
    const intro = introParts.join("\n\n").trim() || null;
    return { intro, kakao };
  }
  return { intro: raw, kakao: null };
}
