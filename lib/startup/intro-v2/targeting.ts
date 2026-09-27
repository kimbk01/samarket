import {
  INTRO_AUDIENCES,
  INTRO_DEVICE_CLASSES,
  INTRO_PLATFORMS,
  isIn,
  type ContractResult,
  type IntroAudience,
  type IntroDeviceClass,
  type IntroPlatform,
  type IntroTargeting,
} from "@/lib/startup/intro-v2/types";

function uniqueStrings(values: unknown, label: string, allowed: readonly string[]): ContractResult<string[]> {
  if (!Array.isArray(values)) return { ok: false, error: `${label}_not_array` };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string") return { ok: false, error: `${label}_invalid_item` };
    if (!allowed.includes(raw)) return { ok: false, error: `${label}_unknown_value` };
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return { ok: true, value: out };
}

export function validateIntroTargeting(raw: unknown): ContractResult<IntroTargeting> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "targeting_not_object" };
  }
  const rec = raw as Record<string, unknown>;
  const extra = Object.keys(rec).filter((k) => !["audiences", "platforms", "deviceClasses"].includes(k));
  if (extra.length) return { ok: false, error: "targeting_unknown_key" };

  const audiences = uniqueStrings(rec.audiences ?? [], "audiences", INTRO_AUDIENCES);
  if (!audiences.ok) return audiences;
  const platforms = uniqueStrings(rec.platforms ?? [], "platforms", INTRO_PLATFORMS);
  if (!platforms.ok) return platforms;
  const deviceClasses = uniqueStrings(rec.deviceClasses ?? [], "deviceClasses", INTRO_DEVICE_CLASSES);
  if (!deviceClasses.ok) return deviceClasses;

  return {
    ok: true,
    value: {
      audiences: audiences.value as IntroAudience[],
      platforms: platforms.value as IntroPlatform[],
      deviceClasses: deviceClasses.value as IntroDeviceClass[],
    },
  };
}

export function targetingMatchesDimension(allowed: readonly string[], actual: string): boolean {
  if (allowed.length === 0) return true;
  return allowed.includes(actual);
}

export function targetingMatches(targeting: IntroTargeting, input: {
  audience: string;
  platform: string;
  deviceClass: string;
}): boolean {
  if (!targetingMatchesDimension(targeting.audiences, input.audience)) return false;
  if (!targetingMatchesDimension(targeting.platforms, input.platform)) return false;
  if (!targetingMatchesDimension(targeting.deviceClasses, input.deviceClass)) return false;
  return true;
}

export function isKnownAudience(value: unknown): value is IntroAudience {
  return isIn(INTRO_AUDIENCES, value);
}

export function isKnownPlatform(value: unknown): value is IntroPlatform {
  return isIn(INTRO_PLATFORMS, value);
}
