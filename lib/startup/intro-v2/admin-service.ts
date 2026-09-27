/**
 * Intro V2 Admin service — draft rows + immutable publish.
 * Service-role is used only after requireAdminApiUser.
 * Draft save never mutates intro_publications.
 */

import { randomUUID } from "crypto";
import { INTRO_V2_SCHEMA_VERSION } from "@/lib/startup/intro-v2/types";
import { validateIntroCampaignWrite } from "@/lib/startup/intro-v2/admin-write-contract";
import { validatePublishedManifest } from "@/lib/startup/intro-v2/publication";
import {
  validateIntroCampaignDraft,
  validateIntroCampaignForPublish,
  validateIntroScenesAgainstDbAdvanceGate,
} from "@/lib/startup/intro-v2/admin-validate";
import { introRichPublishBlockIssue } from "@/lib/startup/intro-v2/compat-publish";
import { introMediaKindFromMime, introMediaPublishBlockReason } from "@/lib/startup/intro-v2/admin-media";
import {
  collectSceneMediaTypes,
  isV1ImportedDraft,
  v1DisplayDurationMs,
  type IntroAdminAsset,
  type IntroAdminCampaign,
  type IntroAdminListRow,
  type IntroAdminScene,
} from "@/lib/startup/intro-v2/admin-editor-model";
import { emptyIntroTargeting } from "@/lib/startup/intro-v2/admin-targeting-ui";
import { INTRO_ADMIN_DEFAULT_TIMEZONE } from "@/lib/startup/intro-v2/admin-labels";
import { introDraftDivergedFromPublication } from "@/lib/startup/intro-v2/admin-document-state";
import type {
  IntroCampaignStatus,
  IntroCta,
  IntroDeviceFamily,
  IntroLayer,
  IntroTargeting,
} from "@/lib/startup/intro-v2/types";
import type { IntroResolverCandidate } from "@/lib/startup/intro-v2/types";
import {
  deriveIntroOperatorAppState,
  isSupportedIntroImageMime,
  operatorSourcePatch,
  validateOperatorImageForPublish,
} from "@/lib/startup/intro-operator-contract";
import {
  syncCanonicalIntroAfterTransition,
  writeCanonicalPublishedIntro,
} from "@/lib/startup/intro-canonical-writer";
import { loadProductIntroFromDb } from "@/lib/startup/product-intro-db";
import { productIntroGenerationId } from "@/lib/startup/product-intro-native-sync";

export type IntroAdminDb = {
  from: (table: string) => any;
  storage?: {
    from: (bucket: string) => { remove: (paths: string[]) => Promise<unknown> };
  };
};

function asTargeting(raw: unknown): IntroTargeting {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    return {
      audiences: Array.isArray(rec.audiences) ? (rec.audiences as IntroTargeting["audiences"]) : [],
      platforms: Array.isArray(rec.platforms) ? (rec.platforms as IntroTargeting["platforms"]) : [],
      deviceClasses: Array.isArray(rec.deviceClasses)
        ? (rec.deviceClasses as IntroTargeting["deviceClasses"])
        : [],
    };
  }
  return emptyIntroTargeting();
}

function sceneTransitionsFromSource(
  source: Record<string, unknown>
): Record<string, { durationMs?: number; easing?: string }> {
  const phase2 = source.phase2 && typeof source.phase2 === "object" ? (source.phase2 as Record<string, unknown>) : {};
  const raw = phase2.sceneTransitions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, { durationMs?: number; easing?: string }>;
}

function hydrateSceneTransitions(
  scenes: IntroAdminScene[],
  source: Record<string, unknown>
): IntroAdminScene[] {
  const transitions = sceneTransitionsFromSource(source);
  return scenes.map((scene) => ({
    ...scene,
    transitionMs: scene.transitionMs ?? transitions[scene.id]?.durationMs ?? 280,
    transitionEasing: scene.transitionEasing ?? transitions[scene.id]?.easing ?? "ease_out",
  }));
}

function mergePhase2Source(
  previous: Record<string, unknown>,
  scenes: IntroAdminScene[] | undefined,
  incoming?: Record<string, unknown>
): Record<string, unknown> {
  const base = { ...previous, ...(incoming ?? {}) };
  const previousPhase2 =
    base.phase2 && typeof base.phase2 === "object" ? (base.phase2 as Record<string, unknown>) : {};
  const sceneTransitions: Record<string, { durationMs: number; easing: string }> = {
    ...(typeof previousPhase2.sceneTransitions === "object" && previousPhase2.sceneTransitions
      ? (previousPhase2.sceneTransitions as Record<string, { durationMs: number; easing: string }>)
      : {}),
  };
  if (scenes) {
    for (const scene of scenes) {
      sceneTransitions[scene.id] = {
        durationMs: scene.transitionMs ?? 280,
        easing: scene.transitionEasing ?? "ease_out",
      };
    }
  }
  return {
    ...base,
    sizePresetFinalAuthority: false,
    phase2: {
      ...previousPhase2,
      sceneTransitions,
    },
  };
}

