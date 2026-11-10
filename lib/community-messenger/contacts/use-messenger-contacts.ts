"use client";

/**
 * 연락처 화면 상태 (친구 탭 섹션 · 연락처 화면 공통) — SSOT v5 §4·§7·§8.
 * 목록 조회는 이 훅이 화면에 보일 때 1회 + 같은 회원 60초 안 재호출 없음(모듈 캐시). 메신저 bootstrap·Realtime 과 무관.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import {
  acceptIncomingFriendRequestFromContacts,
  contactsApi,
  type ContactsUserSettingsDto,
} from "@/lib/community-messenger/contacts/contacts-api-client";
import type { ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";
import {
  checkContactsPermission,
  isContactsNativeAvailable,
  requestContactsPermission,
  type ContactsNativePermission,
} from "@/lib/community-messenger/contacts/contacts-native";
import {
  CONTACTS_CHANGED_EVENT,
  clearContactsStop,
  patchContactsLocalState,
  type ContactsLocalState,
  readContactsLocalState,
} from "@/lib/community-messenger/contacts/contacts-local-store";
import { runContactsSync, type ContactsSyncOutcome } from "@/lib/community-messenger/contacts/contacts-sync-engine";
import { resetContactsArchiveSummary } from "@/lib/community-messenger/contacts/contacts-summary-cache";
import { setContactsFriendTagIds } from "@/lib/community-messenger/contacts/contacts-friend-tag-store";

/** error = 설정을 불러오지 못함(네트워크·서버) — 기능 꺼짐(disabled)과 구분해 다시 시도를 보여 준다 */
export type MessengerContactsPhase = "loading" | "error" | "disabled" | "consent" | "ready";

export type MessengerContactsView = {
  phase: MessengerContactsPhase;
  settings: ContactsUserSettingsDto | null;
  members: ContactsMemberRow[];
  friendIds: string[];
  accountSyncOff: boolean;
  nativeAvailable: boolean;
  permission: ContactsNativePermission | null;
  revokePending: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  /** 이 기기 연락처를 아직 올리지 않았는데 다른 기기 결과가 있음 */
  otherDeviceOnly: boolean;
  names: Record<string, string>;
  /** 이 기기 연락처 중 초대에서 뺄 항목 (친구·숨김·차단) */
  knownRefs: string[];
  /** 어드민 킬스위치 꺼짐 — 동의한 회원은 설정 화면에서 삭제·철회만 할 수 있다 */
  featureOff: boolean;
  /** 목록을 불러오지 못함 (다시 시도 표시) */
  listError: boolean;
  /** 권한 철회 안내의 「이미 올린 n개」 */
  revokeCount: number;
  /** 이 기기는 아직 올리기를 허락하지 않음 (#11) — 다른 기기 결과가 있으면 otherDeviceOnly 로 묻는다 */
  deviceApprovalNeeded: boolean;
  /** 이 기기 멈춤 이유 (지움·끔 등) — 안내 띠가 「다시 켜기」를 보여 준다 */
  stoppedReason: ContactsLocalState["stoppedReason"];
  /** 친구 중 이 기기 연락처에 있는 회원 → client_ref (친구 행 「내 연락처」·친구 프로필 휴대폰 전화) */
  friendRefs: Record<string, string>;
};

const LIST_MIN_INTERVAL_MS = 60_000;
type ListCacheEntry = {
  at: number;
  members: ContactsMemberRow[];
  friendIds: string[];
  knownRefs: string[];
  friendRefs: Record<string, string>;
  accountSyncOff: boolean;
  token: string | null;
};
const listCache = new Map<string, ListCacheEntry>();
/** 목록 조회 회원별 단일 비행 (§7) — 동의 직후·동기화 직후가 겹쳐도 요청 1개 */
const listInflight = new Map<string, Promise<ListCacheEntry | null>>();
const settingsCache = new Map<string, { at: number; settings: ContactsUserSettingsDto | null; disabled: boolean }>();

export function invalidateMessengerContactsCache(): void {
  listCache.clear();
  settingsCache.clear();
  resetContactsArchiveSummary();
}

