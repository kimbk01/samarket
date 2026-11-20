"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CommunityWriteEditorRollout } from "@/lib/philife/write-editor/write-editor-flag";

/**
 * 서버 env `COMMUNITY_WYSIWYG_EDITOR` 판정을 `(main)` 레이아웃이 그릴 때 넘긴다 — 글쓰기 화면·시트가 판정 요청 없이 바로 쓴다.
 * 이전에는 클라이언트가 `/api/philife/write-editor-mode` 응답을 기다리는 동안(그리고 실패하면 계속) 예전 입력칸이 보였고,
 * 거기서 붙이면 사진이 `![](주소)` 글자로 보였다 (감사 docs/audit/lounge-paste-images-2026-11-20.md §11 R2).
 * `null` = 넘긴 값 없음(Provider 밖) → 훅이 예전처럼 요청한다.
 */
const CommunityWriteEditorRolloutContext = createContext<CommunityWriteEditorRollout | null>(null);

export function CommunityWriteEditorRolloutProvider({
  rollout,
  children,
}: {
  rollout: CommunityWriteEditorRollout;
  children: ReactNode;
}) {
  return <CommunityWriteEditorRolloutContext.Provider value={rollout}>{children}</CommunityWriteEditorRolloutContext.Provider>;
}

export function useServerCommunityWriteEditorRollout(): CommunityWriteEditorRollout | null {
  return useContext(CommunityWriteEditorRolloutContext);
}
