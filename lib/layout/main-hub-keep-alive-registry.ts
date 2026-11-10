/**
 * 하단 탭 허브 유지(keep-alive) 저장소 — 설계 `docs/audit/app-tab-navigation-root-cause-design-2026-11-10.md` §2-1.
 *
 * 원인(2026-11-10 실측): 탭을 누르면 Next 가 이전 허브 화면을 지우고 새 허브를 처음부터 만들어 데이터를 다시 받았다
 * (채팅 재방문도 API 5~9건·사진 재요청, 배달 재방문 흰 프레임). 이 저장소는 허브별 화면(React 요소)과 그 화면을 담는
 * DOM 상자를 문서 수명 동안 보관한다.
 *
 * - 허브 페이지의 자리(`MainHubKeepAliveSlot`)가 마운트되면 요소를 올리고(upsert) 상자를 자기 안에 끼운다(attach).
 * - 자리가 사라지면(다른 경로로 이동) 상자를 문서에서 떼어 낸다(detach) — 보관 중인 허브 DOM 은 **문서 밖**이라
 *   `document.querySelector` 등 다른 화면 코드에 잡히지 않는다.
 * - 같은 허브 자리가 동시에 둘(이동 연출의 나가는 패널 + 현재 화면)이면 마지막에 붙은 자리가 상자를 가진다.
 * - 보이기 판정 = 상자가 어떤 자리에 붙어 있음(attached). 숨김 허브는 React `<Activity mode="hidden">` 로 상태는 두고 효과는 정리한다.
 * - 로그인 계정이 바뀌면 붙어 있지 않은 허브를 모두 버린다(`clearDetached`) — 다른 계정 화면 보관 금지.
 */
import type { ReactNode } from "react";

export type MainHubKeepAliveEntry = {
  readonly hubId: string;
  readonly element: ReactNode;
  readonly attached: boolean;
};

export type MainHubKeepAliveSnapshot = {
  readonly version: number;
  readonly entries: readonly MainHubKeepAliveEntry[];
};

export type MainHubKeepAliveRegistry = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): MainHubKeepAliveSnapshot;
  /** 허브 화면 요소 등록·갱신 (같은 참조면 무시). */
  upsert(hubId: string, element: ReactNode): void;
  /** 자리(slot) 요소에 상자를 끼운다 — 가장 최근 자리가 소유. */
  attach(hubId: string, slot: HTMLElement): void;
  /** 자리가 사라질 때 — 소유 자리면 남은 다른 자리로 넘기거나 문서에서 떼어 낸다. */
  detach(hubId: string, slot: HTMLElement): void;
  /** 붙어 있지 않은(보관 중인) 허브 전부 폐기. */
  clearDetached(): void;
  /** 허브 화면이 렌더되는 상자 (브라우저에서만). */
  containerFor(hubId: string): HTMLElement;
};

type HubRecord = {
  element: ReactNode;
  container: HTMLElement | null;
  /** 마운트 순서대로 — 마지막이 소유자 */
  slots: HTMLElement[];
};

export const MAIN_HUB_KEEP_ALIVE_CONTAINER_ATTR = "data-main-hub-keep-alive-container";

export function createMainHubKeepAliveRegistry(
  createContainer: (hubId: string) => HTMLElement = defaultCreateContainer
): MainHubKeepAliveRegistry {
  /** 등록 순서 유지 — 렌더 순서 고정(React key 순서 변화로 인한 재배치 방지) */
  const records = new Map<string, HubRecord>();
  const listeners = new Set<() => void>();
  let snapshot: MainHubKeepAliveSnapshot = { version: 0, entries: [] };

  const emit = () => {
    const entries: MainHubKeepAliveEntry[] = [];
    for (const [hubId, rec] of records) {
      entries.push({ hubId, element: rec.element, attached: rec.slots.length > 0 });
    }
    snapshot = { version: snapshot.version + 1, entries };
    for (const l of listeners) l();
  };

  const ensureContainer = (hubId: string, rec: HubRecord): HTMLElement => {
    if (!rec.container) rec.container = createContainer(hubId);
    return rec.container;
  };

  const mountInto = (rec: HubRecord, hubId: string, slot: HTMLElement) => {
    const container = ensureContainer(hubId, rec);
    if (container.parentNode !== slot) slot.appendChild(container);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    upsert(hubId, element) {
      const rec = records.get(hubId);
      if (rec) {
        if (rec.element === element) return;
        rec.element = element;
      } else {
        records.set(hubId, { element, container: null, slots: [] });
      }
      emit();
    },
    attach(hubId, slot) {
      let rec = records.get(hubId);
      if (!rec) {
        rec = { element: null, container: null, slots: [] };
        records.set(hubId, rec);
      }
      const wasAttached = rec.slots.length > 0;
      rec.slots = rec.slots.filter((s) => s !== slot);
      rec.slots.push(slot);
      mountInto(rec, hubId, slot);
      if (!wasAttached) emit();
    },
    detach(hubId, slot) {
      const rec = records.get(hubId);
      if (!rec) return;
      const before = rec.slots.length;
      rec.slots = rec.slots.filter((s) => s !== slot);
      if (rec.slots.length === before) return;
      const owner = rec.slots[rec.slots.length - 1];
      if (owner) {
        mountInto(rec, hubId, owner);
        return;
      }
      if (rec.container?.parentNode) rec.container.parentNode.removeChild(rec.container);
      emit();
    },
    clearDetached() {
      let changed = false;
      for (const [hubId, rec] of records) {
        if (rec.slots.length > 0) continue;
        records.delete(hubId);
        changed = true;
      }
      if (changed) emit();
    },
    containerFor(hubId) {
      let rec = records.get(hubId);
      if (!rec) {
        rec = { element: null, container: null, slots: [] };
        records.set(hubId, rec);
      }
      return ensureContainer(hubId, rec);
    },
  };
}

function defaultCreateContainer(hubId: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute(MAIN_HUB_KEEP_ALIVE_CONTAINER_ATTR, hubId);
  // 레이아웃에 끼지 않는 상자 — 허브 루트가 그대로 열(column)의 자식처럼 배치된다.
  el.style.display = "contents";
  return el;
}

/** 로그인 계정 변경 판정 — 이전 회원 id 가 있었고 지금과 다르면(다른 회원·비회원) 보관 허브 폐기. */
export function shouldClearKeptHubsOnAccountChange(prevUserId: string | null, nextUserId: string | null): boolean {
  return prevUserId != null && prevUserId !== nextUserId;
}
