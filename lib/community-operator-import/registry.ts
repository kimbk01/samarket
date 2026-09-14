/**
 * Bounded VERIFIED operator-import registry.
 * Not OLD crawler / country→site→job architecture.
 * BLOCKED / NOT_PROVEN sources are intentionally absent from the active list.
 */

export type OperatorSourceEngine = "gnuboard" | "wordpress_rest" | "rss_atom";

export type OperatorBoardCategory =
  | "travel"
  | "food"
  | "news"
  | "living"
  | "culture"
  | "local"
  | "golf"
  | "history"
  | "immigration"
  | "government"
  | "finance"
  | "safety";

export type VerifiedOperatorSource = {
  id: string;
  displayName: string;
  baseUrl: string;
  engine: OperatorSourceEngine;
  status: "verified";
  priority: "P0" | "P1" | "P2";
};

export type VerifiedOperatorBoard = {
  sourceId: string;
  boardId: string;
  displayName: string;
  shortLabel: string;
  category: OperatorBoardCategory;
  /** Gnuboard bo_table / WP category id / RSS feed path or absolute URL */
  engineKey: string;
  enabled: true;
  verification: "verified";
};

export const VERIFIED_SOURCES: readonly VerifiedOperatorSource[] = [
  {
    id: "philsamo",
    displayName: "필사모",
    baseUrl: "https://philsamo.com",
    engine: "gnuboard",
    status: "verified",
    priority: "P0",
  },
  {
    id: "hellocebuph",
    displayName: "Hello Cebu",
    baseUrl: "https://hellocebuph.com",
    engine: "wordpress_rest",
    status: "verified",
    priority: "P0",
  },
  {
    id: "immigration",
    displayName: "Bureau of Immigration",
    baseUrl: "https://immigration.gov.ph",
    engine: "wordpress_rest",
    status: "verified",
    priority: "P0",
  },
  {
    id: "officialgazette",
    displayName: "Official Gazette",
    baseUrl: "https://www.officialgazette.gov.ph",
    engine: "rss_atom",
    status: "verified",
    priority: "P0",
  },
  {
    id: "philstar",
    displayName: "Philstar",
    baseUrl: "https://www.philstar.com",
    engine: "rss_atom",
    status: "verified",
    priority: "P0",
  },
  {
    id: "aswangproject",
    displayName: "Aswang Project",
    baseUrl: "https://www.aswangproject.com",
    engine: "wordpress_rest",
    status: "verified",
    priority: "P1",
  },
  {
    id: "golfph",
    displayName: "GolfPH",
    baseUrl: "https://golfph.com",
    engine: "wordpress_rest",
    status: "verified",
    priority: "P1",
  },
  {
    id: "primer",
    displayName: "Philippine Primer",
    baseUrl: "https://primer.com.ph",
    engine: "wordpress_rest",
    status: "verified",
    priority: "P1",
  },
  {
    id: "rappler",
    displayName: "Rappler",
    baseUrl: "https://www.rappler.com",
    engine: "rss_atom",
    status: "verified",
    priority: "P0",
  },
  {
    id: "inquirer",
    displayName: "INQUIRER.net",
    baseUrl: "https://www.inquirer.net",
    engine: "rss_atom",
    status: "verified",
    priority: "P0",
  },
  {
    id: "dof",
    displayName: "Department of Finance",
    baseUrl: "https://www.dof.gov.ph",
    engine: "rss_atom",
    status: "verified",
    priority: "P2",
  },
] as const;

