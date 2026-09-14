import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";
import { assertProductionCollectGate } from "@/lib/external-board-import/catalog/collect-gate";
import {
  resolveArticleSourceLanguage,
  normalizeWritableTranslationStatus,
} from "@/lib/external-board-import/catalog/language";
import { resolveCatalogSectionIdFromUrl, findCatalogSection } from "@/lib/external-board-import/catalog/source-catalog";
import { fingerprintExternalBoardDocument } from "@/lib/external-board-import/identity/article-identity";
import { emptyExternalBoardDocument, validateExternalBoardDocument } from "@/lib/external-board-import/document/ordered-document";
import type { ExternalBoardDiscoverOpts } from "@/lib/external-board-import/extraction/discover-opts";
import { normalizeDiscoverOpts } from "@/lib/external-board-import/extraction/discover-opts";
import { isRepublishBlocked } from "@/lib/external-board-import/integrity/publication-tombstone";
import { classifySourceUpdateSignal } from "@/lib/external-board-import/integrity/source-update";
import type {
  ExternalBoardArticleRow,
  ExternalBoardDiscoverItem,
  ExternalBoardEditStatus,
  ExternalBoardSourceRow,
  ExternalBoardTranslationStatus,
} from "@/lib/external-board-import/types";

function mapEditStatus(raw: unknown): ExternalBoardEditStatus | null {
  if (raw === "collected" || raw === "saved" || raw === "published" || raw === "transformed") {
    return raw;
  }
  // Legacy operator value
  if (raw === "editing") return "transformed";
  return null;
}

