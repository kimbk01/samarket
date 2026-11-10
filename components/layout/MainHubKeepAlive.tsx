"use client";

/**
 * 하단 탭 허브 유지 — 설계 `docs/audit/app-tab-navigation-root-cause-design-2026-11-10.md` §2-1 (Owner 「1번부터 진행」 2026-11-10).
 *
 * - `MainHubKeepAliveProvider` : (main) 셸에 1개. 허브 화면들을 셸 고정 위치에서 포털로 렌더한다.
 *   (이동 연출이 화면 트리를 바꿔도 허브는 다시 만들어지지 않는다.)
 * - `MainHubKeepAliveSlot` : 허브 페이지(`page.tsx`)가 자기 화면을 이 자리로 넘긴다. 자리에는 빈 칸만 그리고,
 *   보관 상자를 그 칸에 끼워 화면을 보여 준다. 셸 밖(제공자 없음)에서는 children 을 그대로 그린다.
 * - 숨김 허브: React `<Activity mode="hidden">` — 상태·화면은 그대로, 효과(구독·타이머·요청)는 정리, 다시 보이면 효과 재실행.
 * - 로그인 계정이 바뀌면 보관 허브 폐기(다른 계정 화면 노출 금지).
 * - 대상: 홈·커뮤니티·거래·배달·내정보. **채팅 허브는 제외** — 실시간 구독·읽음 흐름 영향은 채팅 P0 계획(설계 승인 후)에서 다룬다
 *   (Owner 2026-11-10 「채팅 P0 는 C~G 에 자동으로 끼워 넣지 않는다」).
 */

import {
  Activity,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import {
  createMainHubKeepAliveRegistry,
  shouldClearKeptHubsOnAccountChange,
  type MainHubKeepAliveRegistry,
  type MainHubKeepAliveSnapshot,
} from "@/lib/layout/main-hub-keep-alive-registry";
import type { MainTabKeepAliveHubId } from "@/lib/layout/resolve-main-surface";

const MainHubKeepAliveContext = createContext<MainHubKeepAliveRegistry | null>(null);

const EMPTY_SNAPSHOT: MainHubKeepAliveSnapshot = { version: 0, entries: [] };

function MainHubKeepAlivePortals({ registry }: { registry: MainHubKeepAliveRegistry }) {
  const snap = useSyncExternalStore(registry.subscribe, registry.getSnapshot, () => EMPTY_SNAPSHOT);
  const membership = useClientMembershipState("main-hub-keep-alive");
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (membership.status === "checking") return;
    const userId = membership.status === "member" ? membership.profile.id.trim() || null : null;
    if (shouldClearKeptHubsOnAccountChange(lastUserIdRef.current, userId)) {
      registry.clearDetached();
    }
    lastUserIdRef.current = userId;
  }, [membership, registry]);

  return (
    <>
      {snap.entries.map((entry) =>
        entry.element == null
          ? null
          : createPortal(
              <Activity mode={entry.attached ? "visible" : "hidden"}>{entry.element}</Activity>,
              registry.containerFor(entry.hubId),
              entry.hubId
            )
      )}
    </>
  );
}

export function MainHubKeepAliveProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => createMainHubKeepAliveRegistry());
  // 서버·hydration 첫 렌더는 빈 스냅샷(포털 0) — 자리(slot)가 브라우저에서 등록하면 같은 커밋 안에 동기 재렌더.
  return (
    <MainHubKeepAliveContext.Provider value={registry}>
      {children}
      <MainHubKeepAlivePortals registry={registry} />
    </MainHubKeepAliveContext.Provider>
  );
}

export function MainHubKeepAliveSlot({
  hubId,
  children,
}: {
  hubId: Exclude<MainTabKeepAliveHubId, "chat">;
  children: ReactNode;
}) {
  const registry = useContext(MainHubKeepAliveContext);
  const slotRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!registry) return;
    registry.upsert(hubId, children);
  }, [registry, hubId, children]);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!registry || !slot) return;
    registry.attach(hubId, slot);
    return () => registry.detach(hubId, slot);
  }, [registry, hubId]);

  if (!registry) return <>{children}</>;
  return <div ref={slotRef} data-main-hub-keep-alive-slot={hubId} style={{ display: "contents" }} />;
}
