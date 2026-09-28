import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  createDefaultDibayIntroDocument,
  parseDibayIntroDocument,
  type DibayIntroDocument,
} from "@/lib/dibay-intro/document";
import { documentChecksum } from "@/lib/dibay-intro/checksum";
import { validateDocumentForPublish } from "@/lib/dibay-intro/publish-validate";
import {
  resolveIntroOperatorLifecycle,
  type IntroOperatorLifecycle,
} from "@/lib/dibay-intro/lifecycle";

export type DibayIntroListItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  lifecycle: IntroOperatorLifecycle;
  isLive: boolean;
};

export type DibayIntroRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  document: DibayIntroDocument;
  publishedRevisionId: string | null;
  publishedAt: string | null;
  publishedChecksum: string | null;
  liveRevisionId: string | null;
  isLive: boolean;
  lifecycle: IntroOperatorLifecycle;
};

function svc() {
  const client = tryCreateSupabaseServiceClient();
  if (!client) throw new Error("service_unavailable");
  return client;
}

export async function listDibayIntros(): Promise<DibayIntroListItem[]> {
  const db = svc();
  const { data: intros, error } = await db
    .from("dibay_intros")
    .select("id,title,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const { data: live } = await db.from("dibay_intro_live").select("intro_id,revision_id").maybeSingle();
  const ids = (intros ?? []).map((row) => row.id as string);
  const { data: revisions } = ids.length
    ? await db
        .from("dibay_intro_revisions")
        .select("id,intro_id,created_at")
        .in("intro_id", ids)
        .order("created_at", { ascending: false })
    : { data: [] as { id: string; intro_id: string; created_at: string }[] };
  const latestByIntro = new Map<string, { id: string; created_at: string }>();
  for (const rev of revisions ?? []) {
    if (!latestByIntro.has(rev.intro_id)) latestByIntro.set(rev.intro_id, { id: rev.id, created_at: rev.created_at });
  }
  return (intros ?? []).map((row) => {
    const latest = latestByIntro.get(row.id as string) ?? null;
    const lifecycle = resolveIntroOperatorLifecycle({
      hasDraft: true,
      publishedRevisionId: latest?.id ?? null,
      liveRevisionId: live?.revision_id ?? null,
      liveIntroId: live?.intro_id ?? null,
      introId: row.id as string,
    });
    return {
      id: row.id as string,
      title: String(row.title ?? ""),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      publishedAt: latest?.created_at ?? null,
      lifecycle,
      isLive: lifecycle === "live",
    };
  });
}

export async function createDibayIntro(userId: string, title?: string): Promise<DibayIntroRecord> {
  const db = svc();
  const document = createDefaultDibayIntroDocument();
  const { data: intro, error } = await db
    .from("dibay_intros")
    .insert({ title: title?.trim() || "", created_by: userId, updated_by: userId })
    .select("id,title,created_at,updated_at")
    .single();
  if (error || !intro) throw new Error(error?.message ?? "create_failed");
  const { error: docError } = await db.from("dibay_intro_documents").insert({
    intro_id: intro.id,
    document,
    updated_by: userId,
  });
  if (docError) throw new Error(docError.message);
  return loadDibayIntro(intro.id as string);
}

export async function loadDibayIntro(introId: string): Promise<DibayIntroRecord> {
  const db = svc();
  const { data: intro, error } = await db
    .from("dibay_intros")
    .select("id,title,created_at,updated_at")
    .eq("id", introId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!intro) throw new Error("not_found");
  const { data: docRow, error: docError } = await db
    .from("dibay_intro_documents")
    .select("document")
    .eq("intro_id", introId)
    .maybeSingle();
  if (docError) throw new Error(docError.message);
  const parsed = parseDibayIntroDocument(docRow?.document);
  if (!parsed.ok) throw new Error("invalid_document");
  const { data: live } = await db.from("dibay_intro_live").select("intro_id,revision_id").maybeSingle();
  const { data: latest } = await db
    .from("dibay_intro_revisions")
    .select("id,document_checksum,created_at")
    .eq("intro_id", introId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lifecycle = resolveIntroOperatorLifecycle({
    hasDraft: true,
    publishedRevisionId: latest?.id ?? null,
    liveRevisionId: live?.revision_id ?? null,
    liveIntroId: live?.intro_id ?? null,
    introId,
  });
  return {
    id: intro.id as string,
    title: String(intro.title ?? ""),
    createdAt: String(intro.created_at),
    updatedAt: String(intro.updated_at),
    document: parsed.document,
    publishedRevisionId: latest?.id ?? null,
    publishedAt: latest?.created_at ?? null,
    publishedChecksum: latest?.document_checksum ?? null,
    liveRevisionId: live?.revision_id ?? null,
    isLive: lifecycle === "live",
    lifecycle,
  };
}

export async function saveDibayIntroDocument(
  introId: string,
  userId: string,
  title: string,
  document: DibayIntroDocument,
): Promise<DibayIntroRecord> {
  const parsed = parseDibayIntroDocument(document);
  if (!parsed.ok) throw new Error("invalid_document");
  const db = svc();
  const { error: introError } = await db
    .from("dibay_intros")
    .update({ title: title.trim(), updated_at: new Date().toISOString(), updated_by: userId })
    .eq("id", introId);
  if (introError) throw new Error(introError.message);
  const { error: docError } = await db
    .from("dibay_intro_documents")
    .update({ document: parsed.document, updated_at: new Date().toISOString(), updated_by: userId })
    .eq("intro_id", introId);
  if (docError) throw new Error(docError.message);
  return loadDibayIntro(introId);
}

export async function listReadyMediaIds(introId: string): Promise<Set<string>> {
  const db = svc();
  const { data, error } = await db
    .from("dibay_intro_media")
    .select("id")
    .eq("intro_id", introId)
    .eq("status", "ready");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.id as string));
}

