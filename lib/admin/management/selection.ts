import { DEFAULT_SELECT_ALL_SCOPE, type SelectAllScope } from "./types";

export type SelectionHeaderState = "none" | "some" | "all";

export function resolveSelectAllScope(
  requested: SelectAllScope | undefined
): SelectAllScope {
  const scope = requested ?? DEFAULT_SELECT_ALL_SCOPE;
  if (scope === "GLOBAL_DB") {
    throw new Error("GLOBAL_DB select-all is forbidden for domain management lists");
  }
  return scope;
}

/** Header checkbox state over selectable row ids on the current page. */
export function selectionHeaderState(
  selectedIds: ReadonlySet<string>,
  selectableIds: readonly string[]
): SelectionHeaderState {
  if (selectableIds.length === 0) return "none";
  let selectedCount = 0;
  for (const id of selectableIds) {
    if (selectedIds.has(id)) selectedCount += 1;
  }
  if (selectedCount === 0) return "none";
  if (selectedCount === selectableIds.length) return "all";
  return "some";
}

export function toggleCurrentPageSelection(
  selectedIds: ReadonlySet<string>,
  selectableIds: readonly string[]
): Set<string> {
  const state = selectionHeaderState(selectedIds, selectableIds);
  if (state === "all") return new Set();
  return new Set(selectableIds);
}

export function toggleRowSelection(
  selectedIds: ReadonlySet<string>,
  rowId: string
): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(rowId)) next.delete(rowId);
  else next.add(rowId);
  return next;
}

/**
 * Default safety: any query-context change clears selection (no stale hidden selection).
 */
export function shouldClearSelectionOnQueryChange(
  previousScopeKey: string | null,
  nextScopeKey: string
): boolean {
  if (previousScopeKey == null) return false;
  return previousScopeKey !== nextScopeKey;
}
