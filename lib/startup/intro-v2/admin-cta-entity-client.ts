/**
 * CMS CTA entity search client — leftover Composer/Operator search, reused by the
 * single routed editor. Server authority remains admin-entity-search.ts.
 */

import type { IntroAdminCampaign } from "@/lib/startup/intro-v2/admin-editor-model";
import type { IntroEntityHit, IntroEntityKind } from "@/lib/startup/intro-v2/admin-entity-search";

export const INTRO_CTA_ENTITY_KINDS = new Set<IntroEntityKind>([
  "STORE",
  "PRODUCT",
  "LISTING",
  "POST",
  "CHAT_ROOM",
  "EVENT",
]);

export function isIntroCtaEntityKind(type: string): type is IntroEntityKind {
  return INTRO_CTA_ENTITY_KINDS.has(type as IntroEntityKind);
}

export function collectUnresolvedIntroCtaEntityIds(
  campaign: IntroAdminCampaign
): Map<IntroEntityKind, string[]> {
  const byKind = new Map<IntroEntityKind, string[]>();
  for (const scene of campaign.scenes) {
    const dest = scene.cta?.destination;
    if (!dest?.id || dest.label || !isIntroCtaEntityKind(dest.type)) continue;
    const list = byKind.get(dest.type) ?? [];
    list.push(dest.id);
    byKind.set(dest.type, list);
  }
  return byKind;
}

export function applyIntroCtaEntityLabels(
  campaign: IntroAdminCampaign,
  labels: Map<string, string>
): IntroAdminCampaign {
  return {
    ...campaign,
    scenes: campaign.scenes.map((scene) => {
      const dest = scene.cta?.destination;
      if (!dest?.id) return scene;
      const label = labels.get(`${dest.type}:${dest.id}`);
      if (!label || !scene.cta) return scene;
      return { ...scene, cta: { ...scene.cta, destination: { ...dest, label } } };
    }),
  };
}

export async function searchIntroCtaEntities(kind: string, q: string): Promise<IntroEntityHit[]> {
  if (!isIntroCtaEntityKind(kind) || q.trim().length < 1) return [];
  const res = await fetch(
    `/api/admin/intro-campaigns/entity-search?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}`,
    { credentials: "same-origin" }
  );
  const json = (await res.json().catch(() => ({}))) as { items?: IntroEntityHit[] };
  return json.items ?? [];
}

export async function withResolvedIntroCtaLabels(
  campaign: IntroAdminCampaign
): Promise<IntroAdminCampaign> {
  const byKind = collectUnresolvedIntroCtaEntityIds(campaign);
  if (byKind.size === 0) return campaign;
  const labels = new Map<string, string>();
  await Promise.all(
    [...byKind.entries()].map(async ([kind, ids]) => {
      const res = await fetch(
        `/api/admin/intro-campaigns/entity-search?kind=${encodeURIComponent(kind)}&ids=${encodeURIComponent(ids.join(","))}`,
        { credentials: "same-origin" }
      );
      const json = (await res.json().catch(() => ({}))) as { items?: Array<{ id: string; label: string }> };
      for (const item of json.items ?? []) labels.set(`${kind}:${item.id}`, item.label);
    })
  );
  return applyIntroCtaEntityLabels(campaign, labels);
}
