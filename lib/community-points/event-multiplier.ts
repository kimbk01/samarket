import type { PointEventPolicy } from "@/lib/types/point-policy";
import type { CommunityPolicyResolveSource } from "@/lib/community-points/policy-resolver";

export function resolveCommunityEventMultiplier(input: {
  event: PointEventPolicy | null | undefined;
  eventMultiplierEnabled: boolean;
  actionType: "write" | "comment";
  boardKey: string;
  source: CommunityPolicyResolveSource;
  nowIso?: string;
}): number {
  const event = input.event;
  if (!input.eventMultiplierEnabled || !event?.isActive) return 1;
  const now = input.nowIso ?? new Date().toISOString();
  if (event.startAt > now || event.endAt < now) return 1;
  const boards = event.targetBoards ?? [];
  const key = String(input.boardKey ?? "").trim().toLowerCase();
  if (boards.includes(key)) {
    return input.actionType === "write" ? event.writeMultiplier : event.commentMultiplier;
  }
  if (input.source === "qna_default" && boards.includes("qna")) {
    return input.actionType === "write" ? event.writeMultiplier : event.commentMultiplier;
  }
  if (
    (input.source === "global_default" || input.source === "topic_override") &&
    boards.includes("general")
  ) {
    return input.actionType === "write" ? event.writeMultiplier : event.commentMultiplier;
  }
  return 1;
}
