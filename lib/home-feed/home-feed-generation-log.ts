import type { HomeFeedGenerationLog } from "@/lib/types/home-feed";

/** 클라이언트 피드 생성 시 로그는 어드민 번들 API로만 영속화한다. */
export function addHomeFeedGenerationLog(_input: Omit<HomeFeedGenerationLog, "id">): void {
  // no-op
}
