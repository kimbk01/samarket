import type { ParsedOptionGroup } from "@/lib/stores/modifiers/types";

/** 고객 화면: 필수 그룹 우선 */
export function sortModifierGroupsForCustomerUi(groups: ParsedOptionGroup[]): ParsedOptionGroup[] {
  return [...groups].sort((a, b) => {
    const score = (g: ParsedOptionGroup) => (g.isRequired || g.minSelect > 0 ? 0 : 1);
    const d = score(a) - score(b);
    if (d !== 0) return d;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.key.localeCompare(b.key);
  });
}
