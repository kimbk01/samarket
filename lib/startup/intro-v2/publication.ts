import { validateIntroTargeting } from "@/lib/startup/intro-v2/targeting";
import { validateIntroSceneContract } from "@/lib/startup/intro-v2/scenes";
import {
  INTRO_DEEP_LINK_POLICIES,
  INTRO_FREQUENCY_MODES,
  INTRO_V2_SCHEMA_VERSION,
  isIn,
  type ContractResult,
  type IntroTargeting,
} from "@/lib/startup/intro-v2/types";

export type IntroPublishedManifest = {
  schemaVersion: typeof INTRO_V2_SCHEMA_VERSION;
  publicationId: string;
  revision: number;
  campaign: {
    id: string;
    name: string;
    priority: number;
    timezone: string;
    startsAt: string | null;
    endsAt: string | null;
  };
  targeting: IntroTargeting;
  frequencyMode: string;
  deepLinkPolicy: string;
  scenes: unknown[];
  assets: unknown[];
  deviceOverrides: unknown[];
};

export function validatePublishedManifest(raw: unknown): ContractResult<IntroPublishedManifest> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "manifest_not_object" };
  }
  const rec = raw as Record<string, unknown>;
  if (rec.schemaVersion !== INTRO_V2_SCHEMA_VERSION) return { ok: false, error: "schema_version_invalid" };
  if (typeof rec.publicationId !== "string" || !rec.publicationId) {
    return { ok: false, error: "publication_id_required" };
  }
  if (!Number.isInteger(rec.revision) || Number(rec.revision) < 1) {
    return { ok: false, error: "revision_invalid" };
  }
  const campaign = rec.campaign;
  if (campaign == null || typeof campaign !== "object" || Array.isArray(campaign)) {
    return { ok: false, error: "campaign_required" };
  }
  const c = campaign as Record<string, unknown>;
  if (typeof c.id !== "string" || !c.id) return { ok: false, error: "campaign_id_required" };
  if (typeof c.name !== "string" || !c.name.trim()) return { ok: false, error: "campaign_name_required" };
  if (typeof c.priority !== "number" || !Number.isInteger(c.priority)) {
    return { ok: false, error: "priority_invalid" };
  }
  const targeting = validateIntroTargeting(rec.targeting);
  if (!targeting.ok) return targeting;
  if (!isIn(INTRO_FREQUENCY_MODES, rec.frequencyMode)) return { ok: false, error: "frequency_mode_invalid" };
  if (!isIn(INTRO_DEEP_LINK_POLICIES, rec.deepLinkPolicy)) return { ok: false, error: "deep_link_policy_invalid" };
  if (!Array.isArray(rec.scenes) || rec.scenes.length < 1) return { ok: false, error: "scenes_required" };
  for (const scene of rec.scenes) {
    const ok = validateIntroSceneContract(scene, { allowIncompleteAdvance: false });
    if (!ok.ok) return ok;
  }
  if (rec.draft != null || rec.draftRevision != null || rec.updatedBy != null) {
    return { ok: false, error: "draft_field_leak" };
  }
  return {
    ok: true,
    value: {
      schemaVersion: INTRO_V2_SCHEMA_VERSION,
      publicationId: rec.publicationId,
      revision: Number(rec.revision),
      campaign: {
        id: String(c.id),
        name: String(c.name),
        priority: Number(c.priority),
        timezone: String(c.timezone ?? "Asia/Manila"),
        startsAt: c.startsAt == null ? null : String(c.startsAt),
        endsAt: c.endsAt == null ? null : String(c.endsAt),
      },
      targeting: targeting.value,
      frequencyMode: String(rec.frequencyMode),
      deepLinkPolicy: String(rec.deepLinkPolicy),
      scenes: rec.scenes,
      assets: Array.isArray(rec.assets) ? rec.assets : [],
      deviceOverrides: Array.isArray(rec.deviceOverrides) ? rec.deviceOverrides : [],
    },
  };
}

export function emptyPublishedManifestEnvelope(): {
  schemaVersion: typeof INTRO_V2_SCHEMA_VERSION;
  campaign: null;
} {
  return { schemaVersion: INTRO_V2_SCHEMA_VERSION, campaign: null };
}
