/**
 * Operator CMS — classify Intro documents for list surfaces.
 * QA fixtures stay in DB; they are hidden from the default Operator list.
 */

export type IntroDataClass = "OWNER" | "QA" | "SYSTEM_TEST" | "CURRENT_LIVE";

const QA_TITLE_PATTERNS: RegExp[] = [
  /^DIBAY-13-V\d/i,
  /^DIBAY-13-V[0-9A-Z-]+/i,
  /^CUTA-BROWSER-QA/i,
  /^409RCV/i,
  /OWNER-MARKER/i,
  /^QA[-_]/i,
  /^TEST[-_]/i,
  /BROWSER-QA/i,
  /-QA-/i,
];

const SYSTEM_TEST_PATTERNS: RegExp[] = [
  /^SYSTEM[-_]/i,
  /^SYS[-_]TEST/i,
  /__FIXTURE__/i,
];

export function classifyIntroTitle(title: string): Exclude<IntroDataClass, "CURRENT_LIVE"> {
  const t = (title || "").trim();
  if (!t) return "OWNER";
  for (const re of SYSTEM_TEST_PATTERNS) {
    if (re.test(t)) return "SYSTEM_TEST";
  }
  for (const re of QA_TITLE_PATTERNS) {
    if (re.test(t)) return "QA";
  }
  return "OWNER";
}

/** Default Operator list: OWNER only (+ CURRENT_LIVE always shown). */
export function isOperatorVisibleTitle(
  title: string,
  opts?: { includeQa?: boolean; isLive?: boolean },
): boolean {
  if (opts?.isLive) return true;
  const cls = classifyIntroTitle(title);
  if (cls === "OWNER") return true;
  if (opts?.includeQa && (cls === "QA" || cls === "SYSTEM_TEST")) return true;
  return false;
}
