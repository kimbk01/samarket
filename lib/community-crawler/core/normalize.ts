import type {
  CommunityCrawlAuthorConfig,
  CommunityCrawlAuthorPolicy,
  CommunityCrawlDateConfig,
  CommunityCrawlDatePolicy,
  CommunityCrawlViewConfig,
  CommunityCrawlViewPolicy,
} from "@/lib/community-crawler/crawl-ssot";

/** Deterministic u32 from string (TEST preview must not shake within/across same key). */
export function stableHash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function parseSourceViewCount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase().replace(/,/g, "");
  if (!t) return null;
  const k = t.match(/^([\d.]+)\s*k\b/);
  if (k) {
    const n = Number(k[1]);
    return Number.isFinite(n) ? Math.round(n * 1000) : null;
  }
  const m = t.match(/^([\d.]+)\s*m\b/);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
  }
  const digits = t.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export function parseSourceDate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  // Prefer explicit Y/M/D before Date() (dotted forms are often Invalid Date).
  const m = t.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toISOString();
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

export function normalizePreviewAuthor(input: {
  policy: CommunityCrawlAuthorPolicy;
  config: CommunityCrawlAuthorConfig;
  sourceAuthor: string | null;
  stableKey: string;
}): { displayName: string; avatarUrl: string | null; note?: string } {
  if (input.policy === "FIXED") {
    const name = String(input.config.fixed_display_name ?? "").trim() || "고정 작성자";
    const avatar = String(input.config.fixed_avatar_url ?? "").trim() || null;
    return { displayName: name, avatarUrl: avatar };
  }
  if (input.policy === "RANDOM_POOL") {
    const pool = Array.isArray(input.config.random_pool) ? input.config.random_pool : [];
    if (pool.length === 0) {
      return { displayName: "", avatarUrl: null, note: "AUTHOR_POOL_EMPTY" };
    }
    const idx = stableHash32(input.stableKey) % pool.length;
    const pick = pool[idx]!;
    return {
      displayName: String(pick.display_name ?? "").trim() || "",
      avatarUrl: pick.avatar_url ? String(pick.avatar_url) : null,
      note: pick.display_name ? "deterministic_pool_pick" : "AUTHOR_POOL_EMPTY",
    };
  }
  const src = (input.sourceAuthor ?? "").trim();
  return {
    displayName: src || "원본 작성자 없음",
    avatarUrl: null,
    note: src ? undefined : "source_author_missing",
  };
}

export function normalizePreviewDate(input: {
  policy: CommunityCrawlDatePolicy;
  config: CommunityCrawlDateConfig;
  sourceDateIso: string | null;
  stableKey: string;
  nowIso?: string;
}): { displayDateIso: string | null; sourcePublishedAt: string | null; warning?: string } {
  const now = input.nowIso ?? new Date().toISOString();
  if (input.policy === "IMPORT_DATE") {
    return { displayDateIso: now, sourcePublishedAt: input.sourceDateIso };
  }
  if (input.policy === "RANDOM_RANGE") {
    const minMs = input.config.random_min ? Date.parse(input.config.random_min) : NaN;
    const maxMs = input.config.random_max ? Date.parse(input.config.random_max) : NaN;
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs < minMs) {
      return {
        displayDateIso: now,
        sourcePublishedAt: input.sourceDateIso,
        warning: "DATE_PARSE_FAILED",
      };
    }
    const span = maxMs - minMs;
    const pick = minMs + (stableHash32(input.stableKey) % (span + 1));
    return { displayDateIso: new Date(pick).toISOString(), sourcePublishedAt: input.sourceDateIso };
  }
  if (input.sourceDateIso) {
    return { displayDateIso: input.sourceDateIso, sourcePublishedAt: input.sourceDateIso };
  }
  return {
    displayDateIso: null,
    sourcePublishedAt: null,
    warning: "DATE_PARSE_FAILED",
  };
}

export function normalizePreviewView(input: {
  policy: CommunityCrawlViewPolicy;
  config: CommunityCrawlViewConfig;
  sourceView: number | null;
  stableKey: string;
}): { viewCount: number | null; warning?: string } {
  if (input.policy === "FIXED") {
    const n = typeof input.config.fixed === "number" ? input.config.fixed : 0;
    return { viewCount: Math.max(0, Math.floor(n)) };
  }
  if (input.policy === "RANDOM_RANGE") {
    const min = typeof input.config.random_min === "number" ? input.config.random_min : 0;
    const max = typeof input.config.random_max === "number" ? input.config.random_max : min;
    const lo = Math.max(0, Math.floor(Math.min(min, max)));
    const hi = Math.max(0, Math.floor(Math.max(min, max)));
    const pick = lo + (stableHash32(input.stableKey) % (hi - lo + 1 || 1));
    return { viewCount: pick };
  }
  if (input.sourceView != null) return { viewCount: input.sourceView };
  return { viewCount: null, warning: "VIEW_PARSE_FAILED" };
}
