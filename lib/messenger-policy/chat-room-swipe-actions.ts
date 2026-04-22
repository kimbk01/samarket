import type { MessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

export type MessengerSwipeListContext = "default" | "archive";

export type MessengerSwipeActionKind = "archive" | "read" | "leave";

export type MessengerSwipeActionDef = {
  kind: MessengerSwipeActionKind;
  label: string;
  disabled: boolean;
};

/**
 * 채팅 목록 스와이프 3종: 보관 · 읽음 · 나가기 (카카오톡 스타일).
 * `roomType`별로 나가기 비활성 등은 여기서만 결정한다.
 */
export function getSwipeActions(input: {
  policyType: MessengerPolicyRoomType;
  listContext: MessengerSwipeListContext;
}): MessengerSwipeActionDef[] {
  const { policyType, listContext } = input;
  const archiveLabel = listContext === "archive" ? "복원" : "보관";
  return [
    { kind: "archive", label: archiveLabel, disabled: false },
    { kind: "read", label: "읽음", disabled: false },
    { kind: "leave", label: "나가기", disabled: false },
  ];
}

/** 스와이프 나가기 확인 문구 — room 정책별 */
export function getSwipeLeaveConfirmMessage(policyType: MessengerPolicyRoomType): string {
  if (policyType === "trade") {
    return "거래 채팅에서 나가면 상대방 화면에 따라 대화가 제한될 수 있습니다. 나가시겠습니까?";
  }
  if (policyType === "group") {
    return "채팅방을 나가면 대화 목록에서 삭제되며, 다시 참여하려면 초대가 필요합니다. 나가시겠습니까?";
  }
  return "대화를 나가면 내 목록에서만 삭제됩니다. 나가시겠습니까?";
}
