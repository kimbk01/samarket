import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveVerifyPhone, detectStoredPhoneCountry } from "@/lib/phone/verify-phone-number";
import {
  CONTACTS_CALL_DEFAULTS,
  CONTACTS_DISCOVERY_POLICIES,
  CONTACTS_PERMISSION_STATES,
  CONTACTS_PLATFORMS,
  type ContactsCallDefault,
  type ContactsDiscoveryPolicy,
  type ContactsErrorCode,
  type ContactsMemberRow,
  type ContactsPermissionState,
  type ContactsPlatform,
  type ContactsSyncRequestParse,
} from "@/lib/community-messenger/contacts/contacts-contract";
import {
  CONTACTS_PHONE_KEY_VERSION,
  contactsInstallRefHex,
  contactsPhoneHmacHex,
  readContactsPhoneHmacKey,
  toByteaParam,
} from "@/lib/community-messenger/contacts/contacts-crypto.server";

/**
 * 메신저 연락처 동기화 — 서버 서비스 (SSOT v5 §6·§7·§8). DB 쓰기는 전부 service_role RPC.
 * 메신저 bootstrap·home-sync·Realtime·방 진입 경로에서 부르지 않는다 (필수 조건 4).
 */

export type ContactsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ContactsErrorCode | string; extra?: Record<string, unknown> };

export type ContactsAdminSettings = {
  enabled: boolean;
  joinNoticeEnabled: boolean;
  joinNoticeCap: number;
  dailyNewNumberLimit: number;
  requestNumberLimit: number;
  idleSourceDays: number;
  defaultDiscoveryPolicy: ContactsDiscoveryPolicy;
  consentVersion: string;
  revision: number;
  updatedAt: string | null;
};

export const CONTACTS_ADMIN_DEFAULTS: ContactsAdminSettings = {
  enabled: false,
  joinNoticeEnabled: false,
  joinNoticeCap: 200,
  dailyNewNumberLimit: 3000,
  requestNumberLimit: 1000,
  idleSourceDays: 180,
  defaultDiscoveryPolicy: "everyone",
  consentVersion: "v1",
  revision: 0,
  updatedAt: null,
};

function isMissingRelation(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    m.includes("does not exist") ||
    m.includes("could not find")
  );
}

