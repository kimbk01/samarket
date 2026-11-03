/**
 * 팝업 resolve · PTR 띠 — 「1위가 무효면 다음 순위」 공통 루프 (서버 전용 로직, I/O 는 호출부 콜백).
 *
 * 자격 판정·회전 정렬(`selectPlatformPopupEligibleWinner` / `resolvePopupAd`)이 고른 1위가
 * 표시 단계에서 무효(혜택 내용 없음·이미지 주소 없음·PTR 휴대폰 띠 없음 등)이면, 그 캠페인만 빼고
 * 같은 판정을 다시 돌려 다음 순위를 고른다. 예전에는 1위가 무효면 `winner: null` 로 끝나
 * 같은 영역의 다른 유효한 캠페인까지 나오지 않았다 (광고 최종 점검 P2 · 재감사 E-7 과 같은 계열).
 *
 * 시도 횟수 = 후보 수 이하(매 시도마다 후보 1개가 빠진다) — 무한 반복 없음.
 */

import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";

export type PopupFallthroughSelect<W> =
  | { kind: "error"; error: string }
  | { kind: "none"; reason: string | null }
  | { kind: "winner"; campaignId: string; winner: W };

export type PopupFallthroughPresent<P> =
  | { ok: true; value: P }
  | { ok: false; reason: string };

export type PopupFallthroughResult<W, P> =
  | { kind: "error"; error: string }
  | { kind: "none"; reason: string | null; skippedCampaignIds: string[] }
  | {
      kind: "presented";
      value: P;
      winner: W;
      candidate: PlatformPopupCandidate;
      skippedCampaignIds: string[];
    };

export async function resolveFirstPresentablePopupCandidate<W, P>(input: {
  candidates: readonly PlatformPopupCandidate[];
  select: (remaining: readonly PlatformPopupCandidate[]) => PopupFallthroughSelect<W>;
  present: (winner: W, candidate: PlatformPopupCandidate) => Promise<PopupFallthroughPresent<P>>;
}): Promise<PopupFallthroughResult<W, P>> {
  let remaining = [...input.candidates];
  const skipped: string[] = [];
  /** 무효로 건너뛴 1위의 마지막 이유 — 전부 무효면 이 이유를 그대로 돌려준다(기존 응답 reason 유지) */
  let lastInvalidReason: string | null = null;

  for (let attempt = 0; attempt <= input.candidates.length; attempt += 1) {
    const step = input.select(remaining);
    if (step.kind === "error") return { kind: "error", error: step.error };
    if (step.kind === "none") {
      return { kind: "none", reason: lastInvalidReason ?? step.reason, skippedCampaignIds: skipped };
    }
    const candidate = remaining.find((c) => c.id === step.campaignId);
    const presented: PopupFallthroughPresent<P> = candidate
      ? await input.present(step.winner, candidate)
      : { ok: false, reason: "winner_creative_missing" };
    if (presented.ok && candidate) {
      return {
        kind: "presented",
        value: presented.value,
        winner: step.winner,
        candidate,
        skippedCampaignIds: skipped,
      };
    }
    lastInvalidReason = presented.ok ? "winner_creative_missing" : presented.reason;
    skipped.push(step.campaignId);
    const before = remaining.length;
    remaining = remaining.filter((c) => c.id !== step.campaignId);
    // 선택된 id 가 후보에 없었다면 더 줄일 것이 없다 — 같은 선택 반복 방지
    if (remaining.length === before) break;
  }
  return { kind: "none", reason: lastInvalidReason, skippedCampaignIds: skipped };
}
