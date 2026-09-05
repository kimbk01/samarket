"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  selectionHeaderState,
  shouldClearSelectionOnQueryChange,
  toggleCurrentPageSelection,
  toggleRowSelection,
  type SelectionHeaderState,
} from "@/lib/admin/management/selection";

export type UseAdminManagementSelectionArgs = {
  /** Changes when page/filter/search/sort context changes → clears selection. */
  queryScopeKey: string;
  selectableIds: readonly string[];
};

export function useAdminManagementSelection({
  queryScopeKey,
  selectableIds,
}: UseAdminManagementSelectionArgs) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (shouldClearSelectionOnQueryChange(prevKeyRef.current, queryScopeKey)) {
      setSelected(new Set());
    }
    prevKeyRef.current = queryScopeKey;
  }, [queryScopeKey]);

  const headerState: SelectionHeaderState = useMemo(
    () => selectionHeaderState(selected, selectableIds),
    [selected, selectableIds]
  );

  const toggleAll = useCallback(() => {
    setSelected((prev) => toggleCurrentPageSelection(prev, selectableIds));
  }, [selectableIds]);

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => toggleRowSelection(prev, id));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    selectedCount: selected.size,
    headerState,
    toggleAll,
    toggleRow,
    clear,
    isSelected: (id: string) => selected.has(id),
  };
}

export function bindIndeterminate(
  el: HTMLInputElement | null,
  state: SelectionHeaderState
) {
  if (!el) return;
  el.indeterminate = state === "some";
}

export type HeaderCheckboxProps = {
  state: SelectionHeaderState;
  onToggle: () => void;
  disabled?: boolean;
  "aria-label"?: string;
  inputRef?: Ref<HTMLInputElement>;
};
