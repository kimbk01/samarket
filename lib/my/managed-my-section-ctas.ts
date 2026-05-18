import type { ManagedMyCtaLink } from "@/lib/my/managed-my-section-ctas-types";

export type { ManagedMySection, ManagedMyCtaLink } from "@/lib/my/managed-my-section-ctas-types";

export {
  getTradeSectionCtas,
  getOrdersSectionCtas,
  getBoardSectionCtas,
  getStoreSectionCtas,
  getAccountSectionCtas,
} from "@/lib/my/managed-my-section-ctas-i18n";

import {
  getAccountSectionCtas,
  getBoardSectionCtas,
  getOrdersSectionCtas,
  getStoreSectionCtas,
  getTradeSectionCtas,
} from "@/lib/my/managed-my-section-ctas-i18n";
import type { ManagedMySection } from "@/lib/my/managed-my-section-ctas-types";

export function getManagedSectionCtas(
  section: ManagedMySection,
  opts?: { ownerStoreId?: string | null }
): ManagedMyCtaLink[] {
  switch (section) {
    case "trade":
      return getTradeSectionCtas();
    case "orders":
      return getOrdersSectionCtas();
    case "board":
      return getBoardSectionCtas();
    case "store":
      return getStoreSectionCtas(opts?.ownerStoreId);
    case "account":
      return getAccountSectionCtas();
    default:
      return [];
  }
}