async function fetchContactsList(userId: string): Promise<ListCacheEntry | null> {
  const cached = listCache.get(userId);
  const local = readContactsLocalState(userId);
  const r = await contactsApi.list(local.sourceId, cached?.token ?? local.listToken);
  if (!r.ok) return null;
  if (r.data.notModified) {
    const entry: ListCacheEntry = {
      at: Date.now(),
      members: cached?.members ?? local.members,
      friendIds: cached?.friendIds ?? local.friendIds,
      knownRefs: cached?.knownRefs ?? local.knownRefs,
      friendRefs: cached?.friendRefs ?? {},
      accountSyncOff: cached?.accountSyncOff ?? false,
      token: r.data.token,
    };
    listCache.set(userId, entry);
    return entry;
  }
  const d = r.data;
  const entry: ListCacheEntry = {
    at: Date.now(),
    members: d.members,
    friendIds: d.friendIds,
    knownRefs: d.knownRefs ?? [],
    friendRefs: d.friendRefs ?? {},
    accountSyncOff: d.accountSyncOff,
    token: d.token,
  };
  listCache.set(userId, entry);
  patchContactsLocalState(userId, { members: d.members, friendIds: d.friendIds, knownRefs: entry.knownRefs, listToken: d.token });
  return entry;
}

export function useMessengerContacts(opts: { autoSync?: boolean } = {}) {
  const userId = getBoundAuthUserId() ?? "";
  const nativeAvailable = isContactsNativeAvailable();
  // 기기 저장값은 처음 한 번만 읽는다 (렌더마다 전체 JSON 파싱 금지 — 감사 P1)
  const [view, setView] = useState<MessengerContactsView>(() => {
    const local0 = userId ? readContactsLocalState(userId) : null;
    const cachedList = listCache.get(userId);
    return {
      phase: "loading",
      settings: null,
      members: cachedList?.members ?? local0?.members ?? [],
      friendIds: cachedList?.friendIds ?? local0?.friendIds ?? [],
      accountSyncOff: cachedList?.accountSyncOff ?? false,
      nativeAvailable,
      permission: local0?.lastPermission ?? null,
      revokePending: local0?.revokePending ?? false,
      syncing: false,
      lastSyncAt: local0?.lastSyncAt ?? null,
      otherDeviceOnly: false,
      names: local0?.names ?? {},
      knownRefs: cachedList?.knownRefs ?? local0?.knownRefs ?? [],
      featureOff: false,
      listError: false,
      revokeCount: local0?.revokeCount ?? 0,
      deviceApprovalNeeded: false,
      stoppedReason: local0?.stoppedReason ?? null,
      friendRefs: cachedList?.friendRefs ?? {},
    };
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const set = useCallback((patch: Partial<MessengerContactsView>) => {
    if (mounted.current) setView((v) => ({ ...v, ...patch }));
  }, []);

  const loadList = useCallback(
    async (force: boolean) => {
      if (!userId) return;
      const cached = listCache.get(userId);
      if (!force && cached && Date.now() - cached.at < LIST_MIN_INTERVAL_MS) {
        set({
          members: cached.members,
          friendIds: cached.friendIds,
          accountSyncOff: cached.accountSyncOff,
          knownRefs: cached.knownRefs,
          friendRefs: cached.friendRefs,
        });
        return;
      }
      let p = listInflight.get(userId);
      if (!p) {
        p = fetchContactsList(userId).finally(() => listInflight.delete(userId));
        listInflight.set(userId, p);
      }
      const entry = await p;
      if (!entry) {
        set({ listError: true });
        return;
      }
      const after = readContactsLocalState(userId);
      setContactsFriendTagIds(entry.accountSyncOff ? [] : entry.friendIds);
      set({
        members: entry.members,
        friendIds: entry.friendIds,
        knownRefs: entry.knownRefs,
        friendRefs: entry.friendRefs,
        accountSyncOff: entry.accountSyncOff,
        listError: false,
        names: after.names,
      });
    },
    [set, userId]
  );

  const afterSync = useCallback(
    async (outcome: ContactsSyncOutcome) => {
      const local = userId ? readContactsLocalState(userId) : null;
      set({
        syncing: false,
        permission: local?.lastPermission ?? null,
        revokePending: local?.revokePending ?? false,
        revokeCount: local?.revokeCount ?? 0,
        lastSyncAt: local?.lastSyncAt ?? null,
        names: local?.names ?? {},
        stoppedReason: local?.stoppedReason ?? null,
        deviceApprovalNeeded: outcome === "device_not_approved",
      });
      if (outcome === "device_not_approved" && local && !local.newDeviceAsked) {
        // #11 「다른 기기에서 동기화한 연락처가 있어요 · 이 기기 연락처도 추가할까요?」 — 계정에 다른 기기 출처가 있을 때만 1번
        const src = await contactsApi.sources(null);
        if (src.ok) set({ otherDeviceOnly: src.data.sources.length > 0 });
      }
      if (outcome === "uploaded") await loadList(true);
    },
    [loadList, set, userId]
  );

  /** 동기화 1회 → 결과(화면이 안내에 쓴다). 올렸으면 afterSync 가 목록을 새로 받고, 수동인데 안 올렸으면 여기서 받는다 */
  const sync = useCallback(
    async (manual: boolean, reactivate = false): Promise<ContactsSyncOutcome | null> => {
      if (!userId) return null;
      set({ syncing: true });
      const outcome = await runContactsSync(userId, { manual, reactivate });
      await afterSync(outcome);
      if (manual && outcome !== "uploaded") await loadList(true);
      return outcome;
    },
    [afterSync, loadList, set, userId]
  );

  /** 설정 1회 → 동의한 회원이면 목록 + (앱) 자동 비교. 실패는 캐시하지 않는다 (다시 시도 가능) */
  const start = useCallback(
    async (isCancelled: () => boolean) => {
      if (!userId) {
        set({ phase: "disabled" });
        return;
      }
      const cached = settingsCache.get(userId);
      let settings: ContactsUserSettingsDto | null = cached?.settings ?? null;
      let disabled = cached?.disabled ?? false;
      if (!cached || Date.now() - cached.at > LIST_MIN_INTERVAL_MS) {
        const r = await contactsApi.settings();
        if (isCancelled()) return;
        if (!r.ok) {
          // 503 contacts_disabled 만 「기능 꺼짐」, 그 밖(네트워크·429·500)은 오류 + 다시 시도 (최종 점검 #3)
          if (r.error === "contacts_disabled") set({ phase: "disabled", settings: null, featureOff: false });
          else set({ phase: "error" });
          return;
        }
        // 기능 꺼짐이어도 설정은 내려온다 (featureEnabled=false) — 동의한 회원의 삭제·철회용
        disabled = r.data.featureEnabled === false;
        settings = r.data.settings;
        settingsCache.set(userId, { at: Date.now(), settings, disabled });
        if (typeof r.data.requestNumberLimit === "number") {
          patchContactsLocalState(userId, { requestNumberLimit: r.data.requestNumberLimit });
        }
      }
      if (isCancelled()) return;
      if (disabled || !settings) {
        set({ phase: "disabled", settings, featureOff: Boolean(settings) });
        return;
      }
      patchContactsLocalState(userId, { consented: settings.consented, defaultCountry: settings.defaultCountry });
      if (!settings.consented) {
        set({ phase: "consent", settings });
        return;
      }
      set({ phase: "ready", settings });
      await loadList(false);
      if (opts.autoSync !== false && nativeAvailable) await sync(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opts.autoSync 는 화면마다 고정
    [loadList, nativeAvailable, set, sync, userId]
  );

  // 처음 1회
  useEffect(() => {
    let cancelled = false;
    void start(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 화면 진입 1회
  }, [userId]);

  const retry = useCallback(() => {
    set({ phase: "loading" });
    void start(() => false);
  }, [set, start]);

  /** 동의 → 권한 → 불러오기 (기존·신규 회원 공통) */
  const consentAndStart = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    const r = await contactsApi.consent();
    if (!r.ok) return false;
    // 이 기기에서 동의 = 이 기기 올리기 허락 (#11)
    patchContactsLocalState(userId, { consented: true, defaultCountry: r.data.defaultCountry, deviceApproved: true });
    clearContactsStop(userId);
    invalidateMessengerContactsCache();
    const s = await contactsApi.settings();
    if (s.ok) settingsCache.set(userId, { at: Date.now(), settings: s.data.settings, disabled: false });
    set({ phase: "ready", settings: s.ok ? s.data.settings : view.settings });
    let uploaded = false;
    if (nativeAvailable) {
      const state = await requestContactsPermission();
      patchContactsLocalState(userId, { lastPermission: state });
      set({ permission: state });
      if (state === "granted" || state === "limited") {
        const outcome = await sync(true, true);
        // sync 가 이미 목록을 새로 받았다 (올림 → afterSync · 안 올림 → 수동 경로) — 같은 요청을 또 보내지 않는다 (최종 점검 #10)
        uploaded = outcome !== null;
      }
    }
    if (!uploaded) await loadList(true);
    return true;
  }, [loadList, nativeAvailable, set, sync, userId, view.settings]);

  /** 「이 기기 연락처도 추가할까요?」 답 */
  const answerNewDevice = useCallback(
    async (add: boolean) => {
      if (!userId) return;
      patchContactsLocalState(userId, { newDeviceAsked: true, ...(add ? { deviceApproved: true } : {}) });
      set({ otherDeviceOnly: false });
      if (!add) return;
      const state = await requestContactsPermission();
      set({ permission: state });
      if (state === "granted" || state === "limited") await sync(true, true);
    },
    [set, sync, userId]
  );

  /** OS 권한 철회 안내 답 (#19) — 지우기 = 이 기기 출처 삭제, 유지 = 업로드 중단만 */
  // 앱 전체 안내에서 철회에 답함 등 → 열린 화면도 기기 안 상태·목록을 다시 읽는다
  useEffect(() => {
    if (!userId) return;
    const onChanged = () => {
      const local = readContactsLocalState(userId);
      set({
        revokePending: local.revokePending,
        names: local.names,
        lastSyncAt: local.lastSyncAt,
        stoppedReason: local.stoppedReason,
      });
      listCache.delete(userId);
      void loadList(true);
    };
    window.addEventListener(CONTACTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CONTACTS_CHANGED_EVENT, onChanged);
  }, [loadList, set, userId]);

  /** 「시작하기」·권한 다시 허용 — 이 기기에서 회원이 직접 켬 (허락 + 지운 출처 재개) */
  const requestPermissionAgain = useCallback(async () => {
    if (userId) patchContactsLocalState(userId, { deviceApproved: true });
    const state = await requestContactsPermission();
    set({ permission: state, deviceApprovalNeeded: false });
    if (state === "granted" || state === "limited") await sync(true, true);
  }, [set, sync, userId]);

  /** 지운 이 기기 연락처를 다시 켬 (「다시 켜기」) — 그 기기에서 회원이 직접 한 동작만 재개 (감사 A9) */
  const turnOnThisDevice = useCallback(async () => {
    if (!userId) return null;
    clearContactsStop(userId);
    return sync(true, true);
  }, [sync, userId]);

  const refreshPermission = useCallback(async () => {
    set({ permission: await checkContactsPermission() });
  }, [set]);

  const removeMemberLocally = useCallback(
    (memberId: string) => {
      setView((v) => ({ ...v, members: v.members.filter((m) => m.user_id !== memberId) }));
      listCache.delete(userId);
    },
    [userId]
  );

  /** 받은 요청 수락 (기존 메신저 수락 경로) → 친구가 되어 목록에서 빠짐 */
  const acceptRequest = useCallback(
    async (memberId: string) => {
      const r = await acceptIncomingFriendRequestFromContacts(memberId);
      if (r.ok) {
        setView((v) => ({ ...v, members: v.members.filter((m) => m.user_id !== memberId), friendIds: [...v.friendIds, memberId] }));
        listCache.delete(userId);
      }
      return r;
    },
    [userId]
  );

  const markRequested = useCallback(
    (memberId: string) => {
      setView((v) => ({
        ...v,
        members: v.members.map((m) => (m.user_id === memberId ? { ...m, request_state: "sent" } : m)),
      }));
      listCache.delete(userId);
    },
    [userId]
  );

  return {
    view,
    userId,
    refresh: () => sync(true),
    retry,
    reloadList: () => loadList(true),
    consentAndStart,
    answerNewDevice,
    requestPermissionAgain,
    turnOnThisDevice,
    refreshPermission,
    removeMemberLocally,
    markRequested,
    acceptRequest,
  };
}