function rowToAdminSettings(row: Record<string, unknown>): ContactsAdminSettings {
  const policy = String(row.default_discovery_policy ?? "everyone");
  return {
    enabled: row.enabled === true,
    joinNoticeEnabled: row.join_notice_enabled === true,
    joinNoticeCap: Number(row.join_notice_cap ?? 200),
    dailyNewNumberLimit: Number(row.daily_new_number_limit ?? 3000),
    requestNumberLimit: Number(row.request_number_limit ?? 1000),
    idleSourceDays: Number(row.idle_source_days ?? 180),
    defaultDiscoveryPolicy: (CONTACTS_DISCOVERY_POLICIES as readonly string[]).includes(policy)
      ? (policy as ContactsDiscoveryPolicy)
      : "everyone",
    consentVersion: String(row.consent_version ?? "v1"),
    revision: Number(row.revision ?? 0),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

/** 어드민 설정 — 표가 없으면(마이그레이션 미적용) 기본값 = 기능 꺼짐 */
export async function readContactsAdminSettings(
  sb: SupabaseClient
): Promise<{ ok: true; settings: ContactsAdminSettings; tableMissing: boolean } | { ok: false; error: string }> {
  const { data, error } = await sb.from("messenger_contacts_admin_settings").select("*").eq("id", 1).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return { ok: true, settings: CONTACTS_ADMIN_DEFAULTS, tableMissing: true };
    return { ok: false, error: String(error.message ?? "load_failed") };
  }
  if (!data) return { ok: true, settings: CONTACTS_ADMIN_DEFAULTS, tableMissing: false };
  return { ok: true, settings: rowToAdminSettings(data as Record<string, unknown>), tableMissing: false };
}

let enabledCache: { at: number; value: ContactsAdminSettings | null } | null = null;
const ENABLED_CACHE_MS = 30_000;

/** 회원 API 첫 줄 — 기능 꺼짐·표 없음이면 null (30초 메모리 캐시) */
export async function loadEnabledContactsSettings(sb: SupabaseClient): Promise<ContactsAdminSettings | null> {
  const now = Date.now();
  if (enabledCache && now - enabledCache.at < ENABLED_CACHE_MS) return enabledCache.value;
  const r = await readContactsAdminSettings(sb);
  const value = r.ok && !r.tableMissing && r.settings.enabled ? r.settings : null;
  enabledCache = { at: now, value };
  return value;
}

export function resetContactsSettingsCacheForTests(): void {
  enabledCache = null;
}

export type ContactsAdminSaveInput = {
  expectedRevision: number;
  enabled?: boolean | null;
  joinNoticeEnabled?: boolean | null;
  joinNoticeCap?: number | null;
  dailyNewNumberLimit?: number | null;
  requestNumberLimit?: number | null;
  idleSourceDays?: number | null;
  defaultDiscoveryPolicy?: ContactsDiscoveryPolicy | null;
  consentVersion?: string | null;
  actorId: string;
};

export async function saveContactsAdminSettingsCas(
  sb: SupabaseClient,
  input: ContactsAdminSaveInput
): Promise<{ ok: true; revision: number } | { ok: false; error: string; currentRevision?: number }> {
  const { data, error } = await sb.rpc("save_messenger_contacts_admin_settings_cas", {
    p_expected_revision: input.expectedRevision,
    p_enabled: input.enabled ?? null,
    p_join_notice_enabled: input.joinNoticeEnabled ?? null,
    p_join_notice_cap: input.joinNoticeCap ?? null,
    p_daily_new_number_limit: input.dailyNewNumberLimit ?? null,
    p_request_number_limit: input.requestNumberLimit ?? null,
    p_idle_source_days: input.idleSourceDays ?? null,
    p_default_discovery_policy: input.defaultDiscoveryPolicy ?? null,
    p_consent_version: input.consentVersion ?? null,
    p_actor_id: input.actorId,
  });
  if (error) return { ok: false, error: isMissingRelation(error) ? "migration_not_applied" : "save_failed" };
  const out = (data ?? {}) as { ok?: boolean; error?: string; revision?: number; current_revision?: number };
  enabledCache = null;
  if (out.ok === true) return { ok: true, revision: Number(out.revision ?? 0) };
  return { ok: false, error: String(out.error ?? "save_failed"), currentRevision: out.current_revision };
}

/** RPC 공통 — jsonb { ok, error, ... } */
async function callRpc(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<ContactsResult<Record<string, unknown>>> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    console.error(`[contacts] rpc ${fn}`, error.message);
    return { ok: false, error: "internal_error" };
  }
  const out = (data ?? {}) as Record<string, unknown>;
  if (out.ok !== true) return { ok: false, error: String(out.error ?? "internal_error") };
  return { ok: true, value: out };
}

/** 내 인증 번호 → E.164 (번호 없음·미인증이면 null) */
export async function loadOwnVerifiedE164(
  sb: SupabaseClient,
  userId: string
): Promise<{ e164: string | null; verifiedAt: string | null; country: "PH" | "KR" | null }> {
  const { data } = await sb
    .from("profiles")
    .select("phone, phone_country_code, phone_verified, phone_verified_at")
    .eq("id", userId)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  const phone = String(row.phone ?? "").trim();
  const country = detectStoredPhoneCountry({ phone, phone_country_code: row.phone_country_code as string | null });
  if (row.phone_verified !== true || !phone) return { e164: null, verifiedAt: null, country };
  return {
    e164: resolveVerifyPhone(phone)?.e164 ?? null,
    verifiedAt: row.phone_verified_at ? String(row.phone_verified_at) : null,
    country,
  };
}

// ───────────────────────── 동의

export async function consentContacts(
  sb: SupabaseClient,
  userId: string,
  consentVersion: string
): Promise<ContactsResult<{ registeredPhone: boolean; joinNoticeEligible: boolean; defaultCountry: "PH" | "KR" }>> {
  const key = readContactsPhoneHmacKey();
  if (!key) return { ok: false, error: "contacts_unconfigured" };
  const own = await loadOwnVerifiedE164(sb, userId);
  const hmac = own.e164 ? contactsPhoneHmacHex(own.e164, key) : null;
  const r = await callRpc(sb, "cm_contacts_consent", {
    p_user: userId,
    p_consent_version: consentVersion,
    p_phone_hmac: hmac ? toByteaParam(hmac) : null,
    p_key_version: CONTACTS_PHONE_KEY_VERSION,
    p_phone_verified_at: own.verifiedAt,
  });
  if (!r.ok) return r;
  return {
    ok: true,
    value: {
      registeredPhone: r.value.registered_phone === true,
      joinNoticeEligible: r.value.join_notice_eligible === true,
      defaultCountry: own.country ?? "PH",
    },
  };
}

