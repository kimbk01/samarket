"use client";

import type { ReactNode } from "react";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";

/**
 * 그룹 제목 + 행 묶음 (최종 설계 §1.2) — IA 권위 부품 `MyInfoMenuSection` 을 그대로 감싸 이름만 통일.
 */
export function MyGroup({ title, children }: { title?: string; children: ReactNode }) {
  return <MyInfoMenuSection title={title}>{children}</MyInfoMenuSection>;
}
