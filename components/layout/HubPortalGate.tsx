"use client";

import type { ReactNode } from "react";
import { useHubActive } from "@/lib/layout/hub-active-context";

const SHOWN = { display: "contents" } as const;
const HIDDEN = { display: "none" } as const;

/**
 * D1 S2: 하단 탭 허브 안에서 `createPortal` 로 허브 밖(body 등)에 그리는 것은 허브의 `display:none` 이 닿지 않는다.
 * 포털 내용을 이 문으로 감싸 허브가 숨으면 같이 숨긴다 — 상태는 그대로(예전 React Activity 숨김과 같은 결과).
 * 보일 때는 `display: contents` 라 상자가 생기지 않아 배치·고정 위치가 그대로다. 허브 밖 화면에서는 항상 보임.
 */
export function HubPortalGate({ children }: { children: ReactNode }) {
  const hubActive = useHubActive();
  return (
    <div data-hub-portal-gate="" style={hubActive ? SHOWN : HIDDEN}>
      {children}
    </div>
  );
}
