/**
 * Admin targeting chips — independent dimensions, empty = ALL.
 * UNKNOWN is never offered or rewritten.
 */

import {
  INTRO_AUDIENCES,
  INTRO_DEVICE_CLASSES,
  INTRO_PLATFORMS,
  type IntroAudience,
  type IntroDeviceClass,
  type IntroPlatform,
  type IntroTargeting,
} from "@/lib/startup/intro-v2/types";

export const INTRO_ADMIN_DEVICE_CHIPS = ["Phone", "Tablet"] as const;
export type IntroAdminDeviceChip = (typeof INTRO_ADMIN_DEVICE_CHIPS)[number];

const PHONE_CLASSES: IntroDeviceClass[] = ["PHONE_ANDROID", "PHONE_IOS"];
const TABLET_CLASSES: IntroDeviceClass[] = ["TABLET_ANDROID", "TABLET_IPAD"];

export function emptyIntroTargeting(): IntroTargeting {
  return { audiences: [], platforms: [], deviceClasses: [] };
}

export function targetingDimensionIsAll(values: readonly unknown[]): boolean {
  return values.length === 0;
}

export function deviceChipsFromClasses(deviceClasses: readonly IntroDeviceClass[]): IntroAdminDeviceChip[] {
  const chips: IntroAdminDeviceChip[] = [];
  if (deviceClasses.some((c) => PHONE_CLASSES.includes(c))) chips.push("Phone");
  if (deviceClasses.some((c) => TABLET_CLASSES.includes(c))) chips.push("Tablet");
  return chips;
}

export function deviceClassesFromChips(chips: readonly IntroAdminDeviceChip[]): IntroDeviceClass[] {
  const out: IntroDeviceClass[] = [];
  if (chips.includes("Phone")) out.push(...PHONE_CLASSES);
  if (chips.includes("Tablet")) out.push(...TABLET_CLASSES);
  return out;
}

export function toggleAudience(current: readonly IntroAudience[], value: IntroAudience): IntroAudience[] {
  if (!INTRO_AUDIENCES.includes(value)) return [...current];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function togglePlatform(current: readonly IntroPlatform[], value: IntroPlatform): IntroPlatform[] {
  if (!INTRO_PLATFORMS.includes(value)) return [...current];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function toggleDeviceChip(
  current: readonly IntroAdminDeviceChip[],
  chip: IntroAdminDeviceChip
): IntroAdminDeviceChip[] {
  return current.includes(chip) ? current.filter((v) => v !== chip) : [...current, chip];
}

/** Admin never writes UNKNOWN even if a draft already contains it — preserve other classes only. */
export function sanitizeAdminDeviceClasses(deviceClasses: readonly IntroDeviceClass[]): IntroDeviceClass[] {
  return deviceClasses.filter((c) => c !== "UNKNOWN" && INTRO_DEVICE_CLASSES.includes(c));
}

export function buildAdminTargeting(input: {
  audiences: readonly IntroAudience[];
  platforms: readonly IntroPlatform[];
  deviceChips: readonly IntroAdminDeviceChip[];
}): IntroTargeting {
  return {
    audiences: [...input.audiences],
    platforms: [...input.platforms],
    deviceClasses: sanitizeAdminDeviceClasses(deviceClassesFromChips(input.deviceChips)),
  };
}
