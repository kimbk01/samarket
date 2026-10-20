/**
 * UI/UX/CTA 표준 래칫 규칙 (수정 계획 2-8) — 메뉴 화면 래칫과 전수 래칫이 같은 규칙을 쓴다.
 * 테스트 전용 (node fs 없이 문자열만 검사).
 */
import { ADMIN_CTA_FORBIDDEN, ADMIN_CTA_FORBIDDEN_EXACT } from "@/lib/admin/ui-standard/admin-cta";

const ALLOWED_PX = new Set(["12", "13", "14", "16", "20"]);

export const ADMIN_UI_STANDARD_RULES: Record<string, (src: string) => string[]> = {
  /** 2-2 버튼 — `<button>` 직접 사용 금지 (AdminActionButton·AdminChipButton·AdminTabs 등) */
  rawButton: (s) => s.match(/<button\b/g) ?? [],
  /** 2-3 확인창 — 앱 공용 대화상자·브라우저 대화상자 직접 호출 금지 (confirmAdminAction · useAdminConfirmDialog) */
  directConfirm: (s) => s.match(/\b(?:dibayConfirm|dibayPrompt|window\.confirm|window\.prompt|window\.alert)\(/g) ?? [],
  /** 2-7 시간·숫자 — 기기 로캘·시간대 포맷 금지 (formatAdminManilaDateTime · formatAdminNumber · formatAdminPhp) */
  localeFormat: (s) => s.match(/\.toLocale(?:String|DateString|TimeString)\(|\bIntl\.(?:DateTimeFormat|NumberFormat)\b/g) ?? [],
  /** 2-7 색 — Tailwind 원색·hex 금지 (sam-* · admin-console 변수) */
  rawColor: (s) =>
    s.match(
      /\b(?:text|bg|border|ring|divide|outline|from|to|via|fill|stroke|accent|decoration|placeholder)-(?:gray|slate|zinc|neutral|stone|red|blue|green|amber|emerald|yellow|orange|indigo|purple|pink|rose|sky|teal|cyan|lime|violet|fuchsia)-\d{2,3}\b|(?<![\w-])\[?#[0-9a-fA-F]{6}\b/g
    ) ?? [],
  /** 2-7 글자 크기 — 12·13·14·16·20 만 */
  fontSize: (s) => [
    ...[...s.matchAll(/\btext-\[(\d+)px\]/g)].filter((m) => !ALLOWED_PX.has(m[1])).map((m) => m[0]),
    ...(s.match(/\btext-(?:lg|2xl|3xl|4xl|5xl)\b/g) ?? []),
  ],
  /** 2-1 CTA 어휘 — 금지 단어 */
  forbiddenCta: (s) => [
    ...ADMIN_CTA_FORBIDDEN.flatMap((f) => (s.includes(f.word) ? [`${f.word}→${f.use}`] : [])),
    ...ADMIN_CTA_FORBIDDEN_EXACT.flatMap((f) =>
      new RegExp(`(?:>\\s*${f.word}\\s*<|["'\`]${f.word}["'\`])`).test(s) ? [`${f.word}→${f.use}`] : []
    ),
  ],
};
