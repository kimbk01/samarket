/**
 * Ads placement collision — presentation-only over existing campaign inventory/schedule/lifecycle.
 * No conflict table. Distinguishes allowed multi-placement vs true capacity/overlap problems.
 */

import {
  BANNER_DUPLICATE_POLICY,
  bannerPlacementDefaultCapacity,
} from "@/lib/ads/banner-placement-capacity-ssot";

export type AdsCollisionSeverity = "NONE" | "WARNING" | "BLOCKING";

export type AdsCollisionCampaignInput = {
  id: string;
  storeId: string | null;
  storeName?: string | null;
  title?: string | null;
  productKind?: string | null;
  inventoryKeys: string[];
  lifecycleStatus: string;
  startAt: string | null;
  endAt: string | null;
  creativeId?: string | null;
  /** Optional inventory capacity; default 1 for unknown keys */
  capacityByInventory?: Record<string, number>;
};

export type AdsCollisionPeer = {
  id: string;
  storeName: string;
  placementKey: string;
  lifecycleStatus: string;
  startAt: string | null;
  endAt: string | null;
};

export type AdsCollisionFinding = {
  campaignId: string;
  storeId: string | null;
  storeName: string;
  productKind: string;
  placementKey: string;
  placementLabel: string;
  startAt: string | null;
  endAt: string | null;
  severity: AdsCollisionSeverity;
  /** Human labels — never expose raw enum as primary */
  severityLabelKo: string;
  severityLabelEn: string;
  reasonKo: string;
  reasonEn: string;
  checkCode:
    | "A_SAME_STORE_PLACEMENT_OVERLAP"
    | "B_SAME_STORE_MULTI_PLACEMENT"
    | "C_SAME_CREATIVE_MULTI_PLACEMENT"
    | "D_DUPLICATE_APPLICATION"
    | "E_CAPACITY_EXCEEDED"
    | "F_SCHEDULED_ACTIVE_OVERLAP"
    | "G_INACTIVE_EXCLUDED";
  peers: AdsCollisionPeer[];
  hrefHint: string;
};

function severityLabels(s: AdsCollisionSeverity): { ko: string; en: string } {
  if (s === "BLOCKING") return { ko: "기간 만석", en: "Period full" };
  if (s === "WARNING") return { ko: "중복 기간", en: "Overlapping period" };
  return { ko: "정상", en: "OK" };
}

/** ACTIVE / SCHEDULED count toward exposure overlap; paused/hidden/ended do not (check G). */
export function isExposureOverlapCandidate(lifecycle: string): boolean {
  const s = String(lifecycle ?? "").trim().toUpperCase();
  if (!s) return false;
  if (s === "ACTIVE" || s === "SCHEDULED") return true;
  if (s.startsWith("PAUSED") || s === "HIDDEN" || s === "ENDED" || s === "CANCELLED") return false;
  if (s === "REJECTED" || s === "DRAFT" || s.includes("REVIEW")) return false;
  return false;
}

function capacityForKey(key: string, override?: Record<string, number>): number {
  if (override && typeof override[key] === "number" && override[key]! > 0) {
    return Math.trunc(override[key]!);
  }
  return bannerPlacementDefaultCapacity(key);
}

export function intervalsOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  const as = aStart ? new Date(aStart).getTime() : Number.NEGATIVE_INFINITY;
  const ae = aEnd ? new Date(aEnd).getTime() : Number.POSITIVE_INFINITY;
  const bs = bStart ? new Date(bStart).getTime() : Number.NEGATIVE_INFINITY;
  const be = bEnd ? new Date(bEnd).getTime() : Number.POSITIVE_INFINITY;
  if (![as, ae, bs, be].every((n) => Number.isFinite(n) || n === Number.NEGATIVE_INFINITY || n === Number.POSITIVE_INFINITY)) {
    return false;
  }
  return as <= be && bs <= ae;
}

function capacityFor(key: string, override?: Record<string, number>): number {
  return capacityForKey(key, override);
}

/**
 * Compute collision findings for Admin presentation.
 * Policy: multi-placement same store same period = WARNING (allowed review), not auto-block.
 * Capacity exceeded or same store+same placement overlap with capacity 1 = BLOCKING.
 */
