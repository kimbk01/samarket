import type { MessageKey } from "@/lib/i18n/messages";
import type { OemGuideBrand } from "@/lib/permissions/education/permission-education-types";

export type OemGuideStep = {
  stepKey: MessageKey;
};

export type OemGuideDefinition = {
  brand: OemGuideBrand;
  titleKey: MessageKey;
  steps: OemGuideStep[];
};

const SAMSUNG_GUIDE: OemGuideDefinition = {
  brand: "samsung",
  titleKey: "perm_edu_oem_samsung_title",
  steps: [
    { stepKey: "perm_edu_oem_samsung_step_1" },
    { stepKey: "perm_edu_oem_samsung_step_2" },
    { stepKey: "perm_edu_oem_samsung_step_3" },
  ],
};

const XIAOMI_GUIDE: OemGuideDefinition = {
  brand: "xiaomi",
  titleKey: "perm_edu_oem_xiaomi_title",
  steps: [
    { stepKey: "perm_edu_oem_xiaomi_step_1" },
    { stepKey: "perm_edu_oem_xiaomi_step_2" },
    { stepKey: "perm_edu_oem_xiaomi_step_3" },
  ],
};

const OPPO_GUIDE: OemGuideDefinition = {
  brand: "oppo",
  titleKey: "perm_edu_oem_oppo_title",
  steps: [
    { stepKey: "perm_edu_oem_oppo_step_1" },
    { stepKey: "perm_edu_oem_oppo_step_2" },
  ],
};

const VIVO_GUIDE: OemGuideDefinition = {
  brand: "vivo",
  titleKey: "perm_edu_oem_vivo_title",
  steps: [
    { stepKey: "perm_edu_oem_vivo_step_1" },
    { stepKey: "perm_edu_oem_vivo_step_2" },
  ],
};

const ONEPLUS_GUIDE: OemGuideDefinition = {
  brand: "oneplus",
  titleKey: "perm_edu_oem_oneplus_title",
  steps: [
    { stepKey: "perm_edu_oem_oneplus_step_1" },
    { stepKey: "perm_edu_oem_oneplus_step_2" },
  ],
};

const OEM_GUIDES: Record<OemGuideBrand, OemGuideDefinition> = {
  samsung: SAMSUNG_GUIDE,
  xiaomi: XIAOMI_GUIDE,
  oppo: OPPO_GUIDE,
  vivo: VIVO_GUIDE,
  oneplus: ONEPLUS_GUIDE,
  generic: {
    brand: "generic",
    titleKey: "perm_edu_oem_generic_title",
    steps: [{ stepKey: "perm_edu_oem_generic_step_1" }],
  },
};

export function normalizeOemManufacturer(raw: string | null | undefined): OemGuideBrand {
  const m = (raw ?? "").trim().toLowerCase();
  if (!m) return "generic";
  if (m.includes("samsung")) return "samsung";
  if (m.includes("xiaomi") || m.includes("redmi") || m.includes("poco")) return "xiaomi";
  if (m.includes("oppo") || m.includes("realme")) return "oppo";
  if (m.includes("vivo") || m.includes("iqoo")) return "vivo";
  if (m.includes("oneplus")) return "oneplus";
  return "generic";
}

export function resolveOemGuide(manufacturer: string | null | undefined): OemGuideDefinition {
  return OEM_GUIDES[normalizeOemManufacturer(manufacturer)];
}
