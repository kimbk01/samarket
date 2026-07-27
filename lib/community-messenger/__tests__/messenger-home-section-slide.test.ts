import { describe, expect, it } from "vitest";
import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import {
  planMessengerHomeSectionTransition,
  resolveMessengerHomeSectionSlideDirection,
  shouldApplyMessengerUrlSectionSync,
  simulateMessengerHomeSectionClickCycle,
} from "@/lib/community-messenger/messenger-home-section-slide";

describe("resolveMessengerHomeSectionSlideDirection", () => {
  it("friends → call_logs 는 forward", () => {
    expect(resolveMessengerHomeSectionSlideDirection("friends", "call_logs")).toBe("forward");
  });

  it("call_logs → chats 는 forward", () => {
    expect(resolveMessengerHomeSectionSlideDirection("call_logs", "chats")).toBe("forward");
  });

  it("archive → friends 는 backward", () => {
    expect(resolveMessengerHomeSectionSlideDirection("archive", "friends")).toBe("backward");
  });

  it("동일 탭은 null", () => {
    expect(resolveMessengerHomeSectionSlideDirection("chats", "chats")).toBeNull();
  });
});

describe("planMessengerHomeSectionTransition", () => {
  it("초기 마운트는 generation bump 없음", () => {
    expect(
      planMessengerHomeSectionTransition({
        previous: null,
        next: "chats",
        reducedMotion: false,
        isInitialMount: true,
      })
    ).toEqual({ direction: null, shouldAnimate: false, bumpGeneration: false });
  });

  it("동일 탭 재클릭은 generation bump 없음", () => {
    expect(
      planMessengerHomeSectionTransition({
        previous: "chats",
        next: "chats",
        reducedMotion: false,
        isInitialMount: false,
      }).bumpGeneration
    ).toBe(false);
  });

  it("reduced motion 은 애니메이션·generation 없음", () => {
    expect(
      planMessengerHomeSectionTransition({
        previous: "friends",
        next: "call_logs",
        reducedMotion: true,
        isInitialMount: false,
      })
    ).toEqual({ direction: null, shouldAnimate: false, bumpGeneration: false });
  });
});

describe("shouldApplyMessengerUrlSectionSync", () => {
  it("URL 과 local 이 같으면 noop", () => {
    expect(
      shouldApplyMessengerUrlSectionSync({
        urlSection: "friends",
        localSection: "friends",
        pendingUserSection: null,
      })
    ).toBe("noop");
  });

  it("pending 중 중간 URL(기본 chats)은 noop", () => {
    expect(
      shouldApplyMessengerUrlSectionSync({
        urlSection: "chats",
        localSection: "friends",
        pendingUserSection: "friends",
      })
    ).toBe("noop");
  });

  it("pending 과 URL 일치 시 clear_pending (setState 없음)", () => {
    expect(
      shouldApplyMessengerUrlSectionSync({
        urlSection: "friends",
        localSection: "friends",
        pendingUserSection: "friends",
      })
    ).toBe("clear_pending");
  });

  it("외부 URL 변경은 apply", () => {
    expect(
      shouldApplyMessengerUrlSectionSync({
        urlSection: "archive",
        localSection: "chats",
        pendingUserSection: null,
      })
    ).toBe("apply");
  });
});