export function detectPlacementCollisions(
  campaigns: AdsCollisionCampaignInput[],
  opts?: { hrefForId?: (id: string) => string }
): AdsCollisionFinding[] {
  const hrefForId = opts?.hrefForId ?? ((id: string) => `/admin/delivery-ads/${encodeURIComponent(id)}`);
  const findings: AdsCollisionFinding[] = [];
  const candidates = campaigns.filter((c) => isExposureOverlapCandidate(c.lifecycleStatus));

  // Index: inventory key → candidates
  const byInv = new Map<string, AdsCollisionCampaignInput[]>();
  for (const c of candidates) {
    const keys = c.inventoryKeys.length > 0 ? c.inventoryKeys : ["_unassigned"];
    for (const k of keys) {
      const list = byInv.get(k) ?? [];
      list.push(c);
      byInv.set(k, list);
    }
  }

  const seenPair = new Set<string>();

  for (const [placementKey, list] of byInv) {
    if (placementKey === "_unassigned") continue;
    const cap = capacityFor(placementKey, list[0]?.capacityByInventory);

    // E — capacity exceeded across overlapping windows (greedy pairwise clusters)
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      const overlapping = list.filter(
        (b) => b.id !== a.id && intervalsOverlap(a.startAt, a.endAt, b.startAt, b.endAt)
      );
      if (overlapping.length + 1 > cap) {
        const sev: AdsCollisionSeverity = cap <= 1 ? "BLOCKING" : "WARNING";
        const labels = severityLabels(sev);
        findings.push({
          campaignId: a.id,
          storeId: a.storeId,
          storeName: a.storeName || a.title || a.id.slice(0, 8),
          productKind: String(a.productKind ?? "delivery"),
          placementKey,
          placementLabel: placementKey,
          startAt: a.startAt,
          endAt: a.endAt,
          severity: sev,
          severityLabelKo: labels.ko,
          severityLabelEn: labels.en,
          reasonKo:
            sev === "BLOCKING"
              ? `동일 placement 용량(${cap})을 넘는 동시 집행이 있습니다.`
              : `동일 placement에서 용량(${cap}) 대비 중복 집행이 있습니다. 확인이 필요합니다.`,
          reasonEn:
            sev === "BLOCKING"
              ? `Concurrent executions exceed placement capacity (${cap}).`
              : `Placement has more overlapping executions than capacity (${cap}). Review needed.`,
          checkCode: "E_CAPACITY_EXCEEDED",
          peers: overlapping.map((p) => ({
            id: p.id,
            storeName: p.storeName || p.title || p.id.slice(0, 8),
            placementKey,
            lifecycleStatus: p.lifecycleStatus,
            startAt: p.startAt,
            endAt: p.endAt,
          })),
          hrefHint: hrefForId(a.id),
        });
      }
    }

    // A / F — same store + same placement + overlap
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (!a.storeId || !b.storeId || a.storeId !== b.storeId) continue;
        if (!intervalsOverlap(a.startAt, a.endAt, b.startAt, b.endAt)) continue;
        const pairKey = `A:${placementKey}:${[a.id, b.id].sort().join(":")}`;
        if (seenPair.has(pairKey)) continue;
        seenPair.add(pairKey);
        const bothActiveish =
          a.lifecycleStatus.toUpperCase() === "ACTIVE" || b.lifecycleStatus.toUpperCase() === "ACTIVE";
        const sev: AdsCollisionSeverity = cap <= 1 || bothActiveish ? "BLOCKING" : "WARNING";
        const labels = severityLabels(sev);
        const checkCode =
          a.lifecycleStatus.toUpperCase() === "SCHEDULED" || b.lifecycleStatus.toUpperCase() === "SCHEDULED"
            ? "F_SCHEDULED_ACTIVE_OVERLAP"
            : "A_SAME_STORE_PLACEMENT_OVERLAP";
        findings.push({
          campaignId: a.id,
          storeId: a.storeId,
          storeName: a.storeName || a.title || a.id.slice(0, 8),
          productKind: String(a.productKind ?? "delivery"),
          placementKey,
          placementLabel: placementKey,
          startAt: a.startAt,
          endAt: a.endAt,
          severity: sev,
          severityLabelKo: labels.ko,
          severityLabelEn: labels.en,
          reasonKo: BANNER_DUPLICATE_POLICY.humanKo,
          reasonEn: BANNER_DUPLICATE_POLICY.humanEn,
          checkCode,
          peers: [
            {
              id: b.id,
              storeName: b.storeName || b.title || b.id.slice(0, 8),
              placementKey,
              lifecycleStatus: b.lifecycleStatus,
              startAt: b.startAt,
              endAt: b.endAt,
            },
          ],
          hrefHint: hrefForId(a.id),
        });
      }
    }
  }

  // B — same store, different placements, overlapping period (WARNING only — often allowed)
  const byStore = new Map<string, AdsCollisionCampaignInput[]>();
  for (const c of candidates) {
    if (!c.storeId) continue;
    const list = byStore.get(c.storeId) ?? [];
    list.push(c);
    byStore.set(c.storeId, list);
  }
  for (const [, list] of byStore) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (!intervalsOverlap(a.startAt, a.endAt, b.startAt, b.endAt)) continue;
        const aKeys = new Set(a.inventoryKeys);
        const shared = b.inventoryKeys.some((k) => aKeys.has(k));
        if (shared) continue; // covered by A
        const pairKey = `B:${[a.id, b.id].sort().join(":")}`;
        if (seenPair.has(pairKey)) continue;
        seenPair.add(pairKey);
        const labels = severityLabels("WARNING");
        findings.push({
          campaignId: a.id,
          storeId: a.storeId,
          storeName: a.storeName || a.title || a.id.slice(0, 8),
          productKind: String(a.productKind ?? "delivery"),
          placementKey: a.inventoryKeys[0] ?? "multi",
          placementLabel: `${a.inventoryKeys.join(",")} ↔ ${b.inventoryKeys.join(",")}`,
          startAt: a.startAt,
          endAt: a.endAt,
          severity: "WARNING",
          severityLabelKo: labels.ko,
          severityLabelEn: labels.en,
          reasonKo: "같은 매장이 다른 placement에서 같은 기간에 집행 중입니다. 정책상 허용될 수 있으니 확인하세요.",
          reasonEn: "Same store runs on different placements in the same period. May be allowed — review.",
          checkCode: "B_SAME_STORE_MULTI_PLACEMENT",
          peers: [
            {
              id: b.id,
              storeName: b.storeName || b.title || b.id.slice(0, 8),
              placementKey: b.inventoryKeys[0] ?? "multi",
              lifecycleStatus: b.lifecycleStatus,
              startAt: b.startAt,
              endAt: b.endAt,
            },
          ],
          hrefHint: hrefForId(a.id),
        });
      }
    }
  }

  // C — same creative on multiple placements
  const byCreative = new Map<string, AdsCollisionCampaignInput[]>();
  for (const c of candidates) {
    const cid = String(c.creativeId ?? "").trim();
    if (!cid) continue;
    const list = byCreative.get(cid) ?? [];
    list.push(c);
    byCreative.set(cid, list);
  }
  for (const [, list] of byCreative) {
    if (list.length < 2) continue;
    const a = list[0]!;
    const labels = severityLabels("WARNING");
    findings.push({
      campaignId: a.id,
      storeId: a.storeId,
      storeName: a.storeName || a.title || a.id.slice(0, 8),
      productKind: String(a.productKind ?? "delivery"),
      placementKey: a.inventoryKeys[0] ?? "creative",
      placementLabel: "동일 소재 · 복수 placement",
      startAt: a.startAt,
      endAt: a.endAt,
      severity: "WARNING",
      severityLabelKo: labels.ko,
      severityLabelEn: labels.en,
      reasonKo: "같은 소재가 여러 placement에 연결되어 있습니다.",
      reasonEn: "Same creative is linked to multiple placements.",
      checkCode: "C_SAME_CREATIVE_MULTI_PLACEMENT",
      peers: list.slice(1).map((p) => ({
        id: p.id,
        storeName: p.storeName || p.title || p.id.slice(0, 8),
        placementKey: p.inventoryKeys[0] ?? "",
        lifecycleStatus: p.lifecycleStatus,
        startAt: p.startAt,
        endAt: p.endAt,
      })),
      hrefHint: hrefForId(a.id),
    });
  }

  // Deduplicate: keep strongest severity per campaignId+checkCode
  const best = new Map<string, AdsCollisionFinding>();
  const rank = (s: AdsCollisionSeverity) => (s === "BLOCKING" ? 2 : s === "WARNING" ? 1 : 0);
  for (const f of findings) {
    const key = `${f.campaignId}:${f.checkCode}:${f.placementKey}`;
    const prev = best.get(key);
    if (!prev || rank(f.severity) > rank(prev.severity)) best.set(key, f);
  }

  return [...best.values()].sort((a, b) => rank(b.severity) - rank(a.severity));
}

export function summarizeCollisionQueues(findings: AdsCollisionFinding[]): {
  blocking: number;
  warning: number;
  endingSoon: number;
} {
  const blocking = findings.filter((f) => f.severity === "BLOCKING").length;
  const warning = findings.filter((f) => f.severity === "WARNING").length;
  return { blocking, warning, endingSoon: 0 };
}
