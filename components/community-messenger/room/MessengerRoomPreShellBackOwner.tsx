"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import {
  resolveMessengerRoomBackTargetNow,
  runMessengerRoomBackTarget,
} from "@/lib/community-messenger/room/messenger-room-back-target";
import { hasPageBackOwner, setPageBackOwner } from "@/lib/ui/overlay-back-stack";

/** 메신저 방 경로(`/community-messenger/rooms/…`)만 — 통화 경로(`/community-messenger/calls/…`)는 대상 아님. */
export function isMessengerRoomPreShellBackPath(pathname: string): boolean {
  return pathname.trim().startsWith("/community-messenger/rooms/");
}

type Props = {
  /** 「차단」 화면(세션 확인 전 — 방 셸 없음)을 그리는 동안만 참 — 이때만 등록한다 */
  active: boolean;
};

/**
 * FAIL-2 (docs/audit/messenger-chat-fail2-fail3-call-impact-analysis-2026-11-18.md §2) — 앱이 꺼진 상태에서 알림으로
 * 방 주소가 열린 뒤 `AuthSessionBoundary` 가 세션 확인 전 「불러오는 중…」 을 그리는 동안(방 셸 없음) Android ◁ 의 주인.
 * 목적지는 방 셸과 같은 함수(`resolveMessengerRoomBackTargetNow` → `runMessengerRoomBackTarget`) — 방 정보 전이므로
 * roomType 없음: `cm_return` → `cm_list` → 대화 목록. 앱 안 진입(in_app = history back)이면 셸처럼 등록하지 않는다.
 *
 * 등록은 「차단」 화면 동안(active)만 하고, 조건이 바뀔 때만 한다(셸 `pageBackOwnerReleaseRef` 와 같은 규칙).
 * 해제 시점은 「차단 해제」가 아니다 — 차단이 풀려도 방 셸이 아직 없을 수 있다(방 세그먼트 `loading.tsx` Suspense 등).
 *  - 방 셸이 등록하면 칸을 덮어쓴다(마지막 등록이 이김) → 이 등록은 더 이상 주인이 아니고, 이후 해제는 자기 등록이 아니라 무동작.
 *  - 셸이 아직 없으면 이 요소가 계속 주인 → ◁ = 목록(결함 E 의 HOME 으로 새지 않음).
 *  - 방 경로를 떠나거나(부모가 이 요소를 그리지 않음) 언마운트되면 자기 등록만 해제.
 *  - 진입 출처가 바뀌어 목적지가 history back 이 되면(차단 중) 해제.
 * 따라서 차단 해제 → 셸 등록 사이에 칸 공백·네이티브 리스너 재설치가 없다(#454 감사의 재설치 공백).
 * 타이머·재시도·대체 이동·전역 이동 상태 없음.
 */
export function MessengerRoomPreShellBackOwner({ active }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useMessengerRoomUrlSearchParams();
  const committedNavRef = useRef(false);
  /** 주소가 바뀌면(같은 요소에서 다른 방 등) 이동 1회 표시를 다시 연다 */
  useEffect(() => {
    committedNavRef.current = false;
  }, [pathname]);

  const resolveBackTarget = useCallback(
    () => resolveMessengerRoomBackTargetNow({ roomType: null, listKind: null, searchParams, ownerOrderChatsHref: null }),
    [searchParams]
  );

  /** 주인 함수 — 누른 순간 목적지를 계산해 이동 1회 */
  const runBackRef = useRef<() => void>(() => {});
  useEffect(() => {
    runBackRef.current = () => {
      if (committedNavRef.current) return;
      committedNavRef.current = true;
      runMessengerRoomBackTarget(router, resolveBackTarget());
    };
  }, [router, resolveBackTarget]);

  const pageBackOwnerReleaseRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    /** 차단이 풀렸다고 해제하지 않는다 — 셸이 칸을 가져가면 이 등록은 자연히 무효, 셸 전 구간은 계속 주인 */
    if (!active) return;
    const target = resolveBackTarget();
    const held = pageBackOwnerReleaseRef.current;
    if (target.kind !== "replace") {
      if (held) {
        pageBackOwnerReleaseRef.current = null;
        held();
      }
      return;
    }
    if (held && hasPageBackOwner()) return;
    pageBackOwnerReleaseRef.current = null;
    console.info("[cm-room-back] pre_shell_page_back_owner", { href: target.href });
    pageBackOwnerReleaseRef.current = setPageBackOwner(() => runBackRef.current());
    /** pathname: 같은 요소에서 주소가 바뀌면 진입 출처·목적지를 다시 판정 */
  }, [active, pathname, resolveBackTarget]);
  useEffect(
    () => () => {
      const held = pageBackOwnerReleaseRef.current;
      pageBackOwnerReleaseRef.current = null;
      held?.();
    },
    []
  );

  return null;
}
