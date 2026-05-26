import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import type { MainBottomNavFabStoredConfig, MainBottomNavFabStoredItem } from "@/lib/main-menu/main-bottom-nav-fab-types";
import type { MainBottomNavAdminRow } from "@/lib/main-menu/main-bottom-nav-types";

export type MainBottomNavIconDraft = {
  source: "builtin" | "lucide";
  icon: BottomNavIconKey;
  lucideIcon?: string;
};

export type MainBottomNavIconApplyPatch = {
  icon?: BottomNavIconKey;
  lucideIcon?: string | null;
};

export function cloneMainBottomNavAdminRow(row: MainBottomNavAdminRow): MainBottomNavAdminRow {
  return {
    ...row,
    ...(row.fab
      ? {
          fab: {
            enabled: row.fab.enabled,
            items: row.fab.items.map((item) => ({ ...item })),
          },
        }
      : {}),
  };
}

export function cloneMainBottomNavAdminRows(rows: MainBottomNavAdminRow[]): MainBottomNavAdminRow[] {
  return rows.map(cloneMainBottomNavAdminRow);
}

/** 관리자 편집 비교용 — 노출·라벨·경로·아이콘·새 창·FAB */
export function mainBottomNavRowEditPayload(row: MainBottomNavAdminRow, defaultLabel: string) {
  return {
    visible: row.visible,
    label: row.label.trim() || defaultLabel,
    href: row.href.trim(),
    icon: row.icon,
    lucideIcon: row.lucideIcon ?? null,
    openInNewTab: row.openInNewTab === true,
    fab: row.fab ?? null,
  };
}

export function mainBottomNavRowEditSnapshot(row: MainBottomNavAdminRow, defaultLabel: string): string {
  return JSON.stringify(mainBottomNavRowEditPayload(row, defaultLabel));
}

export function isMainBottomNavRowFieldsDirty(
  row: MainBottomNavAdminRow,
  baseline: MainBottomNavAdminRow | undefined,
  defaultLabel: string
): boolean {
  if (!baseline) return true;
  return mainBottomNavRowEditSnapshot(row, defaultLabel) !== mainBottomNavRowEditSnapshot(baseline, defaultLabel);
}

export function isMainBottomNavRowsOrderEqual(a: MainBottomNavAdminRow[], b: MainBottomNavAdminRow[]): boolean {
  return a.length === b.length && a.every((row, index) => row.id === b[index]?.id);
}

export function isMainBottomNavNewUnsavedRow(
  rowId: string,
  baselineRows: MainBottomNavAdminRow[] | null
): boolean {
  return baselineRows != null && !baselineRows.some((row) => row.id === rowId);
}

export function iconDraftFromRow(row: Pick<MainBottomNavAdminRow, "icon" | "lucideIcon">): MainBottomNavIconDraft {
  if (row.lucideIcon) {
    return { source: "lucide", icon: row.icon, lucideIcon: row.lucideIcon };
  }
  return { source: "builtin", icon: row.icon };
}

export function iconDraftToTabValue(draft: MainBottomNavIconDraft): Pick<MainBottomNavAdminRow, "icon" | "lucideIcon"> {
  if (draft.source === "lucide" && draft.lucideIcon) {
    return { icon: draft.icon, lucideIcon: draft.lucideIcon };
  }
  return { icon: draft.icon, lucideIcon: undefined };
}

export function iconDraftToApplyPatch(draft: MainBottomNavIconDraft): MainBottomNavIconApplyPatch {
  if (draft.source === "lucide" && draft.lucideIcon) {
    return { lucideIcon: draft.lucideIcon };
  }
  return { icon: draft.icon, lucideIcon: null };
}

export function applyMainBottomNavIconPatch(
  row: MainBottomNavAdminRow,
  patch: MainBottomNavIconApplyPatch
): MainBottomNavAdminRow {
  const next = cloneMainBottomNavAdminRow(row);
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.lucideIcon === null) {
    delete next.lucideIcon;
  } else if (patch.lucideIcon !== undefined) {
    next.lucideIcon = patch.lucideIcon;
  }
  return next;
}

