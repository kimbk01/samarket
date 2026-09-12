/**
 * P0 SOURCE BOARD IDENTITY
 *
 * raw URL string equality is forbidden.
 * Different board paths on the same site must NOT collapse.
 */

export type SourceBoardIdentity = {
  /** Normalized host (lowercase, www stripped when equivalent). */
  siteKey: string;
  /** Canonical board URL after scheme/host/slash/query/fragment/port normalize. */
  boardKey: string;
};

const TRACKING_QUERY_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "_ga",
]);

function stripWww(hostname: string): string {
  const h = hostname.toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

function defaultPortFor(protocol: string): string {
  if (protocol === "http:") return "80";
  if (protocol === "https:") return "443";
  return "";
}

/**
 * Normalize a board/list URL for identity comparison.
 * Preserves meaningful path segments (different boards stay different).
 */
export function normalizeSourceBoardUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("SOURCE BOARD URL is required");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("SOURCE BOARD URL is invalid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SOURCE BOARD URL must be http(s)");
  }

  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = stripWww(url.hostname);

  const port = url.port;
  if (port && port === defaultPortFor(url.protocol)) {
    url.port = "";
  }

  const kept = new URLSearchParams();
  const entries = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [k, v] of entries) {
    if (TRACKING_QUERY_KEYS.has(k.toLowerCase())) continue;
    kept.append(k, v);
  }
  url.search = kept.toString() ? `?${kept.toString()}` : "";

  let pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname || "/";

  // Prefer https form when only scheme differs — identity key uses https.
  url.protocol = "https:";

  return url.toString();
}

export function buildSourceBoardIdentity(input: {
  siteName?: string | null;
  boardUrl: string;
  /** Optional redirect/canonical final URL from board check fetch. */
  finalUrl?: string | null;
}): SourceBoardIdentity {
  const primary = normalizeSourceBoardUrl(input.finalUrl?.trim() || input.boardUrl);
  const u = new URL(primary);
  return {
    siteKey: stripWww(u.hostname),
    boardKey: primary,
  };
}

export function sourceBoardIdentityEquals(a: SourceBoardIdentity, b: SourceBoardIdentity): boolean {
  return a.siteKey === b.siteKey && a.boardKey === b.boardKey;
}

export type ExistingSourceBoardHit = {
  identity: SourceBoardIdentity;
  siteName: string;
  sourceBoardName: string;
  targetLabel: string;
  existingBoardId: string;
};

export type BoardRegistrationDuplicateResult =
  | { duplicate: false }
  | {
      duplicate: true;
      existing: ExistingSourceBoardHit;
      message: "이미 등록된 게시판입니다.";
    };

export function detectSourceBoardDuplicate(input: {
  candidate: SourceBoardIdentity;
  existing: ExistingSourceBoardHit[];
}): BoardRegistrationDuplicateResult {
  const hit = input.existing.find((e) =>
    sourceBoardIdentityEquals(e.identity, input.candidate)
  );
  if (!hit) return { duplicate: false };
  return {
    duplicate: true,
    existing: hit,
    message: "이미 등록된 게시판입니다.",
  };
}
