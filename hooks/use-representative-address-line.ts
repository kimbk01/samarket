"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  resolveAddressBookPresentationFromSnapshot,
  resolveExplorationAddressLineFromSnapshot,
  resolveRepresentativeFullAddressLineFromSnapshot,
} from "@/lib/addresses/address-defaults-snapshot-resolvers";
import type { AddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import {
  fetchAddressDefaultsSnapshot,
  peekFreshAddressDefaultsSnapshot,
  seedAddressDefaultsSnapshotCache,
  type AddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
import { useAddressDefaultsBootRetry } from "@/lib/addresses/use-address-defaults-boot-retry";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";

export type RepresentativeAddressLineState =
  | { status: "loading" }
  | { status: "ready"; line: string | null };

export type RepresentativeAddressPresentationState =
  | { status: "loading" }
  | { status: "ready"; presentation: AddressBookCardPresentation | null };

type RepresentativeAddressLineReady = Extract<RepresentativeAddressLineState, { status: "ready" }>;

function canLoadRepresentativeAddress(): boolean {
  return Boolean(getCurrentUser()?.id);
}

function lineStateFromExplorationSnapshot(snapshot: AddressDefaultsSnapshot | null): RepresentativeAddressLineReady {
  return { status: "ready", line: resolveExplorationAddressLineFromSnapshot(snapshot) };
}

function lineStateFromFullSnapshot(snapshot: AddressDefaultsSnapshot | null): RepresentativeAddressLineReady {
  return { status: "ready", line: resolveRepresentativeFullAddressLineFromSnapshot(snapshot) };
}

/** 대표(master) 주소 — PH 카드 규칙(상세·gate 먼저) */
export function useRepresentativeAddressPresentation(opts?: {
  /** RSC·세션 캐시 — 첫 페인트에「확인 중」없이 표시 */
  initialSnapshot?: AddressDefaultsSnapshot | null;
}): RepresentativeAddressPresentationState {
  const pathname = usePathname();
  const hasPresentationRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const [state, setState] = useState<RepresentativeAddressPresentationState>(() => {
    if (!canLoadRepresentativeAddress()) return { status: "ready", presentation: null };
    const snap = opts?.initialSnapshot ?? peekFreshAddressDefaultsSnapshot();
    if (!snap) return { status: "loading" };
    const presentation = resolveAddressBookPresentationFromSnapshot(snap);
    if (presentation) hasPresentationRef.current = true;
    return { status: "ready", presentation };
  });

  useEffect(() => {
    if (!opts?.initialSnapshot) return;
    seedAddressDefaultsSnapshotCache(opts.initialSnapshot);
  }, [opts?.initialSnapshot]);

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const requestGeneration = ++requestGenerationRef.current;
    if (!canLoadRepresentativeAddress()) {
      hasPresentationRef.current = false;
      setState({ status: "ready", presentation: null });
      return;
    }
    const silent = opts?.silent === true;
    if (!silent) setState({ status: "loading" });
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({
        force: opts?.force === true,
        caller: "representative_address_presentation",
        reason: opts?.force === true ? "force_addresses_updated" : "pathname_silent_refresh",
      });
      if (requestGeneration !== requestGenerationRef.current) return;
      if (snapshot == null) {
        if (!silent) setState({ status: "ready", presentation: null });
        return;
      }
      const presentation = resolveAddressBookPresentationFromSnapshot(snapshot);
      if (presentation) hasPresentationRef.current = true;
      setState({ status: "ready", presentation });
    } catch {
      if (requestGeneration !== requestGenerationRef.current) return;
      if (!silent) setState({ status: "ready", presentation: null });
    }
  }, []);

  useEffect(() => {
    if (opts?.initialSnapshot && peekFreshAddressDefaultsSnapshot()) return;
    void load({ silent: true });
  }, [pathname, load, opts?.initialSnapshot]);

  useEffect(() => {
    const onPop = () => void load({ silent: true });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  useEffect(() => {
    const onAddressesUpdated = () => void load({ silent: true, force: true });
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [load]);

  useAddressDefaultsBootRetry(
    () => void load({ silent: true, force: true }),
    () => !hasPresentationRef.current
  );

  useEffect(() => {
    const onAuthChanged = () => {
      if (getCurrentUser()?.id) {
        void load({ silent: false, force: true });
        return;
      }
      hasPresentationRef.current = false;
      setState({ status: "ready", presentation: null });
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
  }, [load]);

  return state;
}

/**
 * 대표(master) 주소 — 헤더 칩용 SHORT 한 줄(상호/건물명, 없으면 Subdivision/Village, 없으면 주소 headline).
 * 경로 변경 시 **이전 줄을 유지한 채** 백그라운드 갱신(TTL 캐시·`silent` fetch) — 탭 전환마다「불러오는 중」깜빡임 방지.
 */
export function useRepresentativeAddressLine(): RepresentativeAddressLineState {
  const pathname = usePathname();
  const lastLineRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const [state, setState] = useState<RepresentativeAddressLineState>(() => {
    if (!canLoadRepresentativeAddress()) return { status: "ready", line: null };
    const snap = peekFreshAddressDefaultsSnapshot();
    if (!snap) return { status: "loading" };
    const next = lineStateFromExplorationSnapshot(snap);
    if (next.line?.trim()) lastLineRef.current = next.line.trim();
    return next;
  });

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const requestGeneration = ++requestGenerationRef.current;
    if (!canLoadRepresentativeAddress()) {
      lastLineRef.current = null;
      setState({ status: "ready", line: null });
      return;
    }
    const silent = opts?.silent === true;
    if (!silent) setState({ status: "loading" });
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({
        force: opts?.force === true,
        caller: "representative_address_line",
        reason: opts?.force === true ? "force_addresses_updated" : "pathname_silent_refresh",
      });
      if (requestGeneration !== requestGenerationRef.current) return;
      if (snapshot == null) {
        if (!silent) setState({ status: "ready", line: null });
        return;
      }
      const next = lineStateFromExplorationSnapshot(snapshot);
      if (next.line?.trim()) lastLineRef.current = next.line.trim();
      setState(next);
    } catch {
      if (requestGeneration !== requestGenerationRef.current) return;
      if (!silent) setState({ status: "ready", line: null });
    }
  }, []);

  useEffect(() => {
    void load({ silent: true });
  }, [pathname, load]);

  useEffect(() => {
    const onPop = () => void load({ silent: true });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  useEffect(() => {
    /** 주소 관리 저장 직후 — 로딩 `…` 없이 갱신(깜빡임 방지) */
    const onAddressesUpdated = () => void load({ silent: true, force: true });
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [load]);

  useAddressDefaultsBootRetry(
    () => void load({ silent: true, force: true }),
    () => !lastLineRef.current?.trim()
  );

  useEffect(() => {
    const onAuthChanged = () => {
      if (getCurrentUser()?.id) {
        void load({ silent: false, force: true });
        return;
      }
      lastLineRef.current = null;
      setState({ status: "ready", line: null });
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
  }, [load]);

  return state;
}

/**
 * 대표(master) 주소 — 내정보용 FULL 한 줄(detail/landmark first, then title + road/area).
 */
export function useRepresentativeFullAddressLine(): RepresentativeAddressLineState {
  const pathname = usePathname();
  const lastLineRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const [state, setState] = useState<RepresentativeAddressLineState>(() => {
    if (!canLoadRepresentativeAddress()) return { status: "ready", line: null };
    const snap = peekFreshAddressDefaultsSnapshot();
    if (!snap) return { status: "loading" };
    const next = lineStateFromFullSnapshot(snap);
    if (next.line?.trim()) lastLineRef.current = next.line.trim();
    return next;
  });

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    const requestGeneration = ++requestGenerationRef.current;
    if (!canLoadRepresentativeAddress()) {
      lastLineRef.current = null;
      setState({ status: "ready", line: null });
      return;
    }
    const silent = opts?.silent === true;
    if (!silent) setState({ status: "loading" });
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({
        force: opts?.force === true,
        caller: "representative_full_address_line",
        reason: opts?.force === true ? "force_addresses_updated" : "pathname_silent_refresh",
      });
      if (requestGeneration !== requestGenerationRef.current) return;
      if (snapshot == null) {
        if (!silent) setState({ status: "ready", line: null });
        return;
      }
      const next = lineStateFromFullSnapshot(snapshot);
      if (next.line?.trim()) lastLineRef.current = next.line.trim();
      setState(next);
    } catch {
      if (requestGeneration !== requestGenerationRef.current) return;
      if (!silent) setState({ status: "ready", line: null });
    }
  }, []);

  useEffect(() => {
    void load({ silent: true });
  }, [pathname, load]);

  useEffect(() => {
    const onPop = () => void load({ silent: true });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  useEffect(() => {
    const onAddressesUpdated = () => void load({ silent: true, force: true });
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [load]);

  useAddressDefaultsBootRetry(
    () => void load({ silent: true, force: true }),
    () => !lastLineRef.current?.trim()
  );

  useEffect(() => {
    const onAuthChanged = () => {
      if (getCurrentUser()?.id) {
        void load({ silent: false, force: true });
        return;
      }
      lastLineRef.current = null;
      setState({ status: "ready", line: null });
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuthChanged);
  }, [load]);

  return state;
}
