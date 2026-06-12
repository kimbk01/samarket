import type { PersonalizedFeedLog } from "@/lib/types/personalized-feed";

export function addPersonalizedFeedLog(_input: Omit<PersonalizedFeedLog, "id" | "createdAt">): void {
  // no-op
}
