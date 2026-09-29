/**
 * DIBAY INTRO — CUT A
 * Admin document persistence against app_intro_documents.
 * requireAdmin → service_role only. No browser mutation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntroDocumentV1 } from "../contracts/document";
import { parseIntroDocument } from "../validation/core";
import { createEmptyIntroDocument } from "./factory";
import { canonicalizeAuthoredDocument } from "./canonical-equality";

export class DocumentConflictError extends Error {
  readonly name = "DocumentConflictError";
  readonly currentDraftVersion: number;
  constructor(currentDraftVersion: number) {
    super("DRAFT_VERSION_CONFLICT");
    this.currentDraftVersion = currentDraftVersion;
  }
}

export class DocumentNotFoundError extends Error {
  readonly name = "DocumentNotFoundError";
  constructor() {
    super("DOCUMENT_NOT_FOUND");
  }
}

export class DocumentValidationError extends Error {
  readonly name = "DocumentValidationError";
  readonly issues: unknown;
  constructor(issues: unknown) {
    super("DOCUMENT_VALIDATION_FAILED");
    this.issues = issues;
  }
}

export type IntroDocumentListItem = {
  documentId: string;
  title: string;
  draftVersion: number;
  sceneCount: number;
  updatedAt: string;
  createdAt: string;
  /** Publish/Live only when actually present later — always false in CUT A. */
  hasPublishedRevision: boolean;
  isCurrentLive: boolean;
};

export type IntroDocumentRecord = {
  documentId: string;
  title: string;
  draftVersion: number;
  document: IntroDocumentV1;
  updatedAt: string;
  createdAt: string;
};

type DocRow = {
  document_id: string;
  title: string;
  draft_version: number;
  document: IntroDocumentV1 | Record<string, unknown>;
  updated_at: string;
  created_at: string;
};

function sceneCountOf(document: unknown): number {
  if (
    document != null &&
    typeof document === "object" &&
    Array.isArray((document as { scenes?: unknown }).scenes)
  ) {
    return ((document as { scenes: unknown[] }).scenes).length;
  }
  return 0;
}

export async function listIntroDocuments(args: {
  sb: SupabaseClient;
  limit?: number;
}): Promise<IntroDocumentListItem[]> {
  const { data, error } = await args.sb
    .from("app_intro_documents")
    .select("document_id,title,draft_version,document,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(args.limit ?? 100);
  if (error) {
    throw new Error(`list_documents_failed:${error.message}`);
  }
  const rows = (data ?? []) as DocRow[];
  const ids = rows.map((r) => r.document_id);
  const published = new Set<string>();
  if (ids.length > 0) {
    const { data: revHits } = await args.sb
      .from("app_intro_revisions")
      .select("document_id")
      .eq("publish_state", "COMMITTED")
      .in("document_id", ids);
    for (const r of revHits ?? []) {
      published.add(r.document_id as string);
    }
  }
  return rows.map((r) => {
    return {
      documentId: r.document_id,
      title: r.title,
      draftVersion: r.draft_version,
      sceneCount: sceneCountOf(r.document),
      updatedAt: r.updated_at,
      createdAt: r.created_at,
      hasPublishedRevision: published.has(r.document_id),
      isCurrentLive: false,
    };
  });
}

export async function createIntroDocument(args: {
  sb: SupabaseClient;
  userId: string;
  title?: string;
}): Promise<IntroDocumentRecord> {
  const documentId = crypto.randomUUID();
  const title = (args.title?.trim() || "새 인트로").slice(0, 200);
  const document = createEmptyIntroDocument({ documentId, title });

  const { data, error } = await args.sb
    .from("app_intro_documents")
    .insert({
      document_id: documentId,
      title,
      draft_version: 1,
      document,
      schema_version: 1,
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select("document_id,title,draft_version,document,updated_at,created_at")
    .single();

  if (error || !data) {
    throw new Error(`create_document_failed:${error?.message ?? "no_row"}`);
  }
  const r = data as DocRow;
  return {
    documentId: r.document_id,
    title: r.title,
    draftVersion: r.draft_version,
    document: r.document as IntroDocumentV1,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  };
}

export async function getIntroDocument(args: {
  sb: SupabaseClient;
  documentId: string;
}): Promise<IntroDocumentRecord> {
  const { data, error } = await args.sb
    .from("app_intro_documents")
    .select("document_id,title,draft_version,document,updated_at,created_at")
    .eq("document_id", args.documentId)
    .maybeSingle();
  if (error) {
    throw new Error(`get_document_failed:${error.message}`);
  }
  if (!data) throw new DocumentNotFoundError();
  const r = data as DocRow;
  return {
    documentId: r.document_id,
    title: r.title,
    draftVersion: r.draft_version,
    document: r.document as IntroDocumentV1,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  };
}

/**
 * Optimistic concurrency Save:
 * Client sends expectedDraftVersion N + next document.
 * Server advances N → N+1 only when current draft_version = N.
 * Mismatch → DocumentConflictError (409).
 */
export async function saveIntroDocument(args: {
  sb: SupabaseClient;
  userId: string;
  documentId: string;
  expectedDraftVersion: number;
  document: IntroDocumentV1;
}): Promise<IntroDocumentRecord> {
  if (args.document.documentId !== args.documentId) {
    throw new DocumentValidationError([
      {
        code: "DOCUMENT_ID_MISMATCH",
        message: "document.documentId must equal path documentId",
      },
    ]);
  }

  const parsed = parseIntroDocument(args.document);
  if (!parsed.ok) {
    throw new DocumentValidationError(parsed.issues);
  }

  // Soft draft rule: IMAGE/LOGO may temporarily have empty mediaRefId while authoring,
  // but Save for CUT A requires valid shape. parseIntroDocument/validateDraft already applied.
  const canonical = canonicalizeAuthoredDocument({
    ...args.document,
    title: args.document.title.trim() || "Untitled Intro",
  });

  const nextVersion = args.expectedDraftVersion + 1;
  const now = new Date().toISOString();

  const { data, error } = await args.sb
    .from("app_intro_documents")
    .update({
      title: canonical.title,
      document: canonical,
      draft_version: nextVersion,
      updated_at: now,
      updated_by: args.userId,
    })
    .eq("document_id", args.documentId)
    .eq("draft_version", args.expectedDraftVersion)
    .select("document_id,title,draft_version,document,updated_at,created_at");

  if (error) {
    throw new Error(`save_document_failed:${error.message}`);
  }

  if (!data || data.length === 0) {
    const current = await getIntroDocument({
      sb: args.sb,
      documentId: args.documentId,
    }).catch(() => null);
    if (!current) throw new DocumentNotFoundError();
    throw new DocumentConflictError(current.draftVersion);
  }

  const r = data[0] as DocRow;
  return {
    documentId: r.document_id,
    title: r.title,
    draftVersion: r.draft_version,
    document: r.document as IntroDocumentV1,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  };
}