function mapArticle(row: Record<string, unknown>): ExternalBoardArticleRow {
  const docRaw = row.source_document;
  const validated = validateExternalBoardDocument(docRaw);
  const source_document = validated.ok
    ? validated.document
    : emptyExternalBoardDocument(String(row.canonical_source_url ?? ""), String(row.source_title ?? ""));
  return {
    id: String(row.id),
    source_id: String(row.source_id),
    stable_article_identity: String(row.stable_article_identity),
    identity_kind: row.identity_kind as ExternalBoardArticleRow["identity_kind"],
    content_fingerprint: String(row.content_fingerprint ?? ""),
    canonical_source_url: String(row.canonical_source_url ?? ""),
    source_title: String(row.source_title ?? ""),
    source_document,
    draft_title: row.draft_title != null ? String(row.draft_title) : null,
    draft_document: (() => {
      if (row.draft_document == null) return null;
      const d = validateExternalBoardDocument(row.draft_document);
      return d.ok ? d.document : null;
    })(),
    edit_status: mapEditStatus(row.edit_status),
    source_author: row.source_author != null ? String(row.source_author) : null,
    source_published_at: row.source_published_at != null ? String(row.source_published_at) : null,
    source_language: row.source_language != null ? String(row.source_language) : null,
    detected_language: row.detected_language != null ? String(row.detected_language) : null,
    display_language: row.display_language != null ? String(row.display_language) : null,
    translation_status: ((): ExternalBoardTranslationStatus | null => {
      const t = row.translation_status;
      if (t === "unsupported" || t === "none" || t === "draft_ko") return t;
      return null;
    })(),
    source_page:
      row.source_page != null && Number.isFinite(Number(row.source_page)) ? Number(row.source_page) : null,
    source_sequence:
      row.source_sequence != null && Number.isFinite(Number(row.source_sequence))
        ? Number(row.source_sequence)
        : null,
    chronology_case:
      row.chronology_case === "A" || row.chronology_case === "B" || row.chronology_case === "C"
        ? row.chronology_case
        : null,
    operator_published_at: row.operator_published_at != null ? String(row.operator_published_at) : null,
    operator_batch_order:
      row.operator_batch_order != null && Number.isFinite(Number(row.operator_batch_order))
        ? Number(row.operator_batch_order)
        : null,
    snapshot_version: Number(row.snapshot_version ?? 0),
    ops_status: (row.ops_status as ExternalBoardArticleRow["ops_status"]) || "unpublished",
    article_signal: (row.article_signal as ExternalBoardArticleRow["article_signal"]) ?? null,
    publication_state: ((): ExternalBoardArticleRow["publication_state"] => {
      const s = row.publication_state;
      if (
        s === "none" ||
        s === "published" ||
        s === "hidden" ||
        s === "deleted" ||
        s === "suppressed" ||
        s === "republish_allowed"
      ) {
        return s;
      }
      return "none";
    })(),
    suppressed_at: row.suppressed_at != null ? String(row.suppressed_at) : null,
    suppression_reason: row.suppression_reason != null ? String(row.suppression_reason) : null,
    published_post_id: row.published_post_id != null ? String(row.published_post_id) : null,
    failure_stage: (row.failure_stage as ExternalBoardArticleRow["failure_stage"]) ?? null,
    failure_code: row.failure_code != null ? String(row.failure_code) : null,
    failure_message: row.failure_message != null ? String(row.failure_message) : null,
    failed_at: row.failed_at != null ? String(row.failed_at) : null,
    first_seen_at: String(row.first_seen_at ?? ""),
    last_seen_at: String(row.last_seen_at ?? ""),
    source_changed_at: row.source_changed_at != null ? String(row.source_changed_at) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export type ArticleListSort = "latest" | "oldest";

export async function listExternalBoardArticles(
  sb: SupabaseClient,
  sourceId?: string,
  sort: ArticleListSort = "latest"
): Promise<ExternalBoardArticleRow[]> {
  // Sort authority: source_published_at (not last_seen_at). last_seen = crawl freshness only.
  const ascending = sort === "oldest";
  let q = sb
    .from("external_board_articles")
    .select("*")
    .order("source_published_at", { ascending, nullsFirst: false })
    .order("first_seen_at", { ascending, nullsFirst: false })
    .order("id", { ascending })
    .limit(100);
  if (sourceId) q = q.eq("source_id", sourceId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapArticle(r as Record<string, unknown>));
}

export async function getExternalBoardArticle(
  sb: SupabaseClient,
  id: string
): Promise<ExternalBoardArticleRow | null> {
  const { data, error } = await sb.from("external_board_articles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapArticle(data as Record<string, unknown>) : null;
}

export type ExternalBoardDiscoverResult = {
  items: ExternalBoardDiscoverItem[];
  upserted: ExternalBoardArticleRow[];
  summary: {
    requestedPages: string;
    discovered: number;
    newCount: number;
    unchanged: number;
    sourceUpdated: number;
    failed: number;
    visitedPageUrls: string[];
    articlesPerPage: Record<string, number>;
    dateRange: {
      inputFrom: string | null;
      inputTo: string | null;
      normalizedFromInclusive: string | null;
      normalizedToExclusive: string | null;
      comparison: "half_open_utc";
      timezoneAuthority: "UTC_same_as_source_published_at";
      inputKind: { from: "absent" | "date_only" | "datetime"; to: "absent" | "date_only" | "datetime" };
    };
  };
};

function catalogDefaultLanguageForUrl(sourceUrl: string): string | null {
  const sectionId = resolveCatalogSectionIdFromUrl(sourceUrl);
  if (!sectionId) return null;
  return findCatalogSection(sectionId)?.section.defaultLanguage ?? null;
}

export async function discoverExternalBoardArticles(
  sb: SupabaseClient,
  source: ExternalBoardSourceRow,
  opts?: ExternalBoardDiscoverOpts
): Promise<ExternalBoardDiscoverResult> {
  const gate = assertProductionCollectGate(source.source_url);
  if (!gate.ok) {
    throw Object.assign(new Error(gate.failureMessage), {
      failureStage: "discover",
      failureCode: gate.failureCode,
    });
  }

  const normalized = normalizeDiscoverOpts(opts);
  const { ctx, adapter } = resolveExternalBoardAdapter(source.source_url);
  if (!adapter) {
    throw Object.assign(new Error("No adapter for host"), {
      failureStage: "discover",
      failureCode: "no_adapter",
    });
  }

  const catalogLang = catalogDefaultLanguageForUrl(source.source_url);
  const items = await adapter.discoverArticles(ctx, normalized);
  const sequenced = items.map((item, idx) => ({
    ...item,
    sourceSequence: item.sourceSequence ?? idx,
  }));
  const upserted: ExternalBoardArticleRow[] = [];
  const now = new Date().toISOString();
  let newCount = 0;
  let unchanged = 0;
  let sourceUpdated = 0;
  let failed = 0;
  let pageSequenceColumnsAvailable: boolean | null = null;

  async function supportsPageSequenceColumns(): Promise<boolean> {
    if (pageSequenceColumnsAvailable != null) return pageSequenceColumnsAvailable;
    const { error } = await sb.from("external_board_articles").select("source_page,source_sequence").limit(1);
    pageSequenceColumnsAvailable = !error;
    return pageSequenceColumnsAvailable;
  }

  for (const item of sequenced) {
    try {
      const fp = item.sampleDocument ? fingerprintExternalBoardDocument(item.sampleDocument) : "";
      const sourceLanguage = resolveArticleSourceLanguage({
        explicit: null,
        adapterDeterministic: null,
        catalogDefault: catalogLang,
      });
      const translationStatus = normalizeWritableTranslationStatus("unsupported");

      const { data: existing } = await sb
        .from("external_board_articles")
        .select("*")
        .eq("source_id", source.id)
        .eq("stable_article_identity", item.stableArticleIdentity)
        .maybeSingle();

      if (existing) {
        const prev = mapArticle(existing as Record<string, unknown>);
        const signal = classifySourceUpdateSignal({
          previousFingerprint: prev.content_fingerprint,
          nextFingerprint: fp || prev.content_fingerprint,
          publishedPostId: prev.published_post_id,
        });
        if (isRepublishBlocked(prev.publication_state)) {
          // Keep raw snapshot refreshable; never resurface as NEW collectible.
          unchanged += 1;
        } else {
          if (signal === "UNCHANGED" || signal === "SAME_PUBLISHED") unchanged += 1;
          if (signal === "SOURCE_UPDATED") sourceUpdated += 1;
        }
        const patch: Record<string, unknown> = {
          last_seen_at: now,
          updated_at: now,
          article_signal: isRepublishBlocked(prev.publication_state) ? prev.article_signal : signal,
          source_title: item.title || prev.source_title,
          canonical_source_url: item.canonicalUrl,
        };
        if (item.sourceAuthor) patch.source_author = item.sourceAuthor;
        if (item.sourcePublishedAt) patch.source_published_at = item.sourcePublishedAt;
        if (!prev.source_language && sourceLanguage) patch.source_language = sourceLanguage;
        if (!prev.translation_status) patch.translation_status = translationStatus;
        if ((await supportsPageSequenceColumns()) && item.sourcePage != null) patch.source_page = item.sourcePage;
        if ((await supportsPageSequenceColumns()) && item.sourceSequence != null) {
          patch.source_sequence = item.sourceSequence;
        }
        if (fp && fp !== prev.content_fingerprint) {
          patch.content_fingerprint = fp;
          patch.source_changed_at = now;
          if (item.sampleDocument) {
            // Latest accepted raw snapshot — operator draft not auto-mutated here.
            patch.source_document = item.sampleDocument;
            patch.snapshot_version = prev.snapshot_version + 1;
          }
        }
        const { data, error } = await sb
          .from("external_board_articles")
          .update(patch)
          .eq("id", prev.id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        upserted.push(mapArticle(data as Record<string, unknown>));
        continue;
      }

      newCount += 1;
      const insert: Record<string, unknown> = {
        source_id: source.id,
        stable_article_identity: item.stableArticleIdentity,
        identity_kind: item.identityKind,
        content_fingerprint: fp,
        canonical_source_url: item.canonicalUrl,
        source_title: item.title,
        source_document: item.sampleDocument ?? emptyExternalBoardDocument(item.canonicalUrl, item.title),
        source_author: item.sourceAuthor ?? null,
        source_published_at: item.sourcePublishedAt ?? null,
        source_language: sourceLanguage,
        detected_language: null,
        display_language: sourceLanguage,
        translation_status: translationStatus,
        edit_status: "collected",
        snapshot_version: item.sampleDocument ? 1 : 0,
        ops_status: "unpublished",
        publication_state: "none",
        article_signal: "NEW",
        first_seen_at: now,
        last_seen_at: now,
      };
      if (await supportsPageSequenceColumns()) {
        insert.source_page = item.sourcePage ?? null;
        insert.source_sequence = item.sourceSequence ?? null;
      }
      const { data, error } = await sb.from("external_board_articles").insert(insert).select("*").single();
      if (error) throw new Error(error.message);
      upserted.push(mapArticle(data as Record<string, unknown>));
    } catch {
      failed += 1;
    }
  }

  await sb
    .from("external_board_sources")
    .update({ last_fetched_at: now, updated_at: now })
    .eq("id", source.id);

  const visitedPageUrls = Array.from(
    new Set(
      sequenced
        .map((it) => (typeof it.visitedListUrl === "string" ? it.visitedListUrl.trim() : ""))
        .filter(Boolean)
    )
  );
  const articlesPerPage: Record<string, number> = {};
  for (const it of sequenced) {
    if (it.sourcePage == null) continue;
    const key = String(it.sourcePage);
    articlesPerPage[key] = (articlesPerPage[key] ?? 0) + 1;
  }

  return {
    items: sequenced,
    upserted,
    summary: {
      requestedPages: `${normalized.pageFrom}-${normalized.pageTo}`,
      discovered: sequenced.length,
      newCount,
      unchanged,
      sourceUpdated,
      failed,
      visitedPageUrls,
      articlesPerPage,
      dateRange: {
        inputFrom: normalized.dateRangeMeta.inputFrom,
        inputTo: normalized.dateRangeMeta.inputTo,
        normalizedFromInclusive: normalized.dateFrom,
        normalizedToExclusive: normalized.dateTo,
        comparison: normalized.dateRangeMeta.comparison,
        timezoneAuthority: normalized.dateRangeMeta.timezoneAuthority,
        inputKind: normalized.dateRangeMeta.inputKind,
      },
    },
  };
}
