"use client";

import { useState } from "react";
import { HUB_DATA_REVISIT_FRESH_MS, invalidateAllHubData, peekHubDataEpoch } from "@/lib/http/hub-data-epoch";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile/profile-update-events";

/**
 * D1 §4 (Owner 「D1 상세 설계」 2026-11-11, `docs/audit/d1-hub-screen-retention-design-2026-11-11.md`)
 * 허브 화면 보관대(`HubRetentionStack`)에서 숨긴 허브가 다시 보이면 React 가 효과를 다시 실행한다.
 * 규칙 하나: **같은 화면 인스턴스가 같은 조건(키)으로 60초 안에 받은 적 있으면 다시 받지 않는다.**
 *
 * - 인스턴스 단위(ref) — 새로 마운트된 화면은 기록이 없으므로 언제나 받는다(빈 화면 방지).
 * - 조건(키)이 바뀌면(카테고리·지역·언어 등) 받는다.
 * - 앱 복귀(백그라운드 → 앞 화면)·언어 변경·주소 변경·프로필 변경·명시적 무효화(글 쓰기 등)는 세대(epoch)를 올려 모두 다시 받는다.
 * - 계정 전환은 보관대가 비워져 화면이 새로 마운트되므로 여기서 따로 다루지 않는다.
 * - 실시간 값(배지·진행 중 주문·채팅 목록)에는 쓰지 않는다.
 */

let installed = false;

export { HUB_DATA_REVISIT_FRESH_MS, invalidateAllHubData, peekHubDataEpoch };

function installHubDataEpochListeners(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  let wasHidden = document.visibilityState === "hidden";
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      wasHidden = true;
      return;
    }
    if (wasHidden) {
      wasHidden = false;
      invalidateAllHubData("app_resume");
    }
  });
  /**
   * 숨긴 허브는 효과가 정리돼 이 알림을 듣지 못한다 — 주소·프로필이 바뀌면 세대를 올려 다시 보일 때 다시 받게 한다
   * (배달 피드·배너는 주소 기준, 피드 글쓴이 이름은 프로필 기준).
   */
  window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, () => invalidateAllHubData("addresses_updated"));
  window.addEventListener(PROFILE_UPDATED_EVENT, () => invalidateAllHubData("profile_updated"));
  try {
    let lang = document.documentElement.lang;
    new MutationObserver(() => {
      const next = document.documentElement.lang;
      if (next !== lang) {
        lang = next;
        invalidateAllHubData("lang_change");
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  } catch {
    /* ignore */
  }
}

export type HubDataRevisitGate = {
  /** 이 인스턴스가 같은 키로 60초 안(같은 세대)에 받은 적 있으면 true — 효과에서 요청을 건너뛴다 */
  isFresh: (key: string) => boolean;
  /** 받기 성공 시 기록 */
  markLoaded: (key: string) => void;
  /** 화면 값을 비웠을 때(조건상 데이터 없음 등) — 다음 효과에서 반드시 다시 받게 기록을 지운다 */
  reset: () => void;
};

export function createHubDataRevisitGate(
  now: () => number = Date.now,
  maxAgeMs: number = HUB_DATA_REVISIT_FRESH_MS
): HubDataRevisitGate {
  let last: { key: string; at: number; epoch: number } | null = null;
  return {
    isFresh: (key) =>
      last != null &&
      last.key === key &&
      last.epoch === peekHubDataEpoch() &&
      now() - last.at < maxAgeMs,
    markLoaded: (key) => {
      last = { key, at: now(), epoch: peekHubDataEpoch() };
    },
    reset: () => {
      last = null;
    },
  };
}

/** 화면 인스턴스마다 하나 — `Activity` 숨김/보임 사이에도 유지된다. */
export function useHubDataRevisitGate(): HubDataRevisitGate {
  installHubDataEpochListeners();
  const [gate] = useState(() => createHubDataRevisitGate());
  return gate;
}
