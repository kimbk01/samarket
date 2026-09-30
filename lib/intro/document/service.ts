import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmptyV0Document,
  cryptoRandomId,
  normalizeDocumentV1,
  operatorMessageForDocument,
  type IntroDocumentV1,
  type SceneV1,
  validateDocumentV0,
} from "@/lib/intro/contracts/document";
import {
  normalizeIntroContentClass,
  type IntroDataClass,
} from "@/lib/intro/admin/operator-classification";
import { getLiveStatus } from "@/lib/intro/live/service";

export type IntroDocumentRow = {
  document_id: string;
  title: string;
  content_class: IntroDataClass;
  draft_version: number;
  document: IntroDocumentV1;
  updated_at: string;
};

export type IntroOperatorListItem = {
  document_id: string;
  title: string;
  draft_version: number;
  updated_at: string;
  sceneCount: number;
  totalDurationMs: number;
  scene1Background:
    | { type: "COLOR"; color: string }
    | { type: "IMAGE"; mediaId: string }
    | null;
  classification: IntroDataClass;
  status: "DRAFT" | "PUBLISHED" | "LIVE";
  latestReleaseId: string | null;
  isLive: boolean;
};

export async function listIntroDocuments(
  sb: SupabaseClient,
): Promise<IntroDocumentRow[]> {
  const { data, error } = await sb
    .from("app_intro_documents")
    .select("document_id, title, content_class, draft_version, document, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as IntroDocumentRow[];
}

function scene1BackgroundOf(
  doc: IntroDocumentV1,
): IntroOperatorListItem["scene1Background"] {
  const bg = doc.scenes[0]?.background;
  if (!bg) return null;
  if (bg.type === "COLOR") return { type: "COLOR", color: bg.color };
  return { type: "IMAGE", mediaId: bg.mediaId };
}

export async function listIntroOperatorDocuments(
  sb: SupabaseClient,
): Promise<IntroOperatorListItem[]> {
  const rows = await listIntroDocuments(sb);
  const live = await getLiveStatus(sb);
  const liveReleaseId = live.kind === "LIVE" ? live.releaseId : null;

  let liveDocumentId: string | null = null;
  if (liveReleaseId) {
    const { data: rev } = await sb
      .from("app_intro_revisions")
      .select("document_id")
      .eq("published_revision_id", liveReleaseId)
      .maybeSingle();
    liveDocumentId = (rev?.document_id as string | null) ?? null;
  }

  const { data: committedRevs } = await sb
    .from("app_intro_revisions")
    .select("document_id, published_revision_id, created_at")
    .eq("publish_state", "COMMITTED")
    .order("created_at", { ascending: false })
    .limit(500);

  const latestByDoc = new Map<string, string>();
  for (const rev of committedRevs ?? []) {
    const docId = rev.document_id as string;
    if (!latestByDoc.has(docId)) {
      latestByDoc.set(docId, rev.published_revision_id as string);
    }
  }

  return rows.map((row) => {
    const doc = row.document;
    const sceneCount = doc?.scenes?.length ?? 0;
    const totalDurationMs = (doc?.scenes ?? []).reduce(
      (sum: number, s: SceneV1) => sum + (s.durationMs || 0),
      0,
    );
    const isLive = Boolean(liveDocumentId && liveDocumentId === row.document_id);
    const latestReleaseId = latestByDoc.get(row.document_id) ?? null;
    const classification = normalizeIntroContentClass(row.content_class);
    const status: IntroOperatorListItem["status"] = isLive
      ? "LIVE"
      : latestReleaseId
        ? "PUBLISHED"
        : "DRAFT";
    return {
      document_id: row.document_id,
      title: row.title,
      draft_version: row.draft_version,
      updated_at: row.updated_at,
      sceneCount,
      totalDurationMs,
      scene1Background: scene1BackgroundOf(doc),
      classification,
      status,
      latestReleaseId,
      isLive,
    };
  });
}

export async function getIntroDocument(
  sb: SupabaseClient,
  documentId: string,
): Promise<IntroDocumentRow | null> {
  const { data, error } = await sb
    .from("app_intro_documents")
    .select("document_id, title, content_class, draft_version, document, updated_at")
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as IntroDocumentRow;
  return {
    ...row,
    document: normalizeDocumentV1(row.document as IntroDocumentV1),
  };
}

export async function createIntroDocument(
  sb: SupabaseClient,
  args: { title: string; userId: string; contentClass?: IntroDataClass },
): Promise<IntroDocumentRow> {
  const document = createEmptyV0Document(args.title.trim() || "Intro");
  const content_class = normalizeIntroContentClass(
    args.contentClass ?? "OWNER",
  );
  const { data, error } = await sb
    .from("app_intro_documents")
    .insert({
      title: document.title,
      content_class,
      draft_version: 1,
      document,
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select("document_id, title, content_class, draft_version, document, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as IntroDocumentRow;
}

export async function saveIntroDocument(
  sb: SupabaseClient,
  args: {
    documentId: string;
    expectedDraftVersion: number;
    document: IntroDocumentV1;
    title?: string;
    userId: string;
  },
): Promise<IntroDocumentRow> {
  const title = (args.title ?? args.document.title).trim() || "Intro";
  const document = normalizeDocumentV1({ ...args.document, title });
  const err = validateDocumentV0(document);
  if (err) {
    const msg = operatorMessageForDocument(document);
    const e = new Error(msg ?? `invalid_document:${err}`);
    (e as Error & { code?: string }).code = `invalid_document:${err}`;
    throw e;
  }

  const nextVersion = args.expectedDraftVersion + 1;
  const { data, error } = await sb
    .from("app_intro_documents")
    .update({
      title,
      document,
      draft_version: nextVersion,
      updated_by: args.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("document_id", args.documentId)
    .eq("draft_version", args.expectedDraftVersion)
    .select("document_id, title, content_class, draft_version, document, updated_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    const conflict = new Error("draft_conflict");
    (conflict as Error & { status: number }).status = 409;
    throw conflict;
  }
  return data as IntroDocumentRow;
}

function cloneDocumentWithFreshIds(doc: IntroDocumentV1, title: string): IntroDocumentV1 {
  return {
    ...doc,
    title,
    scenes: doc.scenes.map((scene) => ({
      ...scene,
      id: cryptoRandomId(),
      elements: scene.elements.map((el) => ({
        ...el,
        id: cryptoRandomId(),
      })),
    })),
  };
}

export async function duplicateIntroDocument(
  sb: SupabaseClient,
  args: { documentId: string; userId: string; title?: string },
): Promise<IntroDocumentRow> {
  const src = await getIntroDocument(sb, args.documentId);
  if (!src) throw new Error("document_not_found");
  const title =
    (args.title?.trim() || `${src.title} (복사)`).slice(0, 120) || "Intro (복사)";
  const document = cloneDocumentWithFreshIds(src.document, title);
  const content_class = normalizeIntroContentClass(src.content_class);
  const { data, error } = await sb
    .from("app_intro_documents")
    .insert({
      title,
      content_class,
      draft_version: 1,
      document,
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select("document_id, title, content_class, draft_version, document, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as IntroDocumentRow;
}

export async function updateIntroDocumentContentClass(
  sb: SupabaseClient,
  args: {
    documentId: string;
    contentClass: IntroDataClass;
    userId: string;
  },
): Promise<IntroDocumentRow> {
  const content_class = normalizeIntroContentClass(args.contentClass);
  const { data, error } = await sb
    .from("app_intro_documents")
    .update({
      content_class,
      updated_by: args.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("document_id", args.documentId)
    .select("document_id, title, content_class, draft_version, document, updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("document_not_found");
  return data as IntroDocumentRow;
}

export async function renameIntroDocument(
  sb: SupabaseClient,
  args: {
    documentId: string;
    title: string;
    expectedDraftVersion: number;
    userId: string;
  },
): Promise<IntroDocumentRow> {
  const src = await getIntroDocument(sb, args.documentId);
  if (!src) throw new Error("document_not_found");
  const title = args.title.trim() || "Intro";
  return saveIntroDocument(sb, {
    documentId: args.documentId,
    expectedDraftVersion: args.expectedDraftVersion,
    document: { ...src.document, title },
    title,
    userId: args.userId,
  });
}

/**
 * Soft-delete / hard-delete draft documents.
 * LIVE documents must be unapplied first (fail closed).
 */
export async function deleteIntroDocument(
  sb: SupabaseClient,
  args: { documentId: string; userId: string },
): Promise<{ deleted: true }> {
  const items = await listIntroOperatorDocuments(sb);
  const row = items.find((d) => d.document_id === args.documentId);
  if (!row) throw new Error("document_not_found");
  if (row.isLive) {
    const err = new Error("cannot_delete_live_intro");
    (err as Error & { status: number }).status = 409;
    throw err;
  }
  const { error } = await sb
    .from("app_intro_documents")
    .delete()
    .eq("document_id", args.documentId);
  if (error) throw new Error(error.message);
  void args.userId;
  return { deleted: true };
}
