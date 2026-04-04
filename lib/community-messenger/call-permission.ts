import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export function getCommunityMessengerPermissionGuide(kind: CommunityMessengerCallKind): {
  description: string;
  retryLabel: string;
  settingsLabel: string;
} {
  return {
    description:
      kind === "video"
        ? "카메라와 마이크 권한이 꺼져 있으면 브라우저 주소창 왼쪽의 사이트 설정에서 카메라와 마이크를 허용해 주세요."
        : "마이크 권한이 꺼져 있으면 브라우저 주소창 왼쪽의 사이트 설정에서 마이크를 허용해 주세요.",
    retryLabel: kind === "video" ? "카메라/마이크 확인" : "마이크 확인",
    settingsLabel: "권한 설정 안내",
  };
}

export function openCommunityMessengerPermissionSettings(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const origin = window.location.origin;

  try {
    if (ua.includes("edg/")) {
      window.open(`edge://settings/content/siteDetails?site=${encodeURIComponent(origin)}`, "_blank", "noopener,noreferrer");
      return true;
    }
    if (ua.includes("chrome") || ua.includes("whale") || ua.includes("opr/")) {
      window.open(`chrome://settings/content/siteDetails?site=${encodeURIComponent(origin)}`, "_blank", "noopener,noreferrer");
      return true;
    }
    if (ua.includes("firefox")) {
      window.open("about:preferences#privacy", "_blank", "noopener,noreferrer");
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
