import type { ModifierSelectionsWire, ParsedOptionGroup } from "@/lib/stores/modifiers/types";
import { validateModifierSelection } from "@/lib/stores/product-line-options";

export function validateStoreProductRequiredOptions(
  groups: ParsedOptionGroup[],
  wire: ModifierSelectionsWire,
  baseUnitAfterDiscount: number
): ReturnType<typeof validateModifierSelection> {
  return validateModifierSelection(groups, wire, baseUnitAfterDiscount);
}