export function mainBottomNavRowToApiItem(row: MainBottomNavAdminRow, defaultLabel: string) {
  return {
    id: row.id,
    visible: row.visible,
    label: row.label.trim() || defaultLabel,
    href: row.href.trim(),
    icon: row.icon,
    ...(row.openInNewTab ? { openInNewTab: true } : {}),
    ...(row.lucideIcon ? { lucideIcon: row.lucideIcon } : {}),
    iconSizeClass: row.iconSizeClass,
    labelInactiveExtraClass: row.labelInactiveExtraClass,
    labelActiveExtraClass: row.labelActiveExtraClass,
    iconInactiveClass: row.iconInactiveClass,
    iconActiveClass: row.iconActiveClass,
    labelInactiveClass: row.labelInactiveClass,
    labelActiveClass: row.labelActiveClass,
    labelSizeClass: row.labelSizeClass,
    labelFontFamilyClass: row.labelFontFamilyClass,
    ...(row.fab?.enabled ? { fab: row.fab } : row.fab != null ? { fab: { enabled: false, items: [] } } : {}),
  };
}

export function patchMainBottomNavRowFab(
  row: MainBottomNavAdminRow,
  fab: MainBottomNavFabStoredConfig | undefined
): MainBottomNavAdminRow {
  const next = cloneMainBottomNavAdminRow(row);
  if (!fab?.enabled) {
    next.fab = { enabled: false, items: [] };
    return next;
  }
  next.fab = {
    enabled: true,
    items: fab.items.map((item) => ({ ...item })),
  };
  return next;
}

export function patchMainBottomNavFabItem(
  row: MainBottomNavAdminRow,
  itemId: string,
  patch: Partial<MainBottomNavFabStoredItem>
): MainBottomNavAdminRow {
  if (!row.fab?.enabled) return row;
  const next = cloneMainBottomNavAdminRow(row);
  next.fab = {
    enabled: true,
    items: row.fab.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
  };
  return next;
}

export function applyMainBottomNavFabIconPatch(
  item: MainBottomNavFabStoredItem,
  patch: MainBottomNavIconApplyPatch
): MainBottomNavFabStoredItem {
  const next = { ...item };
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.lucideIcon === null) {
    delete next.lucideIcon;
  } else if (patch.lucideIcon !== undefined) {
    next.lucideIcon = patch.lucideIcon;
  }
  return next;
}

/** 현재 순서 유지 — 한 행의 필드만 baseline 으로 되돌림 */
export function revertMainBottomNavRowFieldsFromBaseline(
  current: MainBottomNavAdminRow[],
  baselineRows: MainBottomNavAdminRow[],
  revertFieldRowId: string
): MainBottomNavAdminRow[] {
  const baseline = baselineRows.find((row) => row.id === revertFieldRowId);
  if (!baseline) return current.map(cloneMainBottomNavAdminRow);
  return current.map((row) =>
    row.id === revertFieldRowId ? cloneMainBottomNavAdminRow(baseline) : cloneMainBottomNavAdminRow(row)
  );
}

/** 순서 복구 + 선택 행 필드만 baseline 으로 되돌림. 신규(미저장) 행은 끝에 유지 */
export function restoreMainBottomNavRowsFromBaseline(
  current: MainBottomNavAdminRow[],
  baselineRows: MainBottomNavAdminRow[],
  opts?: { revertFieldRowId?: string }
): MainBottomNavAdminRow[] {
  const byId = new Map(current.map((row) => [row.id, row]));
  const baselineById = new Map(baselineRows.map((row) => [row.id, row]));

  const restored = baselineRows.map((baseline) => {
    if (opts?.revertFieldRowId === baseline.id) {
      const snap = baselineById.get(baseline.id);
      return snap ? cloneMainBottomNavAdminRow(snap) : cloneMainBottomNavAdminRow(baseline);
    }
    const currentRow = byId.get(baseline.id);
    return currentRow ? cloneMainBottomNavAdminRow(currentRow) : cloneMainBottomNavAdminRow(baseline);
  });

  const newRows = current
    .filter((row) => !baselineById.has(row.id))
    .map(cloneMainBottomNavAdminRow);

  return [...restored, ...newRows];
}
