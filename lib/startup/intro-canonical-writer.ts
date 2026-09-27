import { loadProductIntroFromDb, saveProductIntroToDb } from "@/lib/startup/product-intro-db";
import { productIntroGenerationId } from "@/lib/startup/product-intro-native-sync";
import {
  mapOperatorCampaignToProductIntro,
  type IntroOperatorAppState,
} from "@/lib/startup/intro-operator-contract";
import type { IntroAdminCampaign } from "@/lib/startup/intro-v2/admin-editor-model";

type IntroWriterDb = { from: (table: string) => unknown };

export async function writeCanonicalPublishedIntro(
  sb: IntroWriterDb,
  campaign: IntroAdminCampaign,
  status: "active" | "inactive"
): Promise<
  | { ok: true; generationId: string }
  | { ok: false; error: string }
> {
  const mapped = mapOperatorCampaignToProductIntro(campaign, status);
  if ("ok" in mapped) {
    if (status === "inactive") {
      const current = await loadProductIntroFromDb(sb as never);
      if (current.ok && current.config.campaignId === campaign.id) {
        const saved = await saveProductIntroToDb(sb as never, {
          ...current.config,
          status: "inactive",
        });
        if (!saved.ok) return { ok: false, error: saved.error };
        return { ok: true, generationId: productIntroGenerationId(saved.config) };
      }
      return { ok: true, generationId: "" };
    }
    return { ok: false, error: mapped.error };
  }
  const saved = await saveProductIntroToDb(sb as never, mapped);
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, generationId: productIntroGenerationId(saved.config) };
}

export async function syncCanonicalIntroAfterTransition(
  sb: IntroWriterDb,
  campaign: IntroAdminCampaign
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await loadProductIntroFromDb(sb as never);
  const applied = current.ok && current.config.campaignId === campaign.id;
  if (campaign.status === "paused" || campaign.status === "archived" || campaign.status === "expired") {
    if (!applied) return { ok: true };
    return (await writeCanonicalPublishedIntro(sb, campaign, "inactive")).ok
      ? { ok: true }
      : { ok: false, error: "canonical_sync_failed" };
  }
  if (campaign.status === "active" || campaign.status === "scheduled") {
    const noneApplied = !current.ok || !current.config.campaignId || current.config.status !== "active";
    if (!applied && !noneApplied) return { ok: true };
    const written = await writeCanonicalPublishedIntro(sb, campaign, "active");
    return written.ok ? { ok: true } : { ok: false, error: written.error };
  }
  return { ok: true };
}

export function appliedIntroIdentity(config: {
  campaignId: string | null;
  status: string;
}): { campaignId: string | null; status: string | null } {
  return {
    campaignId: config.campaignId,
    status: config.status,
  };
}

export type { IntroOperatorAppState };
