"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";

export type StartBizChatResult = { ok: true; roomId: string } | { ok: false; error: string };

export async function startBusinessInquiry(params: {
  operatorUserId: string;
  businessId?: string | null;
  businessKey?: string | null;
}): Promise<StartBizChatResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };
  const operatorUserId = params.operatorUserId?.trim();
  if (!operatorUserId) return { ok: false, error: "운영자 정보가 없습니다." };
  const businessId = params.businessId?.trim();
  const businessKey = params.businessKey?.trim();
  if (!businessId && !businessKey) {
    return { ok: false, error: "상점 식별 정보가 없습니다." };
  }
  try {
    const body: Record<string, string> = { operatorUserId };
    if (businessId) body.businessId = businessId;
    if (businessKey) body.businessKey = businessKey;
    const res = await fetch("/api/chat/business/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
    if (data.ok && data.roomId) return { ok: true, roomId: data.roomId };
    return { ok: false, error: data.error ?? "채팅방을 열 수 없습니다." };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "채팅방을 열 수 없습니다." };
  }
}
