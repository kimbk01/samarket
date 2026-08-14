import type { CanonicalAddressDraft } from "@/lib/addresses/canonical-address-draft";

const KEY = "dibay.address.platform.v2.draft";

export type AddressPlatformV2DraftPayload = {
  draft: CanonicalAddressDraft;
  detail?: string | null;
  source: "search" | "current_location" | "pin";
};

function parseDraftPayload(raw: string | null): AddressPlatformV2DraftPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AddressPlatformV2DraftPayload;
    if (!parsed?.draft || typeof parsed.draft.latitude !== "number") return null;
    if (!Number.isFinite(parsed.draft.latitude) || !Number.isFinite(parsed.draft.longitude)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAddressPlatformV2Draft(payload: AddressPlatformV2DraftPayload): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

/** Non-destructive. Search → Detail remount/Strict Mode must not drop the draft. */
export function readAddressPlatformV2Draft(): AddressPlatformV2DraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    return parseDraftPayload(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearAddressPlatformV2Draft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Create Detail without a handoff draft must go back to Search — never because of remount. */
export function shouldRedirectCreateDetailToSearch(
  idFromUrl: string,
  mapBootstrap: boolean,
  draft: CanonicalAddressDraft | null,
): boolean {
  if (idFromUrl.trim() || mapBootstrap) return false;
  return !draft;
}
