"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 모임 멤버에게 「대화하기」 — 메신저 1:1 시작(연락처 시트와 같은 `direct/start` API) 후 그 방으로 간다.
 * 운영 화면(멤버 관리)과 멤버 탭 시트가 같은 동작을 쓴다 (R3 U-04 ① · 시안 U7 「✉ 대화하기」).
 * 가입 미완료(`signup_incomplete`)는 전역 창이 안내하므로 오류 문구를 겹쳐 띄우지 않는다.
 *
 * - `onError`: 실패 문구(`moim_manage_action_message_failed`)를 화면 토스트로 띄울 함수
 * - `onOpened`: 방으로 가기 직전(시트 닫기 등)
 */
export function useMoimDirectMessage(options?: {
  onError?: (message: string) => void;
  onOpened?: () => void;
}): { openMessage: (userId: string) => Promise<void>; messaging: boolean } {
  const { t } = useI18n();
  const router = useRouter();
  const [messaging, setMessaging] = useState(false);
  const busy = useRef(false);
  const opts = useRef(options);
  opts.current = options;

  const openMessage = useCallback(
    async (userId: string) => {
      if (busy.current || !userId) return;
      busy.current = true;
      setMessaging(true);
      try {
        const res = await fetch("/api/community-messenger/direct/start", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: userId }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; code?: string };
        if (!res.ok || !j.ok || !j.roomId) {
          if (j.code !== "signup_incomplete") opts.current?.onError?.(t("moim_manage_action_message_failed"));
          return;
        }
        opts.current?.onOpened?.();
        router.push(`/community-messenger/rooms/${encodeURIComponent(j.roomId)}`);
      } catch {
        opts.current?.onError?.(t("moim_manage_action_message_failed"));
      } finally {
        busy.current = false;
        setMessaging(false);
      }
    },
    [router, t]
  );

  return { openMessage, messaging };
}
