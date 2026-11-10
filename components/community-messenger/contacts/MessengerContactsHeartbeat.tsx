"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import {
  CONTACTS_CHANGED_EVENT,
  CONTACTS_REVOKE_PENDING_EVENT,
  purgeOtherUsersContactsLocalState,
  readContactsConsentedFlag,
  readContactsLocalState,
  readContactsRevokePendingFlag,
} from "@/lib/community-messenger/contacts/contacts-local-store";

/** 철회 안내 대화상자는 필요할 때만 불러온다 (앱 시작 번들에 넣지 않음) */
const MessengerContactsRevokeDialog = lazy(() =>
  import("@/components/community-messenger/contacts/MessengerContactsRevokeDialog").then((m) => ({ default: m.MessengerContactsRevokeDialog }))
);

/**
 * 연락처 앱 시작 처리 (SSOT v5 S7 「앱 시작: 기기 안 비교 → 바뀐 것만 업로드 + 하루 1회 출처 사용 갱신」 · #19 · §8).
 * - 메인 레이아웃에 1개 — 어느 화면으로 앱을 열어도 같은 처리 (메신저를 열지 않아도).
 * - 다른 회원이 이 기기에 로그인 → 이전 회원의 기기 안 연락처 삭제 (동의·앱 여부와 무관).
 * - 이 기기에서 동의한 회원만: 첫 화면이 다 그려진 뒤(8초 후·유휴 시간) 엔진을 따로 불러온다(번들 분리). bootstrap·Realtime 과 무관.
 * - OS 권한 철회 안내(#19)는 여기 1곳에서만 띄운다 — 답하기 전까지 다음 실행 때마다 다시 안내.
 */
export function MessengerContactsHeartbeat() {
  const [userId, setUserId] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<{ count: number } | null>(null);

  const readRevoke = useCallback((uid: string) => {
    if (!readContactsRevokePendingFlag(uid)) {
      setRevoke(null);
      return;
    }
    setRevoke({ count: readContactsLocalState(uid).revokeCount });
  }, []);

  useEffect(() => {
    const uid = getBoundAuthUserId();
    if (!uid) return;
    setUserId(uid);
    // 다른 회원이 이 기기에 로그인 → 이전 회원의 기기 안 연락처(번호·이름) 삭제 (§8 로그아웃 행 — 동의·앱 여부와 무관)
    purgeOtherUsersContactsLocalState(uid);
    readRevoke(uid);
    const onRevoke = () => readRevoke(uid);
    window.addEventListener(CONTACTS_REVOKE_PENDING_EVENT, onRevoke);
    window.addEventListener(CONTACTS_CHANGED_EVENT, onRevoke);
    let cancelled = false;
    let timer: number | null = null;
    if (readContactsConsentedFlag(uid)) {
      const run = () => {
        if (cancelled) return;
        void import("@/lib/community-messenger/contacts/contacts-sync-engine").then((m) => {
          if (!cancelled) void m.runContactsSync(uid);
        });
      };
      timer = window.setTimeout(() => {
        const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
        if (ric) ric(run);
        else run();
      }, 8000);
    }
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener(CONTACTS_REVOKE_PENDING_EVENT, onRevoke);
      window.removeEventListener(CONTACTS_CHANGED_EVENT, onRevoke);
    };
  }, [readRevoke]);

  const answer = useCallback(
    async (choice: "delete" | "keep") => {
      if (!userId) return false;
      const { answerContactsRevoke } = await import("@/lib/community-messenger/contacts/contacts-revoke");
      const ok = await answerContactsRevoke(userId, choice);
      if (ok) setRevoke(null);
      return ok;
    },
    [userId]
  );

  if (!revoke) return null;
  return (
    <Suspense fallback={null}>
      <MessengerContactsRevokeDialog open count={revoke.count} onAnswer={answer} />
    </Suspense>
  );
}
