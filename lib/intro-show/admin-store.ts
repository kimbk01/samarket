import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalDocumentJson,
  checksumDocument,
  createEmptyIntroShowDocument,
  parseIntroShowDocument,
  semanticDocumentsEqual,
  type IntroShowDocument,
} from "@/intro-engine";
import { INTRO_ENGINE_ID, INTRO_ENGINE_VERSION } from "@/intro-engine/identity";

export type IntroShowListItem = {
  id: string;
  title: string;
  updatedAt: string;
  isLive: boolean;
  hasPublishedRevision: boolean;
};

export type IntroShowMediaListItem = {
  id: string;
  kind: "LOGO" | "IMAGE";
  status: "pending" | "ready" | "failed";
  width: number | null;
  height: number | null;
};

export type IntroShowDraftPayload = {
  id: string;
  title: string;
  document: IntroShowDocument;
  saveState: "SAVED";
  isLive: boolean;
  publishedRevisionId: string | null;
  media: IntroShowMediaListItem[];
};

function asKind(value: unknown): "LOGO" | "IMAGE" | null {
  return value === "LOGO" || value === "IMAGE" ? value : null;
}

export async function listIntroShowCampaigns(sb: SupabaseClient): Promise<IntroShowListItem[]> {
  const { data: campaigns, error } = await sb
    .from("intro_show_campaigns")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: live } = await sb.from("intro_show_live").select("campaign_id").eq("id", true).maybeSingle();
  const liveId = (live as { campaign_id?: string } | null)?.campaign_id ?? null;

  const { data: revisions } = await sb.from("intro_show_revisions").select("campaign_id");
  const published = new Set((revisions ?? []).map((row) => String((row as { campaign_id: string }).campaign_id)));

  return (campaigns ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    updatedAt: String(row.updated_at),
    isLive: liveId === String(row.id),
    hasPublishedRevision: published.has(String(row.id)),
  }));
}

export async function createIntroShowCampaign(
  sb: SupabaseClient,
  input: { adminUserId: string; title: string },
): Promise<{ id: string }> {
  const title = input.title.trim() || "새 인트로";
  const document = createEmptyIntroShowDocument();
  const { data, error } = await sb
    .from("intro_show_campaigns")
    .insert({ title, created_by: input.adminUserId, updated_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "create_failed");
  const id = String(data.id);
  const { error: draftError } = await sb.from("intro_show_drafts").insert({
    campaign_id: id,
    document,
    updated_by: input.adminUserId,
  });
  if (draftError) throw new Error(draftError.message);
  return { id };
}

export async function getIntroShowDraft(
  sb: SupabaseClient,
  campaignId: string,
): Promise<IntroShowDraftPayload | null> {
  const { data: campaign, error } = await sb
    .from("intro_show_campaigns")
    .select("id, title")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) return null;

  const { data: draft, error: draftError } = await sb
    .from("intro_show_drafts")
    .select("document")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (draftError) throw new Error(draftError.message);
  const document = parseIntroShowDocument(draft?.document);
  if (!document) return null;

  const { data: live } = await sb
    .from("intro_show_live")
    .select("campaign_id, revision_id")
    .eq("id", true)
    .maybeSingle();
  const { data: latestRevision } = await sb
    .from("intro_show_revisions")
    .select("id")
    .eq("campaign_id", campaignId)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: mediaRows } = await sb
    .from("intro_show_media")
    .select("id, kind, status, width, height")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  const media: IntroShowMediaListItem[] = [];
  for (const row of mediaRows ?? []) {
    const kind = asKind(row.kind);
    const status = row.status === "pending" || row.status === "ready" || row.status === "failed" ? row.status : null;
    if (!kind || !status) continue;
    media.push({
      id: String(row.id),
      kind,
      status,
      width: typeof row.width === "number" ? row.width : null,
      height: typeof row.height === "number" ? row.height : null,
    });
  }

  return {
    id: String(campaign.id),
    title: String(campaign.title),
    document,
    saveState: "SAVED",
    isLive: (live as { campaign_id?: string } | null)?.campaign_id === campaignId,
    publishedRevisionId: latestRevision ? String(latestRevision.id) : null,
    media,
  };
}

