/**
 * CUT 3 — OLD vs NEW shadow ranking parity harness.
 * Does not alter live API responses.
 */

export type ShadowParityRow = {
  id: string;
  eligibilityRank?: number;
  districtTier?: number;
  distanceKm?: number | null;
  completedOrders30d?: number;
};

export type ShadowParityDiff = {
  membershipDiff: string[];
  orderDiff: Array<{ index: number; oldId: string; newId: string }>;
  firstDivergence: { index: number; oldId: string; newId: string } | null;
  lengthMismatch: boolean;
  oldLength: number;
  newLength: number;
};

export function compareStoreDiscoveryShadowParity(
  oldRows: readonly ShadowParityRow[],
  newRows: readonly ShadowParityRow[]
): ShadowParityDiff {
  const oldIds = oldRows.map((r) => r.id);
  const newIds = newRows.map((r) => r.id);
  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);

  const membershipDiff: string[] = [];
  for (const id of oldIds) {
    if (!newSet.has(id)) membershipDiff.push(`missing_in_new:${id}`);
  }
  for (const id of newIds) {
    if (!oldSet.has(id)) membershipDiff.push(`extra_in_new:${id}`);
  }

  const orderDiff: ShadowParityDiff["orderDiff"] = [];
  const n = Math.min(oldIds.length, newIds.length);
  let firstDivergence: ShadowParityDiff["firstDivergence"] = null;
  for (let i = 0; i < n; i += 1) {
    if (oldIds[i] !== newIds[i]) {
      const entry = { index: i, oldId: oldIds[i]!, newId: newIds[i]! };
      orderDiff.push(entry);
      if (!firstDivergence) firstDivergence = entry;
    }
  }

  return {
    membershipDiff,
    orderDiff,
    firstDivergence,
    lengthMismatch: oldIds.length !== newIds.length,
    oldLength: oldIds.length,
    newLength: newIds.length,
  };
}

export function assertShadowParityExact(
  oldRows: readonly ShadowParityRow[],
  newRows: readonly ShadowParityRow[]
): ShadowParityDiff {
  const diff = compareStoreDiscoveryShadowParity(oldRows, newRows);
  if (
    diff.membershipDiff.length > 0 ||
    diff.orderDiff.length > 0 ||
    diff.lengthMismatch ||
    diff.firstDivergence
  ) {
    const msg = [
      "shadow parity divergence",
      `membership=${diff.membershipDiff.join(",") || "none"}`,
      `first=${diff.firstDivergence ? `${diff.firstDivergence.index}:${diff.firstDivergence.oldId}->${diff.firstDivergence.newId}` : "none"}`,
      `len ${diff.oldLength}/${diff.newLength}`,
    ].join(" | ");
    throw new Error(msg);
  }
  return diff;
}