function mapScene(row: Record<string, unknown>): IntroAdminScene {
  return {
    id: String(row.id),
    sortOrder: Number(row.sort_order ?? 0),
    name: String(row.name ?? ""),
    advanceMode: (row.advance_mode as IntroAdminScene["advanceMode"]) ?? "manual",
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    maxHoldMs: row.max_hold_ms == null ? null : Number(row.max_hold_ms),
    transition: String(row.transition ?? "none"),
    skipPolicy: String(row.skip_policy ?? "deny"),
    interactionMode: String(row.interaction_mode ?? "none"),
    interactionLayerId: row.interaction_layer_id == null ? null : String(row.interaction_layer_id),
    layers: Array.isArray(row.layers) ? (row.layers as IntroLayer[]) : [],
    cta: (row.cta as IntroCta | null) ?? null,
    backgroundColor: String(row.background_color ?? "#ffffff"),
    backgroundAssetId: row.background_asset_id == null ? null : String(row.background_asset_id),
  };
}

function mapAsset(row: Record<string, unknown>): IntroAdminAsset {
  return {
    id: String(row.id),
    kind: String(row.kind),
    storagePath: String(row.storage_path ?? ""),
    publicUrl: row.public_url == null ? null : String(row.public_url),
    mime: row.mime == null ? null : String(row.mime),
    bytes: row.bytes == null ? null : Number(row.bytes),
    sha256: row.sha256 == null ? null : String(row.sha256),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    loop: row.loop === true,
    decodeStatus: String(row.decode_status ?? "pending"),
  };
}

export async function listIntroAdminCampaigns(
  sb: IntroAdminDb
): Promise<{ ok: true; items: IntroAdminListRow[] } | { ok: false; error: string; httpStatus: number }> {
  const { data, error } = await sb
    .from("intro_campaigns")
    .select(
      "id, name, status, starts_at, ends_at, timezone, priority, targeting, frequency_mode, deep_link_policy, draft_revision, published_publication_id, requires_admin_confirmation, source, updated_at"
    )
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: "list_failed", httpStatus: 500 };

  const campaigns = (data ?? []) as Record<string, unknown>[];
  const ids = campaigns.map((c) => String(c.id));
  const { data: scenes } = ids.length
    ? await sb
        .from("intro_scenes")
        .select("id, campaign_id, sort_order, name, interaction_mode, layers, cta, background_asset_id")
        .in("campaign_id", ids)
    : { data: [] };
  const { data: pubs } = ids.length
    ? await sb
        .from("intro_publications")
        .select("id, campaign_id, revision, published_at, is_live")
        .in("campaign_id", ids)
    : { data: [] };
  const { data: assets } = await sb.from("intro_assets").select("id, kind, public_url");

  const scenesByCampaign = new Map<string, Record<string, unknown>[]>();
  for (const scene of (scenes ?? []) as Record<string, unknown>[]) {
    const cid = String(scene.campaign_id);
    const list = scenesByCampaign.get(cid) ?? [];
    list.push(scene);
    scenesByCampaign.set(cid, list);
  }
  const pubById = new Map(
    ((pubs ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), p])
  );
  const assetById = new Map(
    ((assets ?? []) as Record<string, unknown>[]).map((a) => [String(a.id), a])
  );

  const items: IntroAdminListRow[] = campaigns.map((c) => {
    const source = (c.source && typeof c.source === "object" ? c.source : {}) as Record<string, unknown>;
    const campScenes = scenesByCampaign.get(String(c.id)) ?? [];
    const mediaTypes = new Set<string>();
    let hasCta = false;
    const interactions = new Set<string>();
    let thumbnailUrl: string | null = null;
    for (const scene of campScenes) {
      interactions.add(String(scene.interaction_mode ?? "none"));
      const cta = scene.cta as { enabled?: boolean } | null;
      if (cta?.enabled) hasCta = true;
      const bg = scene.background_asset_id ? assetById.get(String(scene.background_asset_id)) : null;
      if (bg) {
        mediaTypes.add(String(bg.kind));
        if (!thumbnailUrl && bg.public_url) thumbnailUrl = String(bg.public_url);
      }
      const layers = Array.isArray(scene.layers) ? (scene.layers as IntroLayer[]) : [];
      for (const layer of layers) {
        if (layer.assetId && assetById.get(layer.assetId)) {
          mediaTypes.add(String(assetById.get(layer.assetId)?.kind));
          if (!thumbnailUrl && assetById.get(layer.assetId)?.public_url) {
            thumbnailUrl = String(assetById.get(layer.assetId)?.public_url);
          }
        }
      }
    }
    const pub = c.published_publication_id ? pubById.get(String(c.published_publication_id)) : null;
    return {
      id: String(c.id),
      name: String(c.name),
      status: c.status as IntroCampaignStatus,
      startsAt: c.starts_at == null ? null : String(c.starts_at),
      endsAt: c.ends_at == null ? null : String(c.ends_at),
      timezone: String(c.timezone ?? INTRO_ADMIN_DEFAULT_TIMEZONE),
      priority: Number(c.priority ?? 0),
      targeting: asTargeting(c.targeting),
      frequencyMode: (c.frequency_mode as IntroAdminListRow["frequencyMode"]) ?? "every_launch",
      deepLinkPolicy: (c.deep_link_policy as IntroAdminListRow["deepLinkPolicy"]) ?? "honor",
      draftRevision: Number(c.draft_revision ?? 1),
      publishedRevision: pub ? Number(pub.revision) : null,
      publishedAt: pub?.published_at ? String(pub.published_at) : null,
      requiresAdminConfirmation: c.requires_admin_confirmation === true,
      v1Imported: typeof source.v1_key === "string",
      v1DisplayDurationMs: v1DisplayDurationMs(source),
      sceneCount: campScenes.length,
      mediaTypes: [...mediaTypes],
      hasCta,
      interactionModes: [...interactions],
      thumbnailUrl,
      updatedAt: String(c.updated_at ?? ""),
    };
  });

  return { ok: true, items };
}

