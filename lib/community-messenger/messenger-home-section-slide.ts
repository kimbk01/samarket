import {
  MESSENGER_MAIN_SECTION_TAB_ORDER,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";

/** 메신저 홈 2단 탭(친구·통화·대화·보관함) 본문 전환 — CSS animation 과 동기 (Telegram급 short fade) */
export const MESSENGER_HOME_SECTION_ENTER_MS = 180;
export const MESSENGER_HOME_SECTION_ENTER_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/** 탭 인덱스 증가 = forward(우→좌), 감소 = backward(좌→우) */
export type MessengerHomeSectionSlideDirection = "forward" | "backward";

export type MessengerUrlSectionSyncDecision = "apply" | "noop" | "clear_pending";

/**
 * 탭 순서(SSOT: MESSENGER_MAIN_SECTION_TAB_ORDER) 인덱스 차로 슬라이드 방향 결정.
 * 동일 탭·비탭 섹션은 null (애니메이션 없음).
 */
export function resolveMessengerHomeSectionSlideDirection(
  from: MessengerMainSection,
  to: MessengerMainSection,
  order: readonly MessengerMainSection[] = MESSENGER_MAIN_SECTION_TAB_ORDER
): MessengerHomeSectionSlideDirection | null {
  const fromIndex = order.indexOf(from);
  const toIndex = order.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;
  return toIndex > fromIndex ? "forward" : "backward";
}

/**
 * URL → local section 동기화 권한.
 * - 사용자 클릭 pending 중이면 중간 URL(빈 section → 기본 chats 등)을 무시한다.
 * - pending 과 URL 이 일치하면 pending 만 해제하고 setState 하지 않는다.
 * - pending 없고 URL≠local 이면 외부 탐색(뒤로가기·딥링크)으로 apply.
 */
export function shouldApplyMessengerUrlSectionSync(args: {
  urlSection: MessengerMainSection;
  localSection: MessengerMainSection;
  pendingUserSection: MessengerMainSection | null;
}): MessengerUrlSectionSyncDecision {
  const { urlSection, localSection, pendingUserSection } = args;
  if (pendingUserSection != null) {
    if (urlSection === pendingUserSection) return "clear_pending";
    return "noop";
  }
  if (urlSection === localSection) return "noop";
  return "apply";
}

export type MessengerHomeSectionTransitionPlan = {
  direction: MessengerHomeSectionSlideDirection | null;
  shouldAnimate: boolean;
  /** true 이면 transition generation 을 1 증가 */
  bumpGeneration: boolean;
};

/**
 * 한 번의 section 변경에 대해 애니메이션·generation 발급 여부를 결정한다.
 * 초기 진입·동일 탭·reduced-motion 은 generation 을 올리지 않는다.
 */
export function planMessengerHomeSectionTransition(args: {
  previous: MessengerMainSection | null;
  next: MessengerMainSection;
  reducedMotion: boolean;
  isInitialMount: boolean;
}): MessengerHomeSectionTransitionPlan {
  const { previous, next, reducedMotion, isInitialMount } = args;
  if (isInitialMount || previous == null) {
    return { direction: null, shouldAnimate: false, bumpGeneration: false };
  }
  if (previous === next) {
    return { direction: null, shouldAnimate: false, bumpGeneration: false };
  }
  if (reducedMotion) {
    return { direction: null, shouldAnimate: false, bumpGeneration: false };
  }
  const direction = resolveMessengerHomeSectionSlideDirection(previous, next);
  if (direction == null) {
    return { direction: null, shouldAnimate: false, bumpGeneration: false };
  }
  return { direction, shouldAnimate: true, bumpGeneration: true };
}

/**
 * 클릭 1회 + URL sync 시뮬레이션 — generation 이 몇 번 증가하는지 검증용.
 * 제품 런타임과 동일한 authority 규칙을 따른다.
 */
export function simulateMessengerHomeSectionClickCycle(args: {
  from: MessengerMainSection;
  to: MessengerMainSection;
  /** 클릭 후 URL 이 거치는 section 들(마지막이 확정 URL). 예: ["chats", "friends"] 중간 기본값 오염 */
  urlSectionSequenceAfterClick: MessengerMainSection[];
  reducedMotion?: boolean;
}): {
  generationAfterClick: number;
  generationAfterUrlSync: number;
  finalLocalSection: MessengerMainSection;
  slideDirection: MessengerHomeSectionSlideDirection | null;
} {
  const reducedMotion = args.reducedMotion === true;
  let local = args.from;
  let pending: MessengerMainSection | null = null;
  let generation = 0;
  let slideDirection: MessengerHomeSectionSlideDirection | null = null;

  // user click
  if (args.to !== local) {
    pending = args.to;
    const plan = planMessengerHomeSectionTransition({
      previous: local,
      next: args.to,
      reducedMotion,
      isInitialMount: false,
    });
    if (plan.bumpGeneration) generation += 1;
    slideDirection = plan.direction;
    local = args.to;
  }
  const generationAfterClick = generation;

  for (const urlSection of args.urlSectionSequenceAfterClick) {
    const decision = shouldApplyMessengerUrlSectionSync({
      urlSection,
      localSection: local,
      pendingUserSection: pending,
    });
    if (decision === "clear_pending") {
      pending = null;
      continue;
    }
    if (decision === "noop") continue;
    const plan = planMessengerHomeSectionTransition({
      previous: local,
      next: urlSection,
      reducedMotion,
      isInitialMount: false,
    });
    if (plan.bumpGeneration) {
      generation += 1;
      slideDirection = plan.direction;
    }
    local = urlSection;
    pending = null;
  }

  return {
    generationAfterClick,
    generationAfterUrlSync: generation,
    finalLocalSection: local,
    slideDirection,
  };
}
