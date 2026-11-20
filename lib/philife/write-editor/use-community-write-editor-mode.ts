"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COMMUNITY_WRITE_EDITOR_OPT_IN_KEY,
  type CommunityWriteEditorRollout,
} from "@/lib/philife/write-editor/write-editor-flag";
import { useServerCommunityWriteEditorRollout } from "@/lib/philife/write-editor/write-editor-rollout-context";

type ModeResponse = { ok?: boolean; rollout?: CommunityWriteEditorRollout; canOptIn?: boolean };

let cached: Promise<ModeResponse> | null = null;

function loadMode(): Promise<ModeResponse> {
  if (!cached) {
    cached = fetch("/api/philife/write-editor-mode", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ModeResponse>) : { ok: false }))
      .catch(() => ({ ok: false }));
    // 계정 전환 대비 — 짧게만 재사용
    void cached.finally(() => {
      setTimeout(() => {
        cached = null;
      }, 30_000);
    });
  }
  return cached;
}

function readOptIn(): boolean {
  try {
    return window.localStorage.getItem(COMMUNITY_WRITE_EDITOR_OPT_IN_KEY) === "wysiwyg";
  } catch {
    return false;
  }
}

/**
 * 새 편집기 사용 여부.
 * - 서버가 넘긴 판정(`on`·`off`)이 있으면 요청 없이 바로 확정한다(`resolved:true`).
 * - `admin`(관리자 직접 켜기) 또는 넘긴 값이 없을 때만 `/api/philife/write-editor-mode` 로 관리자 여부를 묻는다.
 *   그동안 화면은 본문 자리를 비워 둔다(예전 입력칸을 먼저 보여 주지 않음 — 감사 §11 R2).
 */
export function useCommunityWriteEditorMode(): {
  resolved: boolean;
  useWysiwyg: boolean;
  canOptIn: boolean;
  setOptIn: (on: boolean) => void;
} {
  const serverRollout = useServerCommunityWriteEditorRollout();
  /** 서버가 넘긴 확정 판정 — `admin`·없음이면 null(요청으로 관리자 여부 확인) */
  const knownRollout: CommunityWriteEditorRollout | null =
    serverRollout === "on" || serverRollout === "off" ? serverRollout : null;
  const known = knownRollout !== null;
  const [state, setState] = useState<{ resolved: boolean; rollout: CommunityWriteEditorRollout; canOptIn: boolean }>(() =>
    knownRollout ? { resolved: true, rollout: knownRollout, canOptIn: false } : { resolved: false, rollout: "off", canOptIn: false }
  );
  const [optedIn, setOptedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOptedIn(readOptIn());
    if (known) return;
    void loadMode().then((j) => {
      if (cancelled) return;
      setState({
        resolved: true,
        rollout: j.ok && j.rollout ? j.rollout : "off",
        canOptIn: Boolean(j.ok && j.canOptIn),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [known]);

  const setOptIn = useCallback((on: boolean) => {
    try {
      if (on) window.localStorage.setItem(COMMUNITY_WRITE_EDITOR_OPT_IN_KEY, "wysiwyg");
      else window.localStorage.removeItem(COMMUNITY_WRITE_EDITOR_OPT_IN_KEY);
    } catch {
      /* private mode — 세션 동안만 */
    }
    setOptedIn(on);
  }, []);

  const useWysiwyg = state.resolved && (state.rollout === "on" || (state.canOptIn && optedIn));
  return { resolved: state.resolved, useWysiwyg, canOptIn: state.canOptIn, setOptIn };
}