export async function publishDibayIntro(
  introId: string,
  userId: string,
): Promise<{ revisionId: string; checksum: string; unchanged: boolean }> {
  const record = await loadDibayIntro(introId);
  const ready = await listReadyMediaIds(introId);
  const validated = validateDocumentForPublish(record.document, ready);
  if (!validated.ok) throw new Error("publish_invalid");
  const checksum = documentChecksum(validated.document);
  const db = svc();
  const { data: existing } = await db
    .from("dibay_intro_revisions")
    .select("id")
    .eq("intro_id", introId)
    .eq("document_checksum", checksum)
    .maybeSingle();
  if (existing?.id) {
    return { revisionId: existing.id as string, checksum, unchanged: true };
  }
  const { data: inserted, error } = await db
    .from("dibay_intro_revisions")
    .insert({
      intro_id: introId,
      document: validated.document,
      document_checksum: checksum,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "publish_failed");
  return { revisionId: inserted.id as string, checksum, unchanged: false };
}

export async function setDibayIntroLive(
  introId: string,
  userId: string,
): Promise<{ revisionId: string }> {
  const db = svc();
  const { data: latest, error } = await db
    .from("dibay_intro_revisions")
    .select("id")
    .eq("intro_id", introId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!latest?.id) throw new Error("not_published");
  const { error: liveError } = await db.from("dibay_intro_live").upsert({
    singleton: true,
    intro_id: introId,
    revision_id: latest.id,
    set_live_at: new Date().toISOString(),
    set_live_by: userId,
  });
  if (liveError) throw new Error(liveError.message);
  return { revisionId: latest.id as string };
}

export async function loadLiveRevision(): Promise<{
  introId: string;
  revisionId: string;
  document: DibayIntroDocument;
  checksum: string;
} | null> {
  const db = svc();
  const { data: live } = await db.from("dibay_intro_live").select("intro_id,revision_id").maybeSingle();
  if (!live?.revision_id) return null;
  const { data: revision } = await db
    .from("dibay_intro_revisions")
    .select("id,intro_id,document,document_checksum")
    .eq("id", live.revision_id)
    .maybeSingle();
  if (!revision) return null;
  const parsed = parseDibayIntroDocument(revision.document);
  if (!parsed.ok) return null;
  return {
    introId: revision.intro_id as string,
    revisionId: revision.id as string,
    document: parsed.document,
    checksum: String(revision.document_checksum),
  };
}