export async function getIntroAdminCampaign(
  sb: IntroAdminDb,
  id: string
): Promise<{ ok: true; campaign: IntroAdminCampaign } | { ok: false; error: string; httpStatus: number }> {
  const { data, error } = await sb.from("intro_campaigns").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: "load_failed", httpStatus: 500 };
  if (!data) return { ok: false, error: "not_found", httpStatus: 404 };

  const [{ data: scenes }, { data: overrides }, { data: pub }] = await Promise.all([
    sb.from("intro_scenes").select("*").eq("campaign_id", id).order("sort_order", { ascending: true }),
    sb.from("intro_device_overrides").select("*").eq("campaign_id", id),
    data.published_publication_id
      ? sb.from("intro_publications").select("id, revision, published_at, published_by, is_live, manifest").eq("id", data.published_publication_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const mappedScenes = ((scenes ?? []) as Record<string, unknown>[]).map(mapScene);
  const assetIds = new Set<string>();
  for (const scene of mappedScenes) {
    if (scene.backgroundAssetId) assetIds.add(scene.backgroundAssetId);
    for (const layer of scene.layers) if (layer.assetId) assetIds.add(layer.assetId);
  }
  for (const ov of (overrides ?? []) as Record<string, unknown>[]) {
    if (ov.background_asset_id) assetIds.add(String(ov.background_asset_id));
    const layers = Array.isArray(ov.layers) ? (ov.layers as IntroLayer[]) : [];
    for (const layer of layers) if (layer.assetId) assetIds.add(layer.assetId);
  }

  const { data: assets } = assetIds.size
    ? await sb.from("intro_assets").select("*").in("id", [...assetIds])
    : { data: [] };

  const source = (data.source && typeof data.source === "object" ? data.source : {}) as Record<string, unknown>;
  const campaign: IntroAdminCampaign = {
    id: String(data.id),
    name: String(data.name),
    status: data.status,
    startsAt: data.starts_at == null ? null : String(data.starts_at),
    endsAt: data.ends_at == null ? null : String(data.ends_at),
    timezone: String(data.timezone ?? INTRO_ADMIN_DEFAULT_TIMEZONE),
    priority: Number(data.priority ?? 0),
    targeting: asTargeting(data.targeting),
    frequencyMode: data.frequency_mode,
    deepLinkPolicy: data.deep_link_policy,
    draftRevision: Number(data.draft_revision ?? 1),
    publishedPublicationId: data.published_publication_id == null ? null : String(data.published_publication_id),
    requiresAdminConfirmation: data.requires_admin_confirmation === true,
    source,
    updatedAt: String(data.updated_at ?? ""),
    updatedBy: data.updated_by == null ? null : String(data.updated_by),
    scenes: hydrateSceneTransitions(mappedScenes, source),
    assets: ((assets ?? []) as Record<string, unknown>[]).map(mapAsset),
    deviceOverrides: ((overrides ?? []) as Record<string, unknown>[]).map((o) => ({
      id: String(o.id),
      sceneId: o.scene_id == null ? null : String(o.scene_id),
      deviceFamily: o.device_family as IntroDeviceFamily,
      layers: Array.isArray(o.layers) ? (o.layers as IntroLayer[]) : null,
      backgroundAssetId: o.background_asset_id == null ? null : String(o.background_asset_id),
    })),
    published: pub
      ? {
          id: String(pub.id),
          revision: Number(pub.revision),
          publishedAt: String(pub.published_at),
          publishedBy: pub.published_by == null ? null : String(pub.published_by),
          isLive: pub.is_live === true,
        }
      : null,
    draftDivergedFromPublication: false,
  };
  campaign.draftDivergedFromPublication = introDraftDivergedFromPublication(
    campaign,
    pub && typeof pub === "object" && "manifest" in pub ? (pub as { manifest?: unknown }).manifest : null
  );
  return { ok: true, campaign };
}

export async function createIntroAdminCampaign(
  sb: IntroAdminDb,
  input: { adminUserId: string; name: string }
): Promise<{ ok: true; id: string } | { ok: false; error: string; httpStatus: number }> {
  const write = validateIntroCampaignWrite({
    name: input.name,
    status: "draft",
    targeting: emptyIntroTargeting(),
    frequencyMode: "every_launch",
    deepLinkPolicy: "honor",
  });
  if (!write.ok) return { ok: false, error: write.error, httpStatus: 400 };

  const { data, error } = await sb
    .from("intro_campaigns")
    .insert({
      name: write.value.name,
      status: "draft",
      timezone: INTRO_ADMIN_DEFAULT_TIMEZONE,
      priority: 0,
      targeting: emptyIntroTargeting(),
      frequency_mode: "every_launch",
      deep_link_policy: "honor",
      requires_admin_confirmation: false,
      source: operatorSourcePatch({
        sizePreset: "max",
        showLogo: true,
        displayDurationMs: 2500,
        previous: {},
      }),
      updated_by: input.adminUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "create_failed", httpStatus: 500 };
  return { ok: true, id: String(data.id) };
}

export type IntroAdminDraftPatch = {
  name?: string;
  status?: IntroCampaignStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string;
  priority?: number;
  targeting?: IntroTargeting;
  frequencyMode?: string;
  deepLinkPolicy?: string;
  requiresAdminConfirmation?: boolean;
  scenes?: IntroAdminScene[];
  deviceOverrides?: IntroAdminCampaign["deviceOverrides"];
  source?: Record<string, unknown>;
};

export async function saveIntroAdminDraft(
  sb: IntroAdminDb,
  id: string,
  adminUserId: string,
  patch: IntroAdminDraftPatch
): Promise<
  | { ok: true; campaign: IntroAdminCampaign }
  | {
      ok: false;
      error: string;
      httpStatus: number;
      issues?: ReturnType<typeof validateIntroScenesAgainstDbAdvanceGate>["issues"];
    }
> {
  const current = await getIntroAdminCampaign(sb, id);
  if (!current.ok) return current;

  const nextName = patch.name ?? current.campaign.name;
  const nextStatus = patch.status ?? current.campaign.status;
  const nextTargeting = patch.targeting ?? current.campaign.targeting;
  const nextFreq = patch.frequencyMode ?? current.campaign.frequencyMode;
  const nextDeep = patch.deepLinkPolicy ?? current.campaign.deepLinkPolicy;
  const write = validateIntroCampaignWrite({
    name: nextName,
    status: nextStatus,
    targeting: nextTargeting,
    frequencyMode: nextFreq,
    deepLinkPolicy: nextDeep,
    startsAt: patch.startsAt === undefined ? current.campaign.startsAt : patch.startsAt,
    endsAt: patch.endsAt === undefined ? current.campaign.endsAt : patch.endsAt,
  });
  if (!write.ok) return { ok: false, error: write.error, httpStatus: 400 };

  if (patch.deviceOverrides?.some((row) => (row.layers?.length ?? 0) > 0 || Boolean(row.backgroundAssetId))) {
    return {
      ok: false,
      error: "device_creative_override_forbidden",
      httpStatus: 400,
      issues: [
        {
          code: "device_creative_override_forbidden",
          path: "deviceOverrides",
          messageKo: "기기별 크리에이티브 복제는 저장할 수 없습니다.",
          messageEn: "Per-device creative overrides cannot be written.",
        },
      ],
    };
  }

  if (patch.scenes) {
    const persist = validateIntroScenesAgainstDbAdvanceGate({
      ...current.campaign,
      name: nextName,
      status: nextStatus,
      targeting: nextTargeting,
      scenes: patch.scenes,
    });
    if (!persist.ok) {
      return {
        ok: false,
        error: persist.issues[0]?.code ?? "scene_invalid",
        httpStatus: 400,
        issues: persist.issues,
      };
    }
    const draft = validateIntroCampaignDraft({
      ...current.campaign,
      name: nextName,
      status: nextStatus,
      targeting: nextTargeting,
      scenes: patch.scenes,
    });
    if (!draft.ok) {
      return {
        ok: false,
        error: draft.issues[0]?.code ?? "scene_invalid",
        httpStatus: 400,
        issues: draft.issues,
      };
    }
  }

  if (patch.scenes) {
    const replaced = await replaceIntroScenes(sb, id, patch.scenes);
    if (!replaced.ok) return replaced;
  }

  const nextSource = mergePhase2Source(
    current.campaign.source,
    patch.scenes,
    patch.source
  );

  const { error: campErr } = await sb
    .from("intro_campaigns")
    .update({
      name: write.value.name,
      status: write.value.status,
      starts_at: patch.startsAt === undefined ? current.campaign.startsAt : patch.startsAt,
      ends_at: patch.endsAt === undefined ? current.campaign.endsAt : patch.endsAt,
      timezone: patch.timezone ?? current.campaign.timezone,
      priority: patch.priority ?? current.campaign.priority,
      targeting: write.value.targeting,
      frequency_mode: write.value.frequencyMode,
      deep_link_policy: write.value.deepLinkPolicy,
      requires_admin_confirmation:
        patch.requiresAdminConfirmation ?? current.campaign.requiresAdminConfirmation,
      source: nextSource,
      updated_by: adminUserId,
    })
    .eq("id", id);
  if (campErr) {
    if (patch.scenes) {
      await replaceIntroScenes(sb, id, current.campaign.scenes);
    }
    return { ok: false, error: "draft_save_failed", httpStatus: 500 };
  }

  return getIntroAdminCampaign(sb, id);
}

async function replaceIntroScenes(
  sb: IntroAdminDb,
  campaignId: string,
  scenes: IntroAdminScene[]
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  const normalized = scenes.map((scene, index) => ({ ...scene, sortOrder: index }));
  const { data: existing } = await sb.from("intro_scenes").select("id").eq("campaign_id", campaignId);
  const keep = new Set(normalized.map((s) => s.id).filter((id) => !id.startsWith("tmp-")));
  const toDelete = ((existing ?? []) as { id: string }[]).filter((r) => !keep.has(r.id)).map((r) => r.id);
  if (toDelete.length) {
    await sb.from("intro_scenes").delete().in("id", toDelete);
  }

  // Unique (campaign_id, sort_order): park existing rows, then write final order.
  for (const scene of normalized) {
    if (!scene.id.startsWith("tmp-")) {
      await sb.from("intro_scenes").update({ sort_order: scene.sortOrder + 1000 }).eq("id", scene.id);
    }
  }

  for (const scene of normalized) {
    const row = {
      campaign_id: campaignId,
      sort_order: scene.sortOrder,
      name: scene.name,
      advance_mode: scene.advanceMode,
      duration_ms: scene.durationMs,
      max_hold_ms: scene.maxHoldMs,
      transition: scene.transition,
      skip_policy: scene.skipPolicy,
      interaction_mode: scene.interactionMode,
      interaction_layer_id: scene.interactionLayerId,
      layers: scene.layers,
      cta: scene.cta,
      background_color: scene.backgroundColor,
      background_asset_id: scene.backgroundAssetId,
    };
    if (scene.id.startsWith("tmp-")) {
      const { error } = await sb.from("intro_scenes").insert(row);
      if (error) return { ok: false, error: "scene_save_failed", httpStatus: 500 };
    } else {
      const { error } = await sb.from("intro_scenes").update(row).eq("id", scene.id);
      if (error) return { ok: false, error: "scene_save_failed", httpStatus: 500 };
    }
  }
  return { ok: true };
}

export async function transitionIntroAdminCampaign(
  sb: IntroAdminDb,
  id: string,
  adminUserId: string,
  action: "pause" | "resume" | "archive"
): Promise<{ ok: true; campaign: IntroAdminCampaign } | { ok: false; error: string; httpStatus: number }> {
  const current = await getIntroAdminCampaign(sb, id);
  if (!current.ok) return current;
  let status: IntroCampaignStatus = current.campaign.status;
  if (action === "pause") status = "paused";
  else if (action === "archive") status = "archived";
  else if (action === "resume") {
    if (current.campaign.status !== "paused") {
      return { ok: false, error: "resume_not_valid", httpStatus: 400 };
    }
    status = current.campaign.startsAt && Date.parse(current.campaign.startsAt) > Date.now()
      ? "scheduled"
      : "active";
  }
  const { error } = await sb
    .from("intro_campaigns")
    .update({ status, updated_by: adminUserId })
    .eq("id", id);
  if (error) return { ok: false, error: "transition_failed", httpStatus: 500 };
  const after = await getIntroAdminCampaign(sb, id);
  if (!after.ok) return after;
  const synced = await syncCanonicalIntroAfterTransition(sb, after.campaign);
  if (!synced.ok) return { ok: false, error: synced.error, httpStatus: 500 };
  return after;
}

function collectReferencedAssetIds(campaign: IntroAdminCampaign): string[] {
  const ids = new Set<string>();
  for (const scene of campaign.scenes) {
    if (scene.backgroundAssetId) ids.add(scene.backgroundAssetId);
    for (const layer of scene.layers) if (layer.assetId) ids.add(layer.assetId);
  }
  for (const ov of campaign.deviceOverrides) {
    if (ov.backgroundAssetId) ids.add(ov.backgroundAssetId);
    for (const layer of ov.layers ?? []) if (layer.assetId) ids.add(layer.assetId);
  }
  return [...ids];
}

export function buildIntroPublicationManifest(
  campaign: IntroAdminCampaign,
  publicationId: string,
  revision: number
): Record<string, unknown> {
  const referenced = new Set(collectReferencedAssetIds(campaign));
  const assets = campaign.assets
    .filter((a) => referenced.has(a.id))
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      storagePath: a.storagePath,
      publicUrl: a.publicUrl,
      mime: a.mime,
      bytes: a.bytes,
      sha256: a.sha256,
      width: a.width,
      height: a.height,
      durationMs: a.durationMs,
      loop: a.loop,
      decodeStatus: a.decodeStatus,
    }));
  return {
    schemaVersion: INTRO_V2_SCHEMA_VERSION,
    publicationId,
    revision,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      priority: campaign.priority,
      timezone: campaign.timezone,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
    },
    schedule: {
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      timezone: campaign.timezone,
    },
    targeting: campaign.targeting,
    frequencyMode: campaign.frequencyMode,
    frequency: { mode: campaign.frequencyMode },
    deepLinkPolicy: campaign.deepLinkPolicy,
    scenes: campaign.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      sortOrder: s.sortOrder,
      advanceMode: s.advanceMode,
      durationMs: s.durationMs,
      maxHoldMs: s.maxHoldMs,
      transition: s.transition,
      skipPolicy: s.skipPolicy,
      interactionMode: s.interactionMode,
      interactionLayerId: s.interactionLayerId,
      layers: s.layers,
      cta: s.cta,
      backgroundColor: s.backgroundColor,
      backgroundAssetId: s.backgroundAssetId,
    })),
    assets,
    deviceOverrides: campaign.deviceOverrides.map((o) => ({
      deviceFamily: o.deviceFamily,
      sceneId: o.sceneId,
      layers: o.layers,
      backgroundAssetId: o.backgroundAssetId,
    })),
  };
}

