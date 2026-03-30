"use client";

import { saveChatImageToDevice } from "@/lib/chats/save-chat-image";

/** 묶음 사진 순차 저장(공유 시트가 연속으로 뜰 수 있음 — 사용자 OS 동작 따름) */
export async function saveChatImagesBundle(
  urls: string[]
): Promise<{ okCount: number; failCount: number }> {
  let okCount = 0;
  let failCount = 0;
  for (let i = 0; i < urls.length; i++) {
    const r = await saveChatImageToDevice(urls[i], `samarket-chat-${i + 1}`);
    if (r.ok) okCount++;
    else failCount++;
    if (i < urls.length - 1) await new Promise((res) => setTimeout(res, 120));
  }
  return { okCount, failCount };
}
