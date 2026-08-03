/**
 * Production Backfill Incident regression — contentIdentitySeed omission.
 * Reproduces the live failure: 7 content-identity duplicates briefly re-proposed
 * on second-run when seed was omitted (actual Production duplicate legacy ids).
 */
import { describe, expect, it } from "vitest";
import {
  assertBackfillIdempotent,
  contentIdentitySeedFromPlan,
  countSecondRunProposedInsertsOmittingContentSeed,
  dryRunLegacyNotificationsBackfill,
  legacyNotificationsDedupeKey,
  listContentIdentityDuplicateDedupeKeys,
  listRepairCandidatesFromCanonicalKeys,
  planBackfillFirstRun,
  planBackfillSecondRun,
  planLegacyNotificationsBackfill,
  type LegacyNotificationsBackfillRow,
} from "@/lib/notifications/badge-authority-rebuild/legacy-cutover-backfill";

/** Actual Production content-identity duplicate legacy ids (incident closeout). */
const INCIDENT_DUP_LEGACY_IDS = [
  "d7b2b66b-f365-440d-94f9-3b3653f27cd1",
  "85abc498-e09c-4e1e-b7ef-7a2847c3af5b",
  "3fb6527d-9e3e-4ee2-bb96-69151b8d745b",
  "042af49d-f9e5-4674-a8a5-e4d6d7d8f685",
  "587cbd42-91e0-41b3-a849-daea71d1fb1d",
  "bf9e29ed-6339-44a6-b989-4cee76685bd6",
  "c9ad1dd4-c798-4422-a20a-92d8381b2c7d",
] as const;

function row(
  partial: Partial<LegacyNotificationsBackfillRow> & Pick<LegacyNotificationsBackfillRow, "id">
): LegacyNotificationsBackfillRow {
  return {
    user_id: "member-incident-1",
    notification_type: "status",
    is_read: false,
    created_at: "2026-03-01T00:00:00.000Z",
    title: "offer",
    body: "price offer",
    link_url: "/trade/offer",
    meta: {},
    ...partial,
  };
}

/** 7 winners + 7 incident duplicate ids sharing offer identity (14 rows → 7 A + 7 dup). */
function buildIncidentFixture(): LegacyNotificationsBackfillRow[] {
  const rows: LegacyNotificationsBackfillRow[] = [];
  for (let i = 0; i < INCIDENT_DUP_LEGACY_IDS.length; i += 1) {
    const offerId = `incident-offer-${i + 1}`;
    rows.push(
      row({
        id: `winner-${i + 1}`,
        meta: { kind: "trade_offer", offer_id: offerId, listing_id: `L-${i + 1}` },
        created_at: `2026-03-0${(i % 9) + 1}T00:00:00.000Z`,
      })
    );
    rows.push(
      row({
        id: INCIDENT_DUP_LEGACY_IDS[i]!,
        meta: { kind: "trade_offer", offer_id: offerId, listing_id: `L-${i + 1}` },
        created_at: `2026-03-0${(i % 9) + 1}T01:00:00.000Z`,
      })
    );
  }
  return rows;
}

