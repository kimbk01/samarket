"use client";

import { useCallback, useRef, useState } from "react";
import {
  emptyHomeRotation,
  pushShownLog,
  readHomeSessionPick,
  readHomeShownHistory,
  saveHomePick,
  type HomeRotationState,
} from "@/lib/home/home-rotation";

/**
 * 홈 교체 제어 (시안 v22) — 칸마다 같은 기준을 쓰도록 한 곳에서 준다.
 * - mode "session": 이번 세션에 고른 것을 그대로 (탭 갔다 오기·뒤로 가기·화면 다시 그림)
 * - mode "rotate" : 새 세션(재접속) 또는 당겨서 새로고침 → `history`(지난번에 보인 것) 기준으로 새로 고름
 * `seq` 가 바뀌면 각 칸이 다시 고른다.
 */
export type HomeRotationCtl = {
  mode: "session" | "rotate";
  seq: number;
  session: HomeRotationState;
  history: HomeRotationState;
  commit: (partial: Partial<Pick<HomeRotationState, "bannerId" | "stores" | "menus" | "trades">>) => void;
};

export function useHomeRotation(): { ctl: HomeRotationCtl | null; init: () => void; rotateNow: () => void } {
  const currentRef = useRef<HomeRotationState>(emptyHomeRotation());
  const [state, setState] = useState<Omit<HomeRotationCtl, "commit"> | null>(null);

  /** 지금 보이는 것을 기록 — 보인 기록(log)에도 앞에 넣는다(다음 교체에서 「오래전에 나온 것」 판단) */
  const commit = useCallback((partial: Partial<Pick<HomeRotationState, "bannerId" | "stores" | "menus" | "trades">>) => {
    const cur = currentRef.current;
    const log = { ...cur.log, menus: { ...cur.log.menus } };
    if (partial.stores) log.stores = pushShownLog(log.stores, partial.stores);
    if (partial.trades) log.trades = pushShownLog(log.trades, partial.trades);
    if (partial.menus) {
      for (const [storeId, menuIds] of Object.entries(partial.menus)) {
        log.menus[storeId] = pushShownLog(log.menus[storeId] ?? [], menuIds);
      }
    }
    currentRef.current = {
      ...cur,
      ...partial,
      menus: partial.menus ? { ...cur.menus, ...partial.menus } : cur.menus,
      log,
    };
    saveHomePick(currentRef.current);
  }, []);

  /** 첫 화면(마운트 후) — 저장소는 브라우저에서만 읽는다 */
  const init = useCallback(() => {
    const session = readHomeSessionPick();
    if (session) {
      currentRef.current = session;
      setState({ mode: "session", seq: 0, session, history: readHomeShownHistory() });
      return;
    }
    const history = readHomeShownHistory();
    currentRef.current = { ...history };
    setState({ mode: "rotate", seq: 0, session: emptyHomeRotation(), history });
  }, []);

  /** 당겨서 새로고침 — 지금 보이는 것을 「지난번」으로 두고 새로 고른다 */
  const rotateNow = useCallback(() => {
    const shown = { ...currentRef.current, menus: { ...currentRef.current.menus }, log: { ...currentRef.current.log } };
    setState((s) => ({
      mode: "rotate",
      seq: (s?.seq ?? 0) + 1,
      session: emptyHomeRotation(),
      history: shown,
    }));
  }, []);

  return { ctl: state ? { ...state, commit } : null, init, rotateNow };
}
