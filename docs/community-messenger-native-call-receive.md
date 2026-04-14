# Community Messenger Native-Like Incoming Call

## Goal
Provide strong in-app web incoming call UX now, while keeping a stable bridge contract for wrapper apps that need background and lock-screen parity.

## Layers
- Web layer: `GlobalCommunityMessengerIncomingCall` renders the full-screen receive UI, accepts/rejects calls, and falls back to the normal call page.
- Bridge layer: `lib/community-messenger/native-call-receive.ts` publishes the current ringing session to either:
  - `window.communityMessengerNativeIncomingCallBridge.postIncomingCall(payload)`
  - `window.ReactNativeWebView.postMessage(...)`

## Payload
The bridge payload intentionally mirrors the current session contract and API routes:

```ts
type CommunityMessengerNativeIncomingCallPayload = {
  sessionId: string;
  roomId: string;
  peerUserId: string | null;
  peerLabel: string;
  callKind: "voice" | "video";
  startedAt: string;
  acceptUrl: string;
  rejectUrl: string;
  fallbackUrl: string;
};
```

## Wrapper Expectations
- Show lock-screen or background incoming UI when the app shell is suspended.
- Deep-link to `acceptUrl` or `fallbackUrl` when the user answers.
- Call the existing session PATCH/signaling routes unchanged.
- Clear local native notifications when the web layer emits a clear event.

## Why This Split
- Browsers cannot guarantee KakaoTalk-level receive parity from a normal tab.
- The current split keeps backend signaling stable and lets web/app wrappers evolve independently.
