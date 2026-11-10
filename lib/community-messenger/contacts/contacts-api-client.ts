/**
 * 연락처 API 호출 (앱 화면용). 응답은 오류 코드만 — 문구는 화면이 `t()` 로 만든다.
 * 회원별 데이터라 캐시하지 않는다 (`cache: "no-store"`).
 */
import {
  CONTACTS_API_BASE,
  type ContactsCallDefault,
  type ContactsDiscoveryPolicy,
  type ContactsMemberRow,
} from "@/lib/community-messenger/contacts/contacts-contract";

export type ContactsApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number; body?: Record<string, unknown> };

async function call<T>(path: string, init?: RequestInit): Promise<ContactsApiResult<T>> {
  try {
    const res = await fetch(`${CONTACTS_API_BASE}${path}`, {
      cache: "no-store",
      credentials: "include",
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && body.ok === true) return { ok: true, data: body as T };
    return { ok: false, error: String(body.error ?? "network_error"), status: res.status, body };
  } catch {
    return { ok: false, error: "network_error", status: 0 };
  }
}

export type ContactsUserSettingsDto = {
  consented: boolean;
  consentVersion: string | null;
  accountSyncEnabled: boolean;
  discoveryPolicy: ContactsDiscoveryPolicy;
  discoveryPolicyIsDefault: boolean;
  joinNotifyEnabled: boolean;
  callDefault: ContactsCallDefault;
  registeredPhone: boolean;
  hasVerifiedPhone: boolean;
  defaultCountry: "PH" | "KR";
  currentConsentVersion: string;
};

export const contactsApi = {
  settings: () => call<{ settings: ContactsUserSettingsDto }>("/settings"),
  patchSettings: (patch: Partial<Pick<ContactsUserSettingsDto, "accountSyncEnabled" | "joinNotifyEnabled" | "callDefault">> & {
    discoveryPolicy?: ContactsDiscoveryPolicy | null;
  }) => call<Record<string, never>>("/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  consent: () => call<{ registeredPhone: boolean; defaultCountry: "PH" | "KR" }>("/consent", { method: "POST" }),
  withdraw: () => call<Record<string, never>>("/consent", { method: "DELETE" }),
  list: (sourceId: string | null, token: string | null) => {
    const sp = new URLSearchParams();
    if (sourceId) sp.set("source_id", sourceId);
    if (token) sp.set("v", token);
    const q = sp.toString();
    return call<
      | { notModified: true; token: string }
      | { notModified: false; token: string | null; accountSyncOff: boolean; members: ContactsMemberRow[]; friendIds: string[] }
    >(q ? `?${q}` : "");
  },
  deleteAll: () => call<Record<string, never>>("", { method: "DELETE" }),
  registerSource: (installId: string, platform: "android" | "ios") =>
    call<{ source: { source_id: string; device_version: number; generation: number; reactivated: boolean; created: boolean } }>(
      "/sources",
      { method: "POST", body: JSON.stringify({ installId, platform }) }
    ),
  sources: (installId: string | null) =>
    call<{
      sources: {
        id: string;
        platform: "android" | "ios";
        syncEnabled: boolean;
        permissionState: string;
        lastUsedAt: string;
        lastSyncAt: string | null;
        entryCount: number;
        isThisDevice: boolean;
      }[];
    }>(installId ? `/sources?install_id=${encodeURIComponent(installId)}` : "/sources"),
  patchSource: (
    sourceId: string,
    body: { installId: string; syncEnabled?: boolean; permissionState?: string; revokeChoice?: "delete" | "keep" }
  ) => call<{ removed: boolean }>(`/sources/${sourceId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSource: (sourceId: string) => call<Record<string, never>>(`/sources/${sourceId}`, { method: "DELETE" }),
  sync: (body: Record<string, unknown>) =>
    call<{ committed: boolean; device_version: number; generation: number; duplicate?: boolean }>("/sync", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  suppressions: () =>
    call<{ suppressions: { userId: string; reason: "hidden" | "former_friend"; createdAt: string; nickname: string | null; avatarUrl: string | null }[] }>(
      "/suppressions"
    ),
  suppress: (userId: string) => call<Record<string, never>>(`/suppressions/${userId}`, { method: "POST" }),
  unsuppress: (userId: string) => call<Record<string, never>>(`/suppressions/${userId}`, { method: "DELETE" }),
};