describe("simulateMessengerHomeSectionClickCycle", () => {
  it("친구 → 통화 클릭 1회당 generation 1회", () => {
    const result = simulateMessengerHomeSectionClickCycle({
      from: "friends",
      to: "call_logs",
      urlSectionSequenceAfterClick: ["call_logs"],
    });
    expect(result.generationAfterClick).toBe(1);
    expect(result.generationAfterUrlSync).toBe(1);
    expect(result.finalLocalSection).toBe("call_logs");
    expect(result.slideDirection).toBe("forward");
  });

  it("통화 → 대화 클릭 1회당 generation 1회", () => {
    const result = simulateMessengerHomeSectionClickCycle({
      from: "call_logs",
      to: "chats",
      urlSectionSequenceAfterClick: ["chats"],
    });
    expect(result.generationAfterClick).toBe(1);
    expect(result.generationAfterUrlSync).toBe(1);
  });

  it("보관함 → 친구는 backward", () => {
    const result = simulateMessengerHomeSectionClickCycle({
      from: "archive",
      to: "friends",
      urlSectionSequenceAfterClick: ["friends"],
    });
    expect(result.slideDirection).toBe("backward");
    expect(result.generationAfterUrlSync).toBe(1);
  });

  it("동일 탭 재클릭은 generation 증가 없음", () => {
    const result = simulateMessengerHomeSectionClickCycle({
      from: "chats",
      to: "chats",
      urlSectionSequenceAfterClick: ["chats"],
    });
    expect(result.generationAfterClick).toBe(0);
    expect(result.generationAfterUrlSync).toBe(0);
  });

  it("클릭 후 URL replace 완료해도 generation 추가 없음", () => {
    const result = simulateMessengerHomeSectionClickCycle({
      from: "friends",
      to: "chats",
      urlSectionSequenceAfterClick: ["chats"],
    });
    expect(result.generationAfterClick).toBe(1);
    expect(result.generationAfterUrlSync).toBe(1);
  });

  it("중간 URL 이 기본 chats 로 오염되어도 generation 추가 없음", () => {
    const result = simulateMessengerHomeSectionClickCycle({
      from: "call_logs",
      to: "archive",
      // soft nav 중 빈 section → resolve 기본 chats 가 끼어드는 경우
      urlSectionSequenceAfterClick: ["chats", "archive"],
    });
    expect(result.generationAfterClick).toBe(1);
    expect(result.generationAfterUrlSync).toBe(1);
    expect(result.finalLocalSection).toBe("archive");
  });

  it("pending 없이 외부 URL 변경은 한 번만 동기화", () => {
    let local: "chats" | "archive" = "chats";
    const pending = null;
    let generation = 0;

    const urlSection = "archive" as const;
    const decision = shouldApplyMessengerUrlSectionSync({
      urlSection,
      localSection: local,
      pendingUserSection: pending,
    });
    expect(decision).toBe("apply");
    const plan = planMessengerHomeSectionTransition({
      previous: local,
      next: urlSection,
      reducedMotion: false,
      isInitialMount: false,
    });
    if (plan.bumpGeneration) generation += 1;
    local = urlSection;

    const second = shouldApplyMessengerUrlSectionSync({
      urlSection,
      localSection: local,
      pendingUserSection: null,
    });
    expect(second).toBe("noop");
    expect(generation).toBe(1);
  });

  it("빠른 연속 탭은 최종 section 으로 수렴하고 URL sync 는 추가 generation 없음", () => {
    let local: MessengerMainSection = "friends";
    let pending: MessengerMainSection | null = null;
    let generation = 0;

    for (const to of ["call_logs", "chats", "archive"] as const) {
      pending = to;
      const plan = planMessengerHomeSectionTransition({
        previous: local,
        next: to,
        reducedMotion: false,
        isInitialMount: false,
      });
      if (plan.bumpGeneration) generation += 1;
      local = to;
    }

    expect(generation).toBe(3);
    expect(local).toBe("archive");

    const afterUrl = shouldApplyMessengerUrlSectionSync({
      urlSection: "archive",
      localSection: local,
      pendingUserSection: pending,
    });
    expect(afterUrl).toBe("clear_pending");
    expect(generation).toBe(3);
  });

  it("reduced motion 은 generation 0", () => {
    const result = simulateMessengerHomeSectionClickCycle({
      from: "friends",
      to: "call_logs",
      urlSectionSequenceAfterClick: ["call_logs"],
      reducedMotion: true,
    });
    expect(result.generationAfterUrlSync).toBe(0);
    expect(result.slideDirection).toBeNull();
  });
});
