"use client";

import { useLayoutEffect, useState } from "react";
import { readLastRunSnapshotForCurrentAccount, type LastRunSnapshot } from "@/lib/startup/last-run-snapshot";

/**
 * 지난 실행 값 사진 (F3-a) — 서버 HTML·hydration 첫 렌더는 항상 null(그림 동일), 첫 클라이언트 커밋의 layout effect 에서
 * 지금 로그인 쿠키 계정의 사진을 읽어 다시 그린다. layout effect 안의 상태 변경은 그리기 전에 반영되므로
 * 시작 화면이 hydration 뒤에 걷히는 실행(Android 앱 안 덮개 · F2′)에서는 앱이 보여 주는 첫 그림에 이미 들어 있다.
 * P3 실행(덮개 없는 설치 앱)은 서버 본문 첫 그림 → 이 값이 든 그림으로 1번 바뀐다(이 사진이 없으면 진짜 값이 올 때 바뀜).
 */
export function useLastRunSnapshot(): LastRunSnapshot | null {
  const [snap, setSnap] = useState<LastRunSnapshot | null>(null);
  useLayoutEffect(() => {
    setSnap(readLastRunSnapshotForCurrentAccount());
  }, []);
  return snap;
}
