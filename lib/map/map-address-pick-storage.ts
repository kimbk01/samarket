export const MAP_ADDRESS_PICK_STORAGE_KEY = "samarket:map_address_pick_v1";

export type MapAddressPickPayload = {
  latitude: number;
  longitude: number;
  /** 역지오코딩(또는 연필로 수정한) 기본 한 줄 */
  fullAddress: string;
  /** 지번·건물명·호 등 — 같은 화면에서 이어서 입력 */
  addressDetail?: string | null;
  savedAt: number;
};

export function writeMapAddressPick(input: {
  latitude: number;
  longitude: number;
  fullAddress: string;
  addressDetail?: string | null;
}): void {
  if (typeof sessionStorage === "undefined") return;
  const payload: MapAddressPickPayload = {
    ...input,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(MAP_ADDRESS_PICK_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

/** 한 번 읽고 제거 — 주소 시트가 결과를 폼에 반영할 때 사용 */
export function consumeMapAddressPick(): Omit<MapAddressPickPayload, "savedAt"> | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(MAP_ADDRESS_PICK_STORAGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(MAP_ADDRESS_PICK_STORAGE_KEY);
  try {
    const j = JSON.parse(raw) as MapAddressPickPayload;
    if (typeof j.latitude !== "number" || typeof j.longitude !== "number" || !Number.isFinite(j.latitude) || !Number.isFinite(j.longitude)) {
      return null;
    }
    const fullAddress = typeof j.fullAddress === "string" ? j.fullAddress.trim() : "";
    const rawDetail = (j as { addressDetail?: unknown }).addressDetail;
    const detail =
      typeof rawDetail === "string" ? rawDetail.trim() : undefined;
    return {
      latitude: j.latitude,
      longitude: j.longitude,
      fullAddress,
      ...(detail !== undefined ? { addressDetail: detail } : {}),
    };
  } catch {
    return null;
  }
}

/** 주소 시트에서 지도로 갈 때만 기록 — 복귀 시 생성/수정 모드 복원 */
export const MAP_ADDRESS_PICK_CONTEXT_KEY = "samarket:map_address_pick_context_v1";

export type MapAddressPickContextWrite =
  | { source: "create" }
  | { source: "edit"; addressId: string };

export function writeMapAddressPickContext(ctx: MapAddressPickContextWrite): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(MAP_ADDRESS_PICK_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore */
  }
}

/** 지도 복귀 후 한 번 읽고 제거. 기록이 없으면 생성 플로우로 간주 */
export function consumeMapAddressPickContext():
  | { source: "create" }
  | { source: "edit"; addressId: string } {
  if (typeof sessionStorage === "undefined") return { source: "create" };
  const raw = sessionStorage.getItem(MAP_ADDRESS_PICK_CONTEXT_KEY);
  if (!raw) return { source: "create" };
  sessionStorage.removeItem(MAP_ADDRESS_PICK_CONTEXT_KEY);
  try {
    const j = JSON.parse(raw) as { source?: string; addressId?: string };
    if (j.source === "edit" && typeof j.addressId === "string" && j.addressId.length > 0) {
      return { source: "edit", addressId: j.addressId };
    }
  } catch {
    /* ignore */
  }
  return { source: "create" };
}

const RECENT_KEY = "samarket:map_address_recent_v1";
const RECENT_MAX = 10;

export type MapAddressRecentItem = {
  latitude: number;
  longitude: number;
  address: string;
  at: number;
};

export function readMapAddressRecent(): MapAddressRecentItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is MapAddressRecentItem =>
          x != null &&
          typeof x === "object" &&
          typeof (x as MapAddressRecentItem).latitude === "number" &&
          typeof (x as MapAddressRecentItem).longitude === "number" &&
          typeof (x as MapAddressRecentItem).address === "string"
      )
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function pushMapAddressRecent(item: Omit<MapAddressRecentItem, "at">): void {
  if (typeof localStorage === "undefined") return;
  const prev = readMapAddressRecent();
  const next: MapAddressRecentItem[] = [
    { ...item, at: Date.now() },
    ...prev.filter(
      (p) =>
        Math.abs(p.latitude - item.latitude) > 1e-5 ||
        Math.abs(p.longitude - item.longitude) > 1e-5 ||
        p.address !== item.address
    ),
  ].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