export async function withdrawContactsConsent(sb: SupabaseClient, userId: string): Promise<ContactsResult<{ sourcesRemoved: number }>> {
  const r = await callRpc(sb, "cm_contacts_withdraw", { p_user: userId });
  return r.ok ? { ok: true, value: { sourcesRemoved: Number(r.value.sources_removed ?? 0) } } : r;
}

// ───────────────────────── 계정 설정

export type ContactsUserSettings = {
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

export async function getContactsUserSettings(
  sb: SupabaseClient,
  userId: string,
  admin: ContactsAdminSettings
): Promise<ContactsResult<ContactsUserSettings>> {
  const [{ data: st }, { data: lk }, own] = await Promise.all([
    sb.from("messenger_contact_settings").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("member_phone_lookup").select("user_id").eq("user_id", userId).maybeSingle(),
    loadOwnVerifiedE164(sb, userId),
  ]);
  const s = (st ?? null) as Record<string, unknown> | null;
  const explicit = s?.discovery_policy ? String(s.discovery_policy) : null;
  const callDefault = String(s?.call_default ?? "ask");
  return {
    ok: true,
    value: {
      consented: Boolean(s?.consented_at) && !s?.withdrawn_at,
      consentVersion: s?.consent_version ? String(s.consent_version) : null,
      accountSyncEnabled: s ? s.account_sync_enabled !== false : true,
      discoveryPolicy: (explicit as ContactsDiscoveryPolicy | null) ?? admin.defaultDiscoveryPolicy,
      discoveryPolicyIsDefault: !explicit,
      joinNotifyEnabled: s ? s.join_notify_enabled !== false : true,
      callDefault: ((CONTACTS_CALL_DEFAULTS as readonly string[]).includes(callDefault) ? callDefault : "ask") as ContactsCallDefault,
      registeredPhone: Boolean(lk),
      hasVerifiedPhone: Boolean(own.e164),
      defaultCountry: own.country ?? "PH",
      currentConsentVersion: admin.consentVersion,
    },
  };
}

export type ContactsUserSettingsPatch = {
  accountSyncEnabled?: boolean;
  discoveryPolicy?: ContactsDiscoveryPolicy | null;
  joinNotifyEnabled?: boolean;
  callDefault?: ContactsCallDefault;
};

export function parseContactsSettingsPatch(body: unknown): ContactsUserSettingsPatch | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: ContactsUserSettingsPatch = {};
  if (b.accountSyncEnabled !== undefined) {
    if (typeof b.accountSyncEnabled !== "boolean") return null;
    out.accountSyncEnabled = b.accountSyncEnabled;
  }
  if (b.discoveryPolicy !== undefined) {
    if (b.discoveryPolicy !== null && !(CONTACTS_DISCOVERY_POLICIES as readonly unknown[]).includes(b.discoveryPolicy)) return null;
    out.discoveryPolicy = b.discoveryPolicy as ContactsDiscoveryPolicy | null;
  }
  if (b.joinNotifyEnabled !== undefined) {
    if (typeof b.joinNotifyEnabled !== "boolean") return null;
    out.joinNotifyEnabled = b.joinNotifyEnabled;
  }
  if (b.callDefault !== undefined) {
    if (!(CONTACTS_CALL_DEFAULTS as readonly unknown[]).includes(b.callDefault)) return null;
    out.callDefault = b.callDefault as ContactsCallDefault;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function patchContactsUserSettings(
  sb: SupabaseClient,
  userId: string,
  patch: ContactsUserSettingsPatch
): Promise<ContactsResult<true>> {
  const { data: before } = await sb
    .from("messenger_contact_settings")
    .select("consented_at, withdrawn_at, discovery_policy, account_sync_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  const b = before as Record<string, unknown> | null;
  if (!b || !b.consented_at || b.withdrawn_at) return { ok: false, error: "consent_required" };
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.accountSyncEnabled !== undefined) row.account_sync_enabled = patch.accountSyncEnabled;
  if (patch.discoveryPolicy !== undefined) row.discovery_policy = patch.discoveryPolicy;
  if (patch.joinNotifyEnabled !== undefined) row.join_notify_enabled = patch.joinNotifyEnabled;
  if (patch.callDefault !== undefined) row.call_default = patch.callDefault;
  const { error } = await sb.from("messenger_contact_settings").update(row).eq("user_id", userId);
  if (error) return { ok: false, error: "internal_error" };

  const bumps: string[] = [];
  if (patch.accountSyncEnabled !== undefined && patch.accountSyncEnabled !== (b.account_sync_enabled !== false)) bumps.push(userId);
  if (patch.discoveryPolicy !== undefined && (patch.discoveryPolicy ?? null) !== ((b.discovery_policy as string | null) ?? null)) {
    // 내 공개 범위가 바뀌면 내 번호를 저장한 회원들 목록도 다시 계산되게
    const { data: lk } = await sb.from("member_phone_lookup").select("phone_hmac").eq("user_id", userId).maybeSingle();
    const hmac = (lk as { phone_hmac?: string } | null)?.phone_hmac;
    if (hmac) {
      const { data: owners } = await sb.rpc("cm_contacts_owner_ids_for_hmac", { p_hmac: hmac, p_exclude: userId });
      if (Array.isArray(owners)) bumps.push(...(owners as string[]));
    }
  }
  if (bumps.length > 0) await sb.rpc("cm_contacts_bump_owner_versions", { p_owner_ids: bumps });
  return { ok: true, value: true };
}

// ───────────────────────── 기기 출처

export function isContactsPlatform(v: unknown): v is ContactsPlatform {
  return (CONTACTS_PLATFORMS as readonly unknown[]).includes(v);
}
export function isContactsPermissionState(v: unknown): v is ContactsPermissionState {
  return (CONTACTS_PERMISSION_STATES as readonly unknown[]).includes(v);
}

export async function registerContactsSource(
  sb: SupabaseClient,
  userId: string,
  installId: string,
  platform: ContactsPlatform
): Promise<ContactsResult<Record<string, unknown>>> {
  return callRpc(sb, "cm_contacts_register_source", {
    p_user: userId,
    p_install_ref: toByteaParam(contactsInstallRefHex(userId, installId)),
    p_platform: platform,
  });
}

export type ContactsSourceSummary = {
  id: string;
  platform: ContactsPlatform;
  status: "active" | "removed";
  syncEnabled: boolean;
  permissionState: ContactsPermissionState;
  revokeChoice: "delete" | "keep" | null;
  lastUsedAt: string;
  lastSyncAt: string | null;
  entryCount: number;
  isThisDevice: boolean;
};

export async function listContactsSources(
  sb: SupabaseClient,
  userId: string,
  installId: string | null
): Promise<ContactsResult<ContactsSourceSummary[]>> {
  const { data, error } = await sb
    .from("contact_sources")
    .select("id, platform, status, sync_enabled, permission_state, revoke_choice, last_used_at, last_sync_at, install_ref")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("last_used_at", { ascending: false })
    .limit(20);
  if (error) return { ok: false, error: "internal_error" };
  const rows = (data ?? []) as Record<string, unknown>[];
  const mine = installId ? `\\x${contactsInstallRefHex(userId, installId)}` : null;
  const counts = await Promise.all(
    rows.map(async (r) => {
      const { count } = await sb
        .from("contact_source_entries")
        .select("source_id", { count: "exact", head: true })
        .eq("source_id", String(r.id));
      return count ?? 0;
    })
  );
  return {
    ok: true,
    value: rows.map((r, i) => ({
      id: String(r.id),
      platform: r.platform as ContactsPlatform,
      status: r.status as "active" | "removed",
      syncEnabled: r.sync_enabled === true,
      permissionState: r.permission_state as ContactsPermissionState,
      revokeChoice: (r.revoke_choice as "delete" | "keep" | null) ?? null,
      lastUsedAt: String(r.last_used_at),
      lastSyncAt: r.last_sync_at ? String(r.last_sync_at) : null,
      entryCount: counts[i] ?? 0,
      isThisDevice: Boolean(mine) && String(r.install_ref ?? "").toLowerCase() === mine,
    })),
  };
}

export async function patchContactsSource(
  sb: SupabaseClient,
  userId: string,
  sourceId: string,
  installId: string,
  patch: { syncEnabled?: boolean | null; permissionState?: ContactsPermissionState | null; revokeChoice?: "delete" | "keep" | null }
): Promise<ContactsResult<{ removed: boolean }>> {
  const r = await callRpc(sb, "cm_contacts_patch_source", {
    p_user: userId,
    p_source: sourceId,
    p_install_ref: toByteaParam(contactsInstallRefHex(userId, installId)),
    p_sync_enabled: patch.syncEnabled ?? null,
    p_permission_state: patch.permissionState ?? null,
    p_revoke_choice: patch.revokeChoice ?? null,
  });
  return r.ok ? { ok: true, value: { removed: r.value.removed === true } } : r;
}

export async function deleteContactsSource(sb: SupabaseClient, userId: string, sourceId: string): Promise<ContactsResult<true>> {
  const r = await callRpc(sb, "cm_contacts_delete_source", { p_user: userId, p_source: sourceId });
  return r.ok ? { ok: true, value: true } : r;
}

export async function deleteAllContacts(sb: SupabaseClient, userId: string): Promise<ContactsResult<{ sourcesRemoved: number }>> {
  const r = await callRpc(sb, "cm_contacts_delete_all", { p_user: userId });
  return r.ok ? { ok: true, value: { sourcesRemoved: Number(r.value.sources_removed ?? 0) } } : r;
}

// ───────────────────────── 업로드

export async function applyContactsSync(
  sb: SupabaseClient,
  userId: string,
  req: Extract<ContactsSyncRequestParse, { ok: true }>["value"]
): Promise<ContactsResult<Record<string, unknown>>> {
  const key = readContactsPhoneHmacKey();
  if (!key) return { ok: false, error: "contacts_unconfigured" };
  const add = req.add.map((a) => ({ h: contactsPhoneHmacHex(a.e164, key), r: a.ref }));
  const remove = req.remove.map((e) => contactsPhoneHmacHex(e, key));
  const { data, error } = await sb.rpc("cm_contacts_apply", {
    p_user: userId,
    p_source: req.sourceId,
    p_install_ref: toByteaParam(contactsInstallRefHex(userId, req.installId)),
    p_batch_id: req.batchId,
    p_kind: req.kind,
    p_base_version: req.baseVersion,
    p_add: add,
    p_remove: remove,
    p_generation: req.generation,
    p_chunk_index: req.chunkIndex,
    p_chunk_total: req.chunkTotal,
  });
  if (error) {
    console.error("[contacts] rpc cm_contacts_apply", error.message);
    return { ok: false, error: "internal_error" };
  }
  const out = (data ?? {}) as Record<string, unknown>;
  if (out.ok !== true) {
    // 409 응답에도 현재 기기 버전을 실어 보낸다 (기기가 전체 스냅숏 판단에 사용)
    return {
      ok: false,
      error: String(out.error ?? "internal_error"),
      extra: out.device_version !== undefined ? { deviceVersion: Number(out.device_version) } : undefined,
    };
  }
  return { ok: true, value: out };
}

// ───────────────────────── 목록

export type ContactsListValue =
  | { notModified: true; token: string }
  | { notModified: false; token: string | null; accountSyncOff: boolean; members: ContactsMemberRow[]; friendIds: string[] };

export async function listContacts(
  sb: SupabaseClient,
  userId: string,
  sourceId: string | null,
  sinceToken: string | null
): Promise<ContactsResult<ContactsListValue>> {
  const r = await callRpc(sb, "cm_contacts_list", { p_user: userId, p_source: sourceId, p_since_token: sinceToken });
  if (!r.ok) return r;
  if (r.value.not_modified === true) return { ok: true, value: { notModified: true, token: String(r.value.token) } };
  return {
    ok: true,
    value: {
      notModified: false,
      token: r.value.token ? String(r.value.token) : null,
      accountSyncOff: r.value.account_sync_off === true,
      members: (Array.isArray(r.value.members) ? r.value.members : []) as ContactsMemberRow[],
      friendIds: (Array.isArray(r.value.friend_ids) ? r.value.friend_ids : []) as string[],
    },
  };
}

// ───────────────────────── 숨긴 추천

export type ContactsSuppressionRow = {
  userId: string;
  reason: "hidden" | "former_friend";
  createdAt: string;
  nickname: string | null;
  avatarUrl: string | null;
};

export async function listContactsSuppressions(sb: SupabaseClient, userId: string): Promise<ContactsResult<ContactsSuppressionRow[]>> {
  const { data, error } = await sb
    .from("contact_suppressions")
    .select("target_user_id, reason, created_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, error: "internal_error" };
  const rows = (data ?? []) as { target_user_id: string; reason: "hidden" | "former_friend"; created_at: string }[];
  const ids = rows.map((r) => r.target_user_id);
  const { data: profs } = ids.length
    ? await sb.from("profiles").select("id, nickname, avatar_url").in("id", ids)
    : { data: [] as unknown[] };
  const byId = new Map(((profs ?? []) as { id: string; nickname: string | null; avatar_url: string | null }[]).map((p) => [p.id, p]));
  return {
    ok: true,
    value: rows
      .filter((r) => byId.has(r.target_user_id))
      .map((r) => ({
        userId: r.target_user_id,
        reason: r.reason,
        createdAt: r.created_at,
        nickname: byId.get(r.target_user_id)?.nickname ?? null,
        avatarUrl: byId.get(r.target_user_id)?.avatar_url ?? null,
      })),
  };
}

export async function setContactsSuppression(
  sb: SupabaseClient,
  userId: string,
  targetUserId: string,
  hidden: boolean
): Promise<ContactsResult<true>> {
  if (targetUserId === userId) return { ok: false, error: "bad_request" };
  if (hidden) {
    const { error } = await sb
      .from("contact_suppressions")
      .upsert({ owner_user_id: userId, target_user_id: targetUserId, reason: "hidden" }, { onConflict: "owner_user_id,target_user_id", ignoreDuplicates: true });
    if (error) return { ok: false, error: "internal_error" };
  } else {
    const { error } = await sb.from("contact_suppressions").delete().eq("owner_user_id", userId).eq("target_user_id", targetUserId);
    if (error) return { ok: false, error: "internal_error" };
  }
  await sb.rpc("cm_contacts_bump_owner_versions", { p_owner_ids: [userId] });
  return { ok: true, value: true };
}

// ───────────────────────── 매일 정리 (예약 작업)

export async function runContactsDailyMaintenance(
  sb: SupabaseClient
): Promise<ContactsResult<{ maintenance: Record<string, unknown>; lookupsRefreshed: number; lookupsSkipped: string | null }>> {
  const m = await callRpc(sb, "cm_contacts_daily_maintenance", { p_dry_run: false });
  if (!m.ok) return m;
  const key = readContactsPhoneHmacKey();
  if (!key) return { ok: true, value: { maintenance: m.value, lookupsRefreshed: 0, lookupsSkipped: "contacts_unconfigured" } };
  const { data, error } = await sb.rpc("cm_contacts_lookup_refresh_candidates", { p_limit: 500 });
  if (error) return { ok: true, value: { maintenance: m.value, lookupsRefreshed: 0, lookupsSkipped: "candidates_failed" } };
  let refreshed = 0;
  for (const c of (Array.isArray(data) ? data : []) as Record<string, unknown>[]) {
    const e164 = resolveVerifyPhone(String(c.phone ?? ""))?.e164;
    if (!e164) continue;
    const r = await callRpc(sb, "cm_contacts_lookup_upsert", {
      p_user: String(c.user_id),
      p_phone_hmac: toByteaParam(contactsPhoneHmacHex(e164, key)),
      p_key_version: CONTACTS_PHONE_KEY_VERSION,
      p_phone_verified_at: c.phone_verified_at ?? null,
    });
    if (r.ok) refreshed += 1;
  }
  return { ok: true, value: { maintenance: m.value, lookupsRefreshed: refreshed, lookupsSkipped: null } };
}

export type ContactsAdminCounts = {
  consentedUsers: number | null;
  activeSources: number | null;
  entries: number | null;
  openSuppressionFailures: number | null;
};

export async function loadContactsAdminCounts(sb: SupabaseClient): Promise<ContactsAdminCounts> {
  const head = { count: "exact" as const, head: true };
  const [consented, sources, entries, failures] = await Promise.all([
    sb.from("messenger_contact_settings").select("user_id", head).not("consented_at", "is", null).is("withdrawn_at", null),
    sb.from("contact_sources").select("id", head).eq("status", "active"),
    sb.from("contact_source_entries").select("source_id", head),
    sb.from("contact_suppression_failures").select("id", head).is("resolved_at", null),
  ]);
  return {
    consentedUsers: consented.error ? null : consented.count ?? 0,
    activeSources: sources.error ? null : sources.count ?? 0,
    entries: entries.error ? null : entries.count ?? 0,
    openSuppressionFailures: failures.error ? null : failures.count ?? 0,
  };
}