describe("Production Backfill Incident — contentIdentitySeed", () => {
  const fixture = buildIncidentFixture();

  it("fixture: 7 content-identity duplicates excluded before insert", () => {
    const first = planBackfillFirstRun(fixture, { contentIdentitySeed: new Set() });
    expect(first.toInsert).toHaveLength(7);
    expect(first.contentIdentityDuplicateDedupeKeys).toHaveLength(7);
    expect(first.contentIdentityDuplicateDedupeKeys.sort()).toEqual(
      INCIDENT_DUP_LEGACY_IDS.map((id) => legacyNotificationsDedupeKey(id)).sort()
    );
    const dupSet = new Set(first.contentIdentityDuplicateDedupeKeys);
    expect(first.toInsert.every((p) => !dupSet.has(p.dedupeKey))).toBe(true);
  });

  it("first run inserts canonical winners only; second run with seed proposes 0", () => {
    const first = planBackfillFirstRun(fixture, { contentIdentitySeed: new Set() });
    const keys = new Set(first.toInsert.map((p) => p.dedupeKey));
    expect(keys.size).toBe(7);

    const second = planBackfillSecondRun(fixture, {
      canonicalDedupeKeys: keys,
      contentIdentitySeed: first.contentIdentitySeed,
    });
    expect(second.proposedInserts).toBe(0);
    expect(second.toInsert).toHaveLength(0);
    expect(assertBackfillIdempotent(fixture)).toEqual({ ok: true, secondInserts: 0 });
  });

  it("seed omitted on second-run → FAIL mode (7 re-proposed) — actual incident", () => {
    const first = planBackfillFirstRun(fixture, { contentIdentitySeed: new Set() });
    const keys = new Set(first.toInsert.map((p) => p.dedupeKey));
    const omitted = countSecondRunProposedInsertsOmittingContentSeed(fixture, keys);
    expect(omitted).toBe(7);

    // Guard: correct path must still be 0
    const correct = planBackfillSecondRun(fixture, {
      canonicalDedupeKeys: keys,
      contentIdentitySeed: first.contentIdentitySeed,
    });
    expect(correct.proposedInserts).toBe(0);
    expect(omitted).not.toBe(correct.proposedInserts);
  });

  it("dry-run / apply / verify dispositions match on same inputs", () => {
    const seedEmpty = new Set<string>();
    const applyFirst = planBackfillFirstRun(fixture, { contentIdentitySeed: seedEmpty });
    const dry = dryRunLegacyNotificationsBackfill(fixture, {
      contentIdentitySeed: seedEmpty,
    });
    const verifyPlan = planLegacyNotificationsBackfill(fixture, {
      contentIdentitySeed: seedEmpty,
    });

    expect(dry.eligibleForA).toBe(applyFirst.toInsert.length);
    expect(dry.alreadyCanonicalDuplicate).toBe(
      applyFirst.contentIdentityDuplicateDedupeKeys.length
    );
    expect(verifyPlan.map((p) => `${p.legacyId}:${p.disposition}`)).toEqual(
      applyFirst.plan.map((p) => `${p.legacyId}:${p.disposition}`)
    );

    const keys = new Set(applyFirst.toInsert.map((p) => p.dedupeKey));
    const seed = contentIdentitySeedFromPlan(applyFirst.plan);
    const secondApply = planBackfillSecondRun(fixture, {
      canonicalDedupeKeys: keys,
      contentIdentitySeed: seed,
    });
    const secondDry = dryRunLegacyNotificationsBackfill(fixture, {
      canonicalDedupeKeys: keys,
      contentIdentitySeed: seed,
    });
    expect(secondDry.proposedInserts).toBe(secondApply.proposedInserts);
    expect(secondApply.proposedInserts).toBe(0);
  });

  it("repair candidates only = content-dup keys present in canonical; never winners", () => {
    const first = planBackfillFirstRun(fixture, { contentIdentitySeed: new Set() });
    const winnerKeys = first.toInsert.map((p) => p.dedupeKey);
    const dupKeys = listContentIdentityDuplicateDedupeKeys(first.plan);

    // Healthy post-state: winners in canonical, dups absent → repair 0
    expect(
      listRepairCandidatesFromCanonicalKeys(first.plan, new Set(winnerKeys))
    ).toHaveLength(0);

    // Incident state: dups wrongly inserted → repair candidates = those 7 only
    const polluted = new Set([...winnerKeys, ...dupKeys]);
    const repair = listRepairCandidatesFromCanonicalKeys(first.plan, polluted);
    expect(repair.sort()).toEqual([...dupKeys].sort());
    expect(repair.every((k) => !winnerKeys.includes(k))).toBe(true);
  });

  it("legacy fixture rows are never mutated by planners", () => {
    const before = JSON.stringify(fixture);
    const first = planBackfillFirstRun(fixture, { contentIdentitySeed: new Set() });
    planBackfillSecondRun(fixture, {
      canonicalDedupeKeys: new Set(first.toInsert.map((p) => p.dedupeKey)),
      contentIdentitySeed: first.contentIdentitySeed,
    });
    countSecondRunProposedInsertsOmittingContentSeed(
      fixture,
      new Set(first.toInsert.map((p) => p.dedupeKey))
    );
    expect(JSON.stringify(fixture)).toBe(before);
  });
});
