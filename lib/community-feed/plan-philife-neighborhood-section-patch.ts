/**
 * PATCH /api/admin/community/philife-neighborhood-section — writable field plan.
 *
 * CONTRACT:
 * - `show_all_feed_tab` is legacy / non-writable (reader + payload bridge kept elsewhere).
 * - `show_neighbor_only_filter` remains writable.
 * - Mixed body: ignore `show_all_feed_tab`, still apply neighbor filter.
 */

export type PhilifeNeighborhoodSectionPatchBody = {
  show_all_feed_tab?: unknown;
  show_neighbor_only_filter?: unknown;
};

export type PhilifeNeighborhoodSectionPatchPlan =
  | {
      ok: false;
      error: "show_all_feed_tab_not_writable" | "show_neighbor_only_filter_required";
    }
  | {
      ok: true;
      /** Fields to merge into admin_settings value_json */
      write: { show_neighbor_only_filter: boolean };
      ignoredShowAllFeedTab: boolean;
    };

export function planPhilifeNeighborhoodSectionPatch(
  body: PhilifeNeighborhoodSectionPatchBody
): PhilifeNeighborhoodSectionPatchPlan {
  const hasShowAll = typeof body.show_all_feed_tab === "boolean";
  const hasNeighbor = typeof body.show_neighbor_only_filter === "boolean";

  if (!hasShowAll && !hasNeighbor) {
    return { ok: false, error: "show_neighbor_only_filter_required" };
  }
  if (hasShowAll && !hasNeighbor) {
    return { ok: false, error: "show_all_feed_tab_not_writable" };
  }

  return {
    ok: true,
    write: { show_neighbor_only_filter: body.show_neighbor_only_filter as boolean },
    ignoredShowAllFeedTab: hasShowAll,
  };
}