export const VERIFIED_BOARDS: readonly VerifiedOperatorBoard[] = [
  // philsamo
  { sourceId: "philsamo", boardId: "travel", displayName: "필리핀 여행", shortLabel: "여행", category: "travel", engineKey: "travel", enabled: true, verification: "verified" },
  { sourceId: "philsamo", boardId: "food", displayName: "맛집·음식", shortLabel: "맛집", category: "food", engineKey: "food", enabled: true, verification: "verified" },
  { sourceId: "philsamo", boardId: "news", displayName: "필리핀 뉴스", shortLabel: "뉴스", category: "news", engineKey: "news", enabled: true, verification: "verified" },
  { sourceId: "philsamo", boardId: "free", displayName: "자유게시판", shortLabel: "자유", category: "living", engineKey: "free", enabled: true, verification: "verified" },
  // hello cebu
  { sourceId: "hellocebuph", boardId: "destinations", displayName: "DESTINATIONS", shortLabel: "여행지", category: "travel", engineKey: "18", enabled: true, verification: "verified" },
  { sourceId: "hellocebuph", boardId: "guides", displayName: "GUIDES", shortLabel: "가이드", category: "travel", engineKey: "30", enabled: true, verification: "verified" },
  { sourceId: "hellocebuph", boardId: "beaches", displayName: "Beaches", shortLabel: "해변", category: "travel", engineKey: "7", enabled: true, verification: "verified" },
  { sourceId: "hellocebuph", boardId: "cebu-eats", displayName: "CEBU EATS", shortLabel: "음식", category: "food", engineKey: "19", enabled: true, verification: "verified" },
  { sourceId: "hellocebuph", boardId: "culture", displayName: "Culture", shortLabel: "문화", category: "culture", engineKey: "78", enabled: true, verification: "verified" },
  { sourceId: "hellocebuph", boardId: "news-and-events", displayName: "NEWS & EVENTS", shortLabel: "뉴스", category: "news", engineKey: "36", enabled: true, verification: "verified" },
  // immigration
  { sourceId: "immigration", boardId: "advisory", displayName: "Advisory", shortLabel: "공지", category: "immigration", engineKey: "9", enabled: true, verification: "verified" },
  { sourceId: "immigration", boardId: "press-release", displayName: "Press Release", shortLabel: "보도", category: "immigration", engineKey: "3", enabled: true, verification: "verified" },
  { sourceId: "immigration", boardId: "news-and-updates", displayName: "News and Updates", shortLabel: "뉴스", category: "news", engineKey: "15", enabled: true, verification: "verified" },
  // official gazette
  { sourceId: "officialgazette", boardId: "feed", displayName: "Official Gazette Feed", shortLabel: "공보", category: "government", engineKey: "/feed/", enabled: true, verification: "verified" },
  // philstar
  { sourceId: "philstar", boardId: "headlines", displayName: "Headlines", shortLabel: "헤드라인", category: "news", engineKey: "/rss/headlines", enabled: true, verification: "verified" },
  // aswang
  { sourceId: "aswangproject", boardId: "philippine-mythology", displayName: "Philippine Mythology", shortLabel: "신화", category: "culture", engineKey: "21", enabled: true, verification: "verified" },
  { sourceId: "aswangproject", boardId: "precolonial", displayName: "Precolonial Society", shortLabel: "역사", category: "history", engineKey: "708", enabled: true, verification: "verified" },
  { sourceId: "aswangproject", boardId: "tagalog-mythology", displayName: "Tagalog Mythology", shortLabel: "타갈로그", category: "culture", engineKey: "181", enabled: true, verification: "verified" },
  // golfph
  { sourceId: "golfph", boardId: "blog", displayName: "Golf Blog", shortLabel: "블로그", category: "golf", engineKey: "5", enabled: true, verification: "verified" },
  { sourceId: "golfph", boardId: "golf-courses", displayName: "Golf Courses", shortLabel: "코스", category: "golf", engineKey: "3", enabled: true, verification: "verified" },
  { sourceId: "golfph", boardId: "travel-lifestyle", displayName: "Travel & Lifestyle", shortLabel: "여행", category: "travel", engineKey: "255", enabled: true, verification: "verified" },
  // primer
  { sourceId: "primer", boardId: "latest", displayName: "Latest", shortLabel: "최신", category: "living", engineKey: "all", enabled: true, verification: "verified" },
  { sourceId: "primer", boardId: "uncategorized", displayName: "Articles", shortLabel: "기사", category: "travel", engineKey: "1", enabled: true, verification: "verified" },
  // wave2
  { sourceId: "rappler", boardId: "feed", displayName: "Rappler Feed", shortLabel: "피드", category: "news", engineKey: "/feed/", enabled: true, verification: "verified" },
  { sourceId: "inquirer", boardId: "feed", displayName: "Inquirer Feed", shortLabel: "피드", category: "news", engineKey: "/feed", enabled: true, verification: "verified" },
  { sourceId: "dof", boardId: "feed", displayName: "DOF Feed", shortLabel: "피드", category: "finance", engineKey: "/feed/", enabled: true, verification: "verified" },
] as const;

/** Diagnostic-only; never shown as active operator choices. */
export const NON_OPERATIONAL_SOURCES = [
  { id: "philgo", displayName: "PHILGO", status: "blocked" as const, reason: "CURRENT HTTP 403 Cloudflare — no bypass" },
  { id: "pia", displayName: "PIA", status: "blocked" as const, reason: "CURRENT HTTP 403 — no bypass" },
  { id: "ncca", displayName: "NCCA", status: "blocked" as const, reason: "CURRENT Cloudflare challenge 403" },
  { id: "taesarang", displayName: "TAESARANG", status: "not_proven" as const, reason: "CURRENT DNS/SSL unreachable" },
  { id: "tourism_gov_ph", displayName: "DOT tourism.gov.ph", status: "partial" as const, reason: "Home OK but RSS/WP empty corpus" },
  { id: "philsuda", displayName: "필수다", status: "partial" as const, reason: "Home OK; board list not proven" },
] as const;

export function listVerifiedSources(): VerifiedOperatorSource[] {
  return [...VERIFIED_SOURCES];
}

export function listVerifiedBoards(sourceId?: string | null): VerifiedOperatorBoard[] {
  const sid = String(sourceId || "").trim();
  if (!sid) return [...VERIFIED_BOARDS];
  return VERIFIED_BOARDS.filter((b) => b.sourceId === sid);
}

export function resolveVerifiedSource(sourceId: string | null | undefined): VerifiedOperatorSource | null {
  const key = String(sourceId || "").trim().toLowerCase();
  if (!key) return null;
  return VERIFIED_SOURCES.find((s) => s.id === key) || null;
}

export function resolveVerifiedBoard(
  sourceId: string | null | undefined,
  boardId: string | null | undefined,
): VerifiedOperatorBoard | null {
  const sid = String(sourceId || "").trim().toLowerCase();
  const bid = String(boardId || "").trim().toLowerCase();
  if (!sid || !bid) return null;
  return VERIFIED_BOARDS.find((b) => b.sourceId === sid && b.boardId === bid) || null;
}

export function isVerifiedSourceBoard(sourceId: string | null | undefined, boardId: string | null | undefined): boolean {
  return resolveVerifiedBoard(sourceId, boardId) != null;
}

export function boardListUrl(source: VerifiedOperatorSource, board: VerifiedOperatorBoard): string {
  if (source.engine === "gnuboard") {
    return `${source.baseUrl}/bbs/board.php?bo_table=${encodeURIComponent(board.engineKey)}`;
  }
  if (source.engine === "rss_atom") {
    const k = board.engineKey;
    if (/^https?:\/\//i.test(k)) return k;
    return `${source.baseUrl.replace(/\/$/, "")}${k.startsWith("/") ? k : `/${k}`}`;
  }
  if (board.engineKey === "all" || board.engineKey === "*") {
    return `${source.baseUrl}/`;
  }
  return `${source.baseUrl}/category/${encodeURIComponent(board.boardId)}/`;
}
