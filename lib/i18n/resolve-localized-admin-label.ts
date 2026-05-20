import type { AppLanguageCode } from "./config";

/** 어드민·taxonomy·피드 주제 등 UI 표시명 — 게시글 본문 아님 */
export function resolveLocalizedAdminLabel(
  lang: AppLanguageCode,
  koName: string,
  enName?: string | null
): string {
  const ko = koName.trim();
  if (lang === "en") {
    const en = (enName ?? "").trim();
    if (en) return en;
  }
  return ko;
}
