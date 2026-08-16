/**
 * Resolve device / map lat-lng → national Trade LGU for browse draft.
 * Does NOT write user_addresses.
 */

import { reverseGeocodeLatLngPh } from "@/lib/addresses/reverse-geocode-ph-client";

export type ResolveBrowseLguFromLatLngResult =
  | {
      ok: true;
      canonicalId: string;
      displayName: string;
      lat: number;
      lng: number;
    }
  | { ok: false; reason: "geocode" | "resolve" | "network" };

export async function resolveBrowseLguFromLatLng(
  lat: number,
  lng: number
): Promise<ResolveBrowseLguFromLatLngResult> {
  try {
    const geo = await reverseGeocodeLatLngPh(lat, lng);
    if (!geo?.parsed) return { ok: false, reason: "geocode" };
    const cityMunicipality = (geo.parsed.cityMunicipality ?? "").trim();
    const province = (geo.parsed.province ?? "").trim();
    if (!cityMunicipality) return { ok: false, reason: "geocode" };

    const sp = new URLSearchParams({ mode: "resolve", cityMunicipality });
    if (province) sp.set("province", province);
    const res = await fetch(`/api/trade/national-lgu?${sp.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: "network" };
    const json = (await res.json()) as {
      resolution?: {
        status?: string;
        canonicalId?: string;
        lgu?: { displayName?: string; canonicalId?: string };
      };
    };
    if (json.resolution?.status !== "resolved") return { ok: false, reason: "resolve" };
    const canonicalId =
      (typeof json.resolution.canonicalId === "string" && json.resolution.canonicalId) ||
      (typeof json.resolution.lgu?.canonicalId === "string" && json.resolution.lgu.canonicalId) ||
      "";
    const displayName =
      (typeof json.resolution.lgu?.displayName === "string" &&
        json.resolution.lgu.displayName.trim()) ||
      cityMunicipality;
    if (!canonicalId) return { ok: false, reason: "resolve" };
    return { ok: true, canonicalId, displayName, lat, lng };
  } catch {
    return { ok: false, reason: "network" };
  }
}
