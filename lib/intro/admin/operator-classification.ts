/**
 * Operator CMS — Intro document classification for list surfaces.
 *
 * **Authority:** `app_intro_documents.content_class` (OWNER | QA | SYSTEM).
 * Operator list visibility reads the column via `isOperatorVisibleContentClass`.
 *
 * `classifyIntroTitle` is a one-time backfill helper only (migration / repair for rows
 * still at default OWNER with QA/SYSTEM fixture titles). Do not use it as list authority.
 */

export type IntroDataClass = "OWNER" | "QA" | "SYSTEM";

const QA_TITLE_PATTERNS: RegExp[] = [
  /^DIBAY-13-V\d/i,
  /^DIBAY-13-V[0-9A-Z-]+/i,
  /^DIBAY-13-FINAL/i,
  /^CUTA-BROWSER-QA/i,
  /^CUT\s*A\b/i,
  /\bProve\b/i,
  /^409RCV/i,
  /OWNER-MARKER/i,
  /^QA[-_]/i,
  /^TEST[-_]/i,
  /BROWSER-QA/i,
  /-QA-/i,
];

const SYSTEM_TITLE_PATTERNS: RegExp[] = [
  /^SYSTEM[-_]/i,
  /^SYS[-_]TEST/i,
  /__FIXTURE__/i,
];

const INTRO_CONTENT_CLASS_SET = new Set<string>(["OWNER", "QA", "SYSTEM"]);

export function normalizeIntroContentClass(
  value: string | null | undefined,
): IntroDataClass {
  const v = (value ?? "").trim().toUpperCase();
  if (INTRO_CONTENT_CLASS_SET.has(v)) return v as IntroDataClass;
  return "OWNER";
}

/**
 * One-time backfill helper — maps legacy fixture titles to content_class values.
 * Not used for Operator list classification after DB backfill.
 */
export function classifyIntroTitle(title: string): IntroDataClass {
  const t = (title || "").trim();
  if (!t) return "OWNER";
  for (const re of SYSTEM_TITLE_PATTERNS) {
    if (re.test(t)) return "SYSTEM";
  }
  for (const re of QA_TITLE_PATTERNS) {
    if (re.test(t)) return "QA";
  }
  return "OWNER";
}

/** Default Operator list: OWNER only (+ isLive docs always shown). */
export function isOperatorVisibleContentClass(
  contentClass: string | null | undefined,
  opts?: { includeQa?: boolean; isLive?: boolean },
): boolean {
  if (opts?.isLive) return true;
  const cls = normalizeIntroContentClass(contentClass);
  if (cls === "OWNER") return true;
  if (opts?.includeQa && (cls === "QA" || cls === "SYSTEM")) return true;
  return false;
}