export async function publishIntroAdminCampaign(
  sb: IntroAdminDb,
  id: string,
  adminUserId: string
): Promise<
  | { ok: true; campaign: IntroAdminCampaign; revision: number; publicationId: string }
  | { ok: false; error: string; httpStatus: number; issues?: ReturnType<typeof validateIntroCampaignForPublish>["issues"] }
> {
  const current = await getIntroAdminCampaign(sb, id);
  if (!current.ok) return current;
  const campaign = current.campaign;
  const richBlock = introRichPublishBlockIssue(campaign);
  if (richBlock) {
    return { ok: false, error: richBlock.code, httpStatus: 400, issues: [richBlock] };
  }
  const operatorCheck = validateOperatorImageForPublish(campaign);
  if (!operatorCheck.ok) {
    return { ok: false, error: operatorCheck.error ?? "publish_validation_failed", httpStatus: 400 };
  }
  const validation = validateIntroCampaignForPublish(campaign);
  if (!validation.ok) {
    return { ok: false, error: "publish_validation_failed", httpStatus: 400, issues: validation.issues };
  }

  const { data: revRow } = await sb
    .from("intro_publications")
    .select("revision")
    .eq("campaign_id", id)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextRev = Number(revRow?.revision ?? 0) + 1;
  const publicationId = randomUUID();
  const manifest = buildIntroPublicationManifest(campaign, publicationId, nextRev);
  const checked = validatePublishedManifest(manifest);
  if (!checked.ok) return { ok: false, error: checked.error, httpStatus: 400 };

  const { error: liveOff } = await sb
    .from("intro_publications")
    .update({ is_live: false })
    .eq("campaign_id", id)
    .eq("is_live", true);
  if (liveOff) return { ok: false, error: "publish_failed", httpStatus: 500 };

  const { error: ins } = await sb.from("intro_publications").insert({
    id: publicationId,
    campaign_id: id,
    revision: nextRev,
    manifest,
    asset_checksums: manifest.assets,
    published_by: adminUserId,
    is_live: true,
  });
  if (ins) return { ok: false, error: "publish_failed", httpStatus: 500 };

  const nextStatus: IntroCampaignStatus =
    campaign.startsAt && Date.parse(campaign.startsAt) > Date.now() ? "scheduled" : "active";
  const { error: up } = await sb
    .from("intro_campaigns")
    .update({
      published_publication_id: publicationId,
      draft_revision: campaign.draftRevision + 1,
      status: nextStatus,
      requires_admin_confirmation: false,
      updated_by: adminUserId,
    })
    .eq("id", id);
  if (up) return { ok: false, error: "publish_failed", httpStatus: 500 };

  const after = await getIntroAdminCampaign(sb, id);
  if (!after.ok) return after;
  const written = await writeCanonicalPublishedIntro(sb, after.campaign, "active");
  if (!written.ok) {
    await sb.from("intro_publications").update({ is_live: false }).eq("id", publicationId);
    await sb.from("intro_campaigns").update({
      status: campaign.status,
      published_publication_id: campaign.publishedPublicationId,
      updated_by: adminUserId,
    }).eq("id", id);
    return { ok: false, error: written.error, httpStatus: 500 };
  }
  return { ok: true, campaign: after.campaign, revision: nextRev, publicationId };
}

