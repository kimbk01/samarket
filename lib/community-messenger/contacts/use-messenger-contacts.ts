"use client";

/**
 * 연락처 화면 상태 (친구 탭 섹션 · 연락처 화면 공통) — SSOT v5 §4·§7·§8.
 * 목록 조회는 이 훅이 화면에 보일 때 1회 + 같은 회원 60초 안 재호출 없음(모듈 캐시). 메신저 bootstrap·Realtime 과 무관.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { contactsApi, type ContactsUserSettingsDto } from "@/lib/community-messenger/contacts/contacts-api-client";
import type { ContactsMemberRow } from "@/lib/community-messenger/contacts/contacts-contract";
import {
  checkContactsPermission,
  isContactsNativeAvailable,
  requestContactsPermission,
  type ContactsNativePermission,
} from "@/lib/community-messenger/contacts/contacts-native";
import {
  clearContactsDeviceData,
  patchContactsLocalState,
  readContactsLocalState,
} from "@/lib/community-messenger/contacts/contacts-local-store";
import { runContactsSync, type ContactsSyncOutcome } from "@/lib/community-messenger/contacts/contacts-sync-engine";
import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";

export type MessengerContactsPhase = "loading" | "disabled" | "consent" | "ready";

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
};

const LIST_MIN_INTERVAL_MS = 60_000;
const listCache = new Map<string, { at: number; members: ContactsMemberRow[]; friendIds: string[]; accountSyncOff: boolean; token: string | null }>();
const settingsCache = new Map<string, { at: number; settings: ContactsUserSettingsDto | null; disabled: boolean }>();

export function invalidateMessengerContactsCache(): void {
  listCache.clear();
  settingsCache.clear();
}

export function useMessengerContacts(opts: { autoSync?: boolean } = {}) {
  const userId = getBoundAuthUserId() ?? "";
  const nativeAvailable = isContactsNativeAvailable();
  const local0 = userId ? readContactsLocalState(userId) : null;
  const cachedList = listCache.get(userId);
  const [view, setView] = useState<MessengerContactsView>({
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
        set({ members: cached.members, friendIds: cached.friendIds, accountSyncOff: cached.accountSyncOff });
        return;
      }
      const local = readContactsLocalState(userId);
      const r = await contactsApi.list(local.sourceId, cached?.token ?? local.listToken);
      if (!r.ok) return;
      if (r.data.notModified) {
        const members = cached?.members ?? local.members;
        const friendIds = cached?.friendIds ?? local.friendIds;
        listCache.set(userId, { at: Date.now(), members, friendIds, accountSyncOff: false, token: r.data.token });
        set({ members, friendIds });
        return;
      }
      const d = r.data;
      listCache.set(userId, { at: Date.now(), members: d.members, friendIds: d.friendIds, accountSyncOff: d.accountSyncOff, token: d.token });
      patchContactsLocalState(userId, { members: d.members, friendIds: d.friendIds, listToken: d.token });
      const after = readContactsLocalState(userId);
      set({
        members: d.members,
        friendIds: d.friendIds,
        accountSyncOff: d.accountSyncOff,
        names: after.names,
        otherDeviceOnly: nativeAvailable && !after.numbers && d.members.length > 0 && !after.newDeviceAsked,
      });
    },
    [nativeAvailable, set, userId]
  );

  const afterSync = useCallback(
    async (outcome: ContactsSyncOutcome) => {
      const local = userId ? readContactsLocalState(userId) : null;
      set({
        syncing: false,
        permission: local?.lastPermission ?? null,
        revokePending: local?.revokePending ?? false,
        lastSyncAt: local?.lastSyncAt ?? null,
        names: local?.names ?? {},
      });
      if (outcome === "uploaded") await loadList(true);
    },
    [loadList, set, userId]
  );

  const sync = useCallback(
    async (manual: boolean) => {
      if (!userId) return;
      set({ syncing: true });
      const outcome = await runContactsSync(userId, { manual });
      await afterSync(outcome);
      if (manual && outcome !== "uploaded") await loadList(true);
    },
    [afterSync, loadList, set, userId]
  );

  // 처음: 설정 1회 → 동의한 회원이면 목록 + (앱) 자동 비교
  useEffect(() => {
    if (!userId) {
      set({ phase: "disabled" });
      return;
    }
    let cancelled = false;
    void (async () => {
      const cached = settingsCache.get(userId);
      let settings: ContactsUserSettingsDto | null = cached?.settings ?? null;
      let disabled = cached?.disabled ?? false;
      if (!cached || Date.now() - cached.at > LIST_MIN_INTERVAL_MS) {
        const r = await contactsApi.settings();
        disabled = !r.ok;
        settings = r.ok ? r.data.settings : null;
        settingsCache.set(userId, { at: Date.now(), settings, disabled });
      }
      if (cancelled) return;
      if (disabled || !settings) {
        set({ phase: "disabled", settings: null });
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
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 화면 진입 1회
  }, [userId]);

  /** 동의 → 권한 → 불러오기 (기존·신규 회원 공통) */
  const consentAndStart = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    const r = await contactsApi.consent();
    if (!r.ok) return false;
    patchContactsLocalState(userId, { consented: true, defaultCountry: r.data.defaultCountry });
    invalidateMessengerContactsCache();
    const s = await contactsApi.settings();
    if (s.ok) settingsCache.set(userId, { at: Date.now(), settings: s.data.settings, disabled: false });
    set({ phase: "ready", settings: s.ok ? s.data.settings : view.settings });
    if (nativeAvailable) {
      const state = await requestContactsPermission();
      patchContactsLocalState(userId, { lastPermission: state });
      set({ permission: state });
      if (state === "granted" || state === "limited") await sync(true);
    }
    await loadList(true);
    return true;
  }, [loadList, nativeAvailable, set, sync, userId, view.settings]);

  /** 「이 기기 연락처도 추가할까요?」 답 */
  const answerNewDevice = useCallback(
    async (add: boolean) => {
      if (!userId) return;
      patchContactsLocalState(userId, { newDeviceAsked: true });
      set({ otherDeviceOnly: false });
      if (!add) return;
      const state = await requestContactsPermission();
      patchContactsLocalState(userId, { lastPermission: state });
      set({ permission: state });
      if (state === "granted" || state === "limited") await sync(true);
    },
    [set, sync, userId]
  );

  /** OS 권한 철회 안내 답 (#19) — 지우기 = 이 기기 출처 삭제, 유지 = 업로드 중단만 */
  const answerRevoke = useCallback(
    async (choice: "delete" | "keep") => {
      if (!userId) return false;
      const local = readContactsLocalState(userId);
      if (local.sourceId) {
        const r = await contactsApi.patchSource(local.sourceId, { installId: ensureClientInstanceId(), revokeChoice: choice });
        if (!r.ok) return false;
      }
      if (choice === "delete") clearContactsDeviceData(userId);
      patchContactsLocalState(userId, { revokePending: false });
      set({ revokePending: false });
      await loadList(true);
      return true;
    },
    [loadList, set, userId]
  );

  const requestPermissionAgain = useCallback(async () => {
    const state = await requestContactsPermission();
    if (userId) patchContactsLocalState(userId, { lastPermission: state });
    set({ permission: state });
    if (state === "granted" || state === "limited") await sync(true);
  }, [set, sync, userId]);

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
    reloadList: () => loadList(true),
    consentAndStart,
    answerNewDevice,
    answerRevoke,
    requestPermissionAgain,
    refreshPermission,
    removeMemberLocally,
    markRequested,
  };
}
