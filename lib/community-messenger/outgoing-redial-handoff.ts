import {
  primeOutgoingRingbackWebAudioFromUserGesture,
  stopCommunityMessengerCallTone,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
} from "@/lib/community-messenger/call-feedback-sound";
import {
  prepareCommunityMessengerOutgoingRedial,
  primeOutgoingCallMediaBeforeNavigate,
} from "@/lib/community-messenger/call-media-bootstrap";
import {
  bootstrapCommunityMessengerOutgoingCallAndNavigate,
  readRedialAuditPreviousSessionIdFromPath,
  type OutgoingCallSessionBootstrapResult,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { suspendPrimedCommunityMessengerDeviceStreamIdleRelease } from "@/lib/community-messenger/call-permission";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { logRedialAudit, logRedialPath } from "@/lib/community-messenger/legacy-call-debug";

const HANDOFF_KEY = "cm_outgoing_redial_handoff";
const HANDOFF_TTL_MS = 20_000;

function redialBlockedMessage(kind: CommunityMessengerCallKind): string {
  const lang = getRuntimeAppLanguage();
  return kind === "video"
    ? safeTranslate(lang, "nav_messenger_permission_retry_camera_mic", {
        fallbackKo: "카메라·마이크 허용 후 영상통화가 가능합니다.",
        fallbackEn: "Allow camera and microphone to start a video call.",
      })
    : safeTranslate(lang, "nav_messenger_permission_retry_mic", {
        fallbackKo: "마이크 허용 후 음성통화가 가능합니다.",
        fallbackEn: "Allow microphone access to start a voice call.",
      });
}

/** 라우트 unmount dispose 가 프라임 스트림을 버리지 않게 — sessionStorage 단일 플래그 */
export function beginOutgoingRedialHandoff(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(HANDOFF_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  suspendPrimedCommunityMessengerDeviceStreamIdleRelease();
}

export function isOutgoingRedialHandoffActive(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at) || Date.now() - at > HANDOFF_TTL_MS) {
      endOutgoingRedialHandoff();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function endOutgoingRedialHandoff(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 종료 화면 「다시 시도」 단일 진입점.
 * 1) 제스처 안에서 권한·GUM 프라임
 * 2) handoff 플래그 (unmount dispose 보호)
 * 3) Agora cleanup
 * 4) 새 세션 POST + 라우트 (프라임 생략)
 */
/** 통화 종료·기록·스텁 등 모든 재발신의 단일 진입점. Agora 정리는 종료 화면에서만 넘긴다. */
export async function executeOutgoingRedialFromTerminal(input: {
  kind: CommunityMessengerCallKind;
  roomId: string | null;
  peerUserId: string | null;
  cleanupAgora?: () => Promise<void>;
  navigate: (href: string) => void;
}): Promise<OutgoingCallSessionBootstrapResult> {
  logRedialPath("executeOutgoingRedialFromTerminal_enter", {
    kind: input.kind,
    roomId: input.roomId,
    peerUserId: input.peerUserId,
  });
  const cleanupAgora = input.cleanupAgora ?? (async () => {});
  unlockCommunityMessengerCallPlaybackFromUserGesture();
  primeOutgoingRingbackWebAudioFromUserGesture(input.kind);
  prepareCommunityMessengerOutgoingRedial(input.kind);

  const primeResult = await primeOutgoingCallMediaBeforeNavigate(input.kind);
  if (!primeResult.ok) {
    stopCommunityMessengerCallTone();
    return { ok: false, userMessage: redialBlockedMessage(input.kind) };
  }

  const previousSessionId = readRedialAuditPreviousSessionIdFromPath();
  logRedialAudit("redial_start", {
    previousSessionId,
    roomId: input.roomId,
    kind: input.kind,
  });

  beginOutgoingRedialHandoff();
  try {
    await cleanupAgora();
    const result = await bootstrapCommunityMessengerOutgoingCallAndNavigate(
      {
        roomId: input.roomId,
        peerUserId: input.peerUserId,
        kind: input.kind,
      },
      input.navigate,
      { skipMediaPrime: true }
    );
    if (result.ok) {
      logRedialAudit("redial_result", {
        previousSessionId,
        newSessionId: result.session?.id,
        same: previousSessionId === result.session?.id,
      });
    }
    if (!result.ok) {
      endOutgoingRedialHandoff();
    }
    return result;
  } catch {
    endOutgoingRedialHandoff();
    stopCommunityMessengerCallTone();
    return { ok: false, userMessage: "통화를 다시 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