export async function registerIntroAdminAsset(
  sb: IntroAdminDb,
  input: {
    publicUrl: string;
    storagePath: string;
    mime: string | null;
    bytes: number | null;
    width?: number | null;
    height?: number | null;
  }
): Promise<{ ok: true; asset: IntroAdminAsset } | { ok: false; error: string; httpStatus: number }> {
  const kind = introMediaKindFromMime(input.mime);
  if (kind !== "image" || !isSupportedIntroImageMime(input.mime)) {
    return { ok: false, error: "media_pipeline_not_ready", httpStatus: 400 };
  }
  const { data, error } = await sb
    .from("intro_assets")
    .insert({
      kind: "image",
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      mime: input.mime,
      bytes: input.bytes,
      width: input.width ?? null,
      height: input.height ?? null,
      decode_status: "ready",
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: "asset_create_failed", httpStatus: 500 };
  const mapped = mapAsset(data as Record<string, unknown>);
  const block = introMediaPublishBlockReason(mapped);
  if (block) return { ok: false, error: block, httpStatus: 400 };
  return { ok: true, asset: mapped };
}

export async function listLiveIntroResolverCandidates(
  sb: IntroAdminDb
): Promise<Array<IntroResolverCandidate & { name: string; targeting: IntroTargeting; frequencyMode: string }>> {
  const { data } = await sb
    .from("intro_publications")
    .select("id, campaign_id, revision, is_live, manifest")
    .eq("is_live", true);
  const pubs = (data ?? []) as Record<string, unknown>[];
  const campaignIds = pubs.map((p) => String(p.campaign_id));
  const { data: camps } = campaignIds.length
    ? await sb
        .from("intro_campaigns")
        .select("id, name, status, starts_at, ends_at, priority, targeting")
        .in("id", campaignIds)
    : { data: [] };
  const campById = new Map(((camps ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]));
  return pubs.flatMap((p) => {
    const camp = campById.get(String(p.campaign_id));
    if (!camp) return [];
    const manifest = (p.manifest && typeof p.manifest === "object" ? p.manifest : {}) as Record<string, unknown>;
    return [
      {
        id: String(camp.id),
        name: String(camp.name),
        publicationId: String(p.id),
        revision: Number(p.revision),
        status: camp.status as IntroResolverCandidate["status"],
        startsAt: camp.starts_at == null ? null : String(camp.starts_at),
        endsAt: camp.ends_at == null ? null : String(camp.ends_at),
        priority: Number(camp.priority ?? 0),
        targeting: asTargeting(camp.targeting),
        frequencyMode: String(manifest.frequencyMode ?? "every_launch"),
      },
    ];
  });
}

export function listRowMediaSummary(row: IntroAdminListRow): string {
  return collectSceneMediaTypes(
    [],
    row.mediaTypes.map((kind) => ({
      id: kind,
      kind,
      storagePath: "",
      publicUrl: null,
      mime: null,
      bytes: null,
      sha256: null,
      width: null,
      height: null,
      durationMs: null,
      loop: false,
      decodeStatus: "ready",
    }))
  ).join(", ");
}

export async function collectReferencedIntroAssetIds(sb: IntroAdminDb): Promise<Set<string>> {
  const ids = new Set<string>();
  const { data: scenes } = await sb
    .from("intro_scenes")
    .select("background_asset_id, layers");
  for (const scene of (scenes ?? []) as Record<string, unknown>[]) {
    if (scene.background_asset_id) ids.add(String(scene.background_asset_id));
    const layers = Array.isArray(scene.layers) ? (scene.layers as IntroLayer[]) : [];
    for (const layer of layers) if (layer.assetId) ids.add(layer.assetId);
  }
  const { data: overrides } = await sb
    .from("intro_device_overrides")
    .select("background_asset_id, layers");
  for (const ov of (overrides ?? []) as Record<string, unknown>[]) {
    if (ov.background_asset_id) ids.add(String(ov.background_asset_id));
    const layers = Array.isArray(ov.layers) ? (ov.layers as IntroLayer[]) : [];
    for (const layer of layers) if (layer.assetId) ids.add(layer.assetId);
  }
  const { data: pubs } = await sb.from("intro_publications").select("manifest");
  for (const pub of (pubs ?? []) as Record<string, unknown>[]) {
    const manifest = pub.manifest && typeof pub.manifest === "object" ? (pub.manifest as Record<string, unknown>) : {};
    const assets = Array.isArray(manifest.assets) ? (manifest.assets as Array<{ id?: unknown }>) : [];
    for (const asset of assets) if (asset.id) ids.add(String(asset.id));
  }
  return ids;
}

function bucketFromPublicUrl(url: string): { bucket: string; path: string } | null {
  const marker = "/storage/v1/object/public/";
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const rest = url.slice(idx + marker.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

export async function cleanupUnreferencedIntroImageAssets(
  sb: IntroAdminDb,
  candidateIds: string[]
): Promise<{ ok: true; removed: string[] } | { ok: false; error: string }> {
  const unique = [...new Set(candidateIds.filter(Boolean))];
  if (!unique.length) return { ok: true, removed: [] };
  const referenced = await collectReferencedIntroAssetIds(sb);
  const eligible = unique.filter((id) => !referenced.has(id));
  if (!eligible.length) return { ok: true, removed: [] };
  const { data: rows } = await sb
    .from("intro_assets")
    .select("id, kind, public_url, storage_path")
    .in("id", eligible)
    .eq("kind", "image");
  const removed: string[] = [];
  for (const row of (rows ?? []) as Record<string, unknown>[]) {
    const publicUrl = row.public_url == null ? "" : String(row.public_url);
    const parsed = publicUrl ? bucketFromPublicUrl(publicUrl) : null;
    const path = parsed?.path || String(row.storage_path ?? "");
    if (parsed?.bucket && path && sb.storage) {
      await sb.storage.from(parsed.bucket).remove([path]);
    }
    const { error } = await sb.from("intro_assets").delete().eq("id", String(row.id));
    if (!error) removed.push(String(row.id));
  }
  return { ok: true, removed };
}

export async function deleteIntroAdminDraft(
  sb: IntroAdminDb,
  id: string
): Promise<{ ok: true; removedAssets: string[] } | { ok: false; error: string; httpStatus: number }> {
  const current = await getIntroAdminCampaign(sb, id);
  if (!current.ok) return current;
  if (current.campaign.status !== "draft") {
    return { ok: false, error: "draft_only_delete", httpStatus: 409 };
  }
  const candidateIds = collectReferencedAssetIds(current.campaign);
  await sb.from("intro_device_overrides").delete().eq("campaign_id", id);
  await sb.from("intro_scenes").delete().eq("campaign_id", id);
  const { error } = await sb.from("intro_campaigns").delete().eq("id", id);
  if (error) return { ok: false, error: "delete_failed", httpStatus: 500 };
  const cleaned = await cleanupUnreferencedIntroImageAssets(sb, candidateIds);
  return { ok: true, removedAssets: cleaned.ok ? cleaned.removed : [] };
}

export async function duplicateIntroAdminCampaign(
  sb: IntroAdminDb,
  id: string,
  adminUserId: string
): Promise<{ ok: true; id: string } | { ok: false; error: string; httpStatus: number }> {
  const current = await getIntroAdminCampaign(sb, id);
  if (!current.ok) return current;
  const created = await createIntroAdminCampaign(sb, {
    adminUserId,
    name: `${current.campaign.name} copy`.slice(0, 120),
  });
  if (!created.ok) return created;
  const scenes = current.campaign.scenes.map((scene, index) => ({
    ...scene,
    id: `tmp-${index}-${Date.now()}`,
  }));
  const saved = await saveIntroAdminDraft(sb, created.id, adminUserId, {
    targeting: current.campaign.targeting,
    frequencyMode: current.campaign.frequencyMode,
    deepLinkPolicy: current.campaign.deepLinkPolicy,
    startsAt: current.campaign.startsAt,
    endsAt: current.campaign.endsAt,
    timezone: current.campaign.timezone,
    source: {
      ...current.campaign.source,
      duplicatedFrom: current.campaign.id,
    },
    scenes,
    deviceOverrides: [],
  });
  if (!saved.ok) return { ok: false, error: saved.error, httpStatus: saved.httpStatus };
  return { ok: true, id: created.id };
}

export { isV1ImportedDraft, v1DisplayDurationMs, deriveIntroOperatorAppState, productIntroGenerationId, loadProductIntroFromDb };
