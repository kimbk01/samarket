import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export function getCommunityMessengerMediaErrorMessage(
  error: unknown,
  kind: CommunityMessengerCallKind
): string {
  const name =
    typeof error === "object" && error && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return kind === "video"
      ? "카메라와 마이크 권한이 필요합니다. 브라우저 주소창 왼쪽의 사이트 설정에서 권한을 허용해 주세요."
      : "마이크 권한이 필요합니다. 브라우저 주소창 왼쪽의 사이트 설정에서 권한을 허용해 주세요.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return kind === "video"
      ? "사용 가능한 카메라 또는 마이크를 찾지 못했습니다."
      : "사용 가능한 마이크를 찾지 못했습니다.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "다른 앱이 장치를 사용 중일 수 있습니다. 장치 점유를 해제한 뒤 다시 시도해 주세요.";
  }
  return kind === "video"
    ? "영상 통화 장치 준비에 실패했습니다. 권한과 장치 상태를 확인해 주세요."
    : "음성 통화 장치 준비에 실패했습니다. 권한과 장치 상태를 확인해 주세요.";
}
