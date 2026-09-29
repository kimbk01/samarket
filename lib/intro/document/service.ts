import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmptyV0Document,
  type IntroDocumentV1,
  validateDocumentV0,
} from "@/lib/intro/contracts/document";

export type IntroDocumentRow = {
  document_id: string;
  title: string;
  draft_version: number;
  document: IntroDocumentV1;
  updated_at: string;
};

export async function listIntroDocuments(
  sb: SupabaseClient,
): Promise<IntroDocumentRow[]> {
  const { data, error } = await sb
    .from("app_intro_documents")
    .select("document_id, title, draft_version, document, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as IntroDocumentRow[];
}

export async function getIntroDocument(
  sb: SupabaseClient,
  documentId: string,
): Promise<IntroDocumentRow | null> {
  const { data, error } = await sb
    .from("app_intro_documents")
    .select("document_id, title, draft_version, document, updated_at")
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IntroDocumentRow | null) ?? null;
}

export async function createIntroDocument(
  sb: SupabaseClient,
  args: { title: string; userId: string },
): Promise<IntroDocumentRow> {
  const document = createEmptyV0Document(args.title.trim() || "Intro");
  const { data, error } = await sb
    .from("app_intro_documents")
    .insert({
      title: document.title,
      draft_version: 1,
      document,
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select("document_id, title, draft_version, document, updated_at")
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
  const err = validateDocumentV0(args.document);
  if (err) throw new Error(`invalid_document:${err}`);

  const nextVersion = args.expectedDraftVersion + 1;
  const title = (args.title ?? args.document.title).trim() || "Intro";
  const { data, error } = await sb
    .from("app_intro_documents")
    .update({
      title,
      document: { ...args.document, title },
      draft_version: nextVersion,
      updated_by: args.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("document_id", args.documentId)
    .eq("draft_version", args.expectedDraftVersion)
    .select("document_id, title, draft_version, document, updated_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    const conflict = new Error("draft_conflict");
    (conflict as Error & { status: number }).status = 409;
    throw conflict;
  }
  return data as IntroDocumentRow;
}
