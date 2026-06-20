/**
 * Agora 마이크·스피커 캡처 전 Web Audio·링톤 잔류를 끊는다.
 * 링백/벨 AudioContext 가 열린 채 GUM 이 시작되면 WebView AEC 가 깨져 발신 에코가 난다.
 */

import { stopAllOutgoingRingback } from "@/lib/community-messenger/call-outgoing-ringback-controller";
import { stopCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import { closePrimedWebAudioCallToneContext } from "@/lib/community-messenger/call-tone-web-audio";
import { suspendCommunityMessengerAppAudioContextBestEffort } from "@/lib/community-messenger/cm-app-audio-context";

export function prepareCommunityMessengerCallMediaCapture(reason: string): void {
  stopCommunityMessengerCallTone();
  stopAllOutgoingRingback("capture_prepared");
  closePrimedWebAudioCallToneContext();
  suspendCommunityMessengerAppAudioContextBestEffort();
  if (typeof console !== "undefined") {
    console.info("[call-media-env] capture_prepared", { reason });
  }
}
