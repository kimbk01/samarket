"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COMMUNITY_WRITE_EDITOR_OPT_IN_KEY,
  type CommunityWriteEditorRollout,
} from "@/lib/philife/write-editor/write-editor-flag";

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
 * 새 편집기 사용 여부. 판정 전·실패 시에는 항상 기존 편집기(`resolved:false` → textarea).
 */
export function useCommunityWriteEditorMode(): {
  resolved: boolean;
  useWysiwyg: boolean;
  canOptIn: boolean;
  setOptIn: (on: boolean) => void;
} {
  const [state, setState] = useState<{ resolved: boolean; rollout: CommunityWriteEditorRollout; canOptIn: boolean }>({
    resolved: false,
    rollout: "off",
    canOptIn: false,
  });
  const [optedIn, setOptedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOptedIn(readOptIn());
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
  }, []);

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
