/**
 * Assign DIBAY display fields ONCE at crawl-item insert.
 * Values must be persisted on community_crawl_items — never re-rolled on read/render.
 */

import { createHash, randomInt } from "node:crypto";
import type {
  CommunityCrawlAuthorConfig,
  CommunityCrawlAuthorPolicy,
  CommunityCrawlDateConfig,
  CommunityCrawlDatePolicy,
  CommunityCrawlViewConfig,
  CommunityCrawlViewPolicy,
} from "@/lib/community-crawler/crawl-ssot";
import { parseSourceDate, parseSourceViewCount } from "@/lib/community-crawler/core/normalize";

export function contentFingerprint(title: string, body: string, cover: string | null): string {
  return createHash("sha256")
    .update(`${title}\n${body}\n${cover ?? ""}`)
    .digest("hex")
    .slice(0, 40);
}

export function assignDisplayAuthorOnce(input: {
  policy: CommunityCrawlAuthorPolicy;
  config: CommunityCrawlAuthorConfig;
  sourceAuthor: string | null;
}):
  | { ok: true; displayName: string; avatarUrl: string | null }
  | { ok: false; error: "AUTHOR_POOL_EMPTY" | "FIXED_AUTHOR_REQUIRED" } {
  if (input.policy === "FIXED") {
    const name = String(input.config.fixed_display_name ?? "").trim();
    if (!name) return { ok: false, error: "FIXED_AUTHOR_REQUIRED" };
    const avatar = String(input.config.fixed_avatar_url ?? "").trim() || null;
    return { ok: true, displayName: name, avatarUrl: avatar };
  }
  if (input.policy === "RANDOM_POOL") {
    const pool = Array.isArray(input.config.random_pool) ? input.config.random_pool : [];
    const names = pool
      .map((p) => ({
        displayName: String(p.display_name ?? "").trim(),
        avatarUrl: p.avatar_url ? String(p.avatar_url).trim() : null,
      }))
      .filter((p) => p.displayName);
    if (names.length === 0) return { ok: false, error: "AUTHOR_POOL_EMPTY" };
    const pick = names[randomInt(0, names.length)]!;
    return { ok: true, displayName: pick.displayName, avatarUrl: pick.avatarUrl };
  }
  const src = (input.sourceAuthor ?? "").trim();
  return { ok: true, displayName: src || "원본 작성자 없음", avatarUrl: null };
}

export function assignDisplayDateOnce(input: {
  policy: CommunityCrawlDatePolicy;
  config: CommunityCrawlDateConfig;
  sourceDateRaw: string | null;
  nowIso?: string;
}):
  | { ok: true; displayDateIso: string; sourcePublishedAt: string | null }
  | { ok: false; error: "DATE_RANGE_INVALID" } {
  const now = input.nowIso ?? new Date().toISOString();
  const sourcePublishedAt = parseSourceDate(input.sourceDateRaw);
  if (input.policy === "IMPORT_DATE") {
    return { ok: true, displayDateIso: now, sourcePublishedAt };
  }
  if (input.policy === "RANDOM_RANGE") {
    const minMs = input.config.random_min ? Date.parse(input.config.random_min) : NaN;
    const maxMs = input.config.random_max ? Date.parse(input.config.random_max) : NaN;
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs < minMs) {
      return { ok: false, error: "DATE_RANGE_INVALID" };
    }
    const span = maxMs - minMs;
    const pick = minMs + randomInt(0, span + 1);
    return { ok: true, displayDateIso: new Date(pick).toISOString(), sourcePublishedAt };
  }
  if (sourcePublishedAt) {
    return { ok: true, displayDateIso: sourcePublishedAt, sourcePublishedAt };
  }
  return { ok: true, displayDateIso: now, sourcePublishedAt: null };
}

export function assignDisplayViewOnce(input: {
  policy: CommunityCrawlViewPolicy;
  config: CommunityCrawlViewConfig;
  sourceViewRaw: string | null;
}): { ok: true; viewSeed: number } | { ok: false; error: "VIEW_RANGE_INVALID" } {
  if (input.policy === "FIXED") {
    const n = typeof input.config.fixed === "number" ? input.config.fixed : 0;
    return { ok: true, viewSeed: Math.max(0, Math.floor(n)) };
  }
  if (input.policy === "RANDOM_RANGE") {
    const min = typeof input.config.random_min === "number" ? input.config.random_min : NaN;
    const max = typeof input.config.random_max === "number" ? input.config.random_max : NaN;
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { ok: false, error: "VIEW_RANGE_INVALID" };
    }
    const lo = Math.max(0, Math.floor(Math.min(min, max)));
    const hi = Math.max(0, Math.floor(Math.max(min, max)));
    return { ok: true, viewSeed: lo + randomInt(0, hi - lo + 1) };
  }
  const src = parseSourceViewCount(input.sourceViewRaw);
  return { ok: true, viewSeed: src != null ? Math.max(0, src) : 0 };
}
