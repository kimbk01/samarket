/** 한 채팅방·탭에서 음성 말풍선 하나만 재생되도록 동기화 (텔레그램류 UX) */
export const COMMUNITY_MESSENGER_VOICE_PLAY_EVENT = "samarket:community-messenger-voice-play";

export function dispatchCommunityMessengerVoicePlay(instanceId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(COMMUNITY_MESSENGER_VOICE_PLAY_EVENT, { detail: { id: instanceId } })
  );
}