export async function saveIntroShowDraft(
  sb: SupabaseClient,
  input: { campaignId: string; adminUserId: string; title: string; document: unknown },
): Promise<{
  document: IntroShowDocument;
  requestCanonical: string;
  storedCanonical: string;
  freshCanonical: string;
  equal: boolean;
}> {
  const parsed = parseIntroShowDocument(input.document);
  if (!parsed) throw new Error("document_invalid");
  const title = input.title.trim();
  if (!title) throw new Error("title_required");

  const { error: titleError } = await sb
    .from("intro_show_campaigns")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", input.campaignId);
  if (titleError) throw new Error(titleError.message);

  const { error: draftError } = await sb.from("intro_show_drafts").upsert({
    campaign_id: input.campaignId,
    document: parsed,
    updated_at: new Date().toISOString(),
    updated_by: input.adminUserId,
  });
  if (draftError) throw new Error(draftError.message);

  const { data: stored, error: getError } = await sb
    .from("intro_show_drafts")
    .select("document")
    .eq("campaign_id", input.campaignId)
    .single();
  if (getError) throw new Error(getError.message);
  const storedDoc = parseIntroShowDocument(stored.document);
  if (!storedDoc) throw new Error("stored_document_invalid");

  const requestCanonical = canonicalDocumentJson(parsed);
  const storedCanonical = canonicalDocumentJson(storedDoc);
  const equal = semanticDocumentsEqual(parsed, storedDoc);
  return {
    document: storedDoc,
    requestCanonical,
    storedCanonical,
    freshCanonical: storedCanonical,
    equal,
  };
}

export async function requireReadyMediaIds(
  sb: SupabaseClient,
  campaignId: string,
  mediaIds: string[],
): Promise<void> {
  if (mediaIds.length === 0) throw new Error("media_required");
  const { data, error } = await sb
    .from("intro_show_media")
    .select("id, status")
    .eq("campaign_id", campaignId)
    .in("id", mediaIds);
  if (error) throw new Error(error.message);
  const byId = new Map((data ?? []).map((row) => [String(row.id), String(row.status)]));
  for (const mediaId of mediaIds) {
    if (byId.get(mediaId) !== "ready") throw new Error("media_not_ready");
  }
  const { data: assets, error: assetError } = await sb
    .from("intro_show_media_assets")
    .select("media_id")
    .in("media_id", mediaIds);
  if (assetError) throw new Error(assetError.message);
  const readyAssets = new Set((assets ?? []).map((row) => String(row.media_id)));
  for (const mediaId of mediaIds) {
    if (!readyAssets.has(mediaId)) throw new Error("runtime_asset_not_ready");
  }
}

export async function insertPublishedRevision(
  sb: SupabaseClient,
  input: {
    campaignId: string;
    adminUserId: string;
    document: IntroShowDocument;
    engineHash: string;
    packChecksum: string;
  },
): Promise<{ revisionId: string; documentChecksum: string }> {
  const documentChecksum = await checksumDocument(input.document);
  const { data, error } = await sb
    .from("intro_show_revisions")
    .insert({
      campaign_id: input.campaignId,
      document: input.document,
      document_checksum: documentChecksum,
      engine_id: INTRO_ENGINE_ID,
      engine_version: INTRO_ENGINE_VERSION,
      engine_hash: input.engineHash,
      pack_checksum: input.packChecksum,
      published_by: input.adminUserId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "publish_failed");
  return { revisionId: String(data.id), documentChecksum };
}

export async function setIntroShowLive(
  sb: SupabaseClient,
  input: { revisionId: string; adminUserId: string },
): Promise<{ revisionId: string; liveCount: number }> {
  const { error } = await sb.rpc("intro_show_set_live", {
    p_revision_id: input.revisionId,
    p_admin_user_id: input.adminUserId,
  });
  if (error) throw new Error(error.message);
  const { data: liveRows, error: liveError } = await sb.from("intro_show_live").select("id, revision_id");
  if (liveError) throw new Error(liveError.message);
  const valid = (liveRows ?? []).filter((row) => Boolean(row.revision_id));
  if (valid.length !== 1) throw new Error("live_pointer_not_singleton");
  return { revisionId: String(valid[0].revision_id), liveCount: valid.length };
}
