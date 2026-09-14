/**
 * ManilaSeoul SOURCE sections — only values proven from live site HTML (2026-09-14).
 * Do NOT invent Owner wish-list board names (핫토픽/정치/비자…) as ENABLED.
 */

export type ManilaSeoulSectionCapability = "available" | "needs_check" | "disabled";

export type ManilaSeoulSection = {
  /** bbs `tb` query value — SOURCE section id */
  tb: string;
  /** Operator label from live site evidence */
  label: string;
  capability: ManilaSeoulSectionCapability;
  /** Absolute list URL when collectable */
  listUrl: string | null;
  evidence: string;
};

const LIST_BASE = "http://manilaseoul.co.kr/bbs_list.php";

/**
 * Live homepage evidence:
 * - board_free → anchor text "자유게시판" (list) — available, NOT default
 * - board_monthly → title "PDF월간발행" (list)
 * - board_reader → title "독자투고" (list)
 * - board_article / board_gudoc / board_journalist → regist-only forms, not list collect
 */
export const MANILASEOUL_SECTIONS: readonly ManilaSeoulSection[] = [
  {
    tb: "board_reader",
    label: "독자투고",
    capability: "needs_check",
    listUrl: `${LIST_BASE}?tb=board_reader`,
    evidence: "list links exist; live discover returned empty documents 2026-09-14 — catalog 확인 필요",
  },
  {
    tb: "board_monthly",
    label: "PDF월간발행",
    capability: "needs_check",
    listUrl: `${LIST_BASE}?tb=board_monthly`,
    evidence: "Live list is PDF file links, not bbs_detail article units — catalog 확인 필요",
  },
  {
    tb: "board_free",
    label: "자유게시판",
    /** Technically parseable — NOT Owner catalog / not recommended. */
    capability: "available",
    listUrl: `${LIST_BASE}?tb=board_free`,
    evidence: "homepage h3 text 자유게시판 — ADAPTER ONLY; catalog eligibility = NO",
  },
  {
    tb: "board_article",
    label: "기사제보",
    capability: "disabled",
    listUrl: null,
    evidence: "bbs_regist.php only — not a collectable list board",
  },
  {
    tb: "board_gudoc",
    label: "정기구독신청",
    capability: "disabled",
    listUrl: null,
    evidence: "bbs_regist.php only",
  },
  {
    tb: "board_journalist",
    label: "기자회원신청",
    capability: "disabled",
    listUrl: null,
    evidence: "popup regist only",
  },
] as const;

/** Owner wish-list names not found as live tb= — catalog NEEDS CHECK only. */
export const MANILASEOUL_OWNER_WISHLIST_NEEDS_CHECK = [
  "필리핀 핫토픽",
  "필리핀 정치",
  "필리핀 경제",
  "필리핀 생활/문화",
  "여행",
  "비자",
  "교육",
] as const;

export function resolveManilaSeoulTb(sourceUrl: string): string | null {
  try {
    const tb = new URL(sourceUrl).searchParams.get("tb");
    const v = String(tb ?? "").trim();
    return v || null;
  } catch {
    return null;
  }
}

export function getManilaSeoulSection(tb: string): ManilaSeoulSection | null {
  return MANILASEOUL_SECTIONS.find((s) => s.tb === tb) ?? null;
}

export function listCollectableManilaSeoulSections(): ManilaSeoulSection[] {
  // Owner product: never recommend 자유게시판 even if adapter can parse it.
  return MANILASEOUL_SECTIONS.filter(
    (s) => s.capability === "available" && s.listUrl && s.tb !== "board_free"
  );
}

/** Adapter technical capability — includes board_free. Catalog must not use this for recommendations. */
export function listAdapterCapableManilaSeoulSections(): ManilaSeoulSection[] {
  return MANILASEOUL_SECTIONS.filter((s) => s.capability === "available" && s.listUrl);
}
