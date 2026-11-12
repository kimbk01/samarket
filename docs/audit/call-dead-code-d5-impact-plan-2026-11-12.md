# 통화 죽은 코드 정리 D5 — 영향 분석·계획 (승인 전 · 구현 안 함)

- 작성 2026-11-12 PHT · 기준 트리 origin/main 9aa207a84 + D3(#196) · 근거 규정: AGENTS.md 「통화 변경 규정」 1~7
- 상태: **계획만**. 코드·라우트는 아직 바꾸지 않았다. Owner 승인 후 통화만 단독 PR 로 구현한다.

## 1. 바꾸는 것

### 1-1. 죽은 통화 파일 삭제 (28개 · 1,759줄)
어떤 페이지·API·네이티브 브리지·시험에서도 import 되지 않는 파일 (import 그래프 + 경로 문자열 대조).

```
components/admin/settings/_quarantine/AdminMessengerCallSoundsSection.deprecated.tsx
components/community-messenger/MessengerCallLogDeleteConfirmDialog.tsx
components/community-messenger/call-history/CommunityMessengerCallAvatarOverlay.tsx
components/community-messenger/call-history/CommunityMessengerCallStatusBadge.tsx
components/community-messenger/call-ui/CallButtons.tsx
components/community-messenger/call-ui/index.ts
components/community-messenger/room/message/CallStubActionPopover.tsx
components/messenger/call/call-icon-assets.ts
lib/call/call-realtime.ts
lib/call/call-session-manager.ts
lib/call/call-session-state.ts
lib/call/callSoundManager.ts
lib/call/getUserMediaByCallType.ts
lib/call/index.ts                      (시험 1개가 「삭제된 옛 WebRTC 헬퍼를 다시 내보내지 않는다」를 이 파일로 확인 → 파일이 없어지는 것으로 대체)
lib/call/mapCallEndToRoomEvent.ts
lib/call/perfect-negotiation.ts
lib/call/signaling.ts
lib/call/use-outgoing-call-blocked.ts
lib/community-messenger/bootstrap-lite-policy.ts   (통화 시험의 「주석 허용」 목록에서 항목 제거)
lib/community-messenger/call-busy-policy.ts
lib/community-messenger/call-media-onboarding-storage.ts
lib/community-messenger/call-media-stack.ts
lib/community-messenger/call-session-ui-state.ts
lib/community-messenger/call-timeline-policy.ts
lib/community-messenger/call-v4/presentation/call-v4-presentation-log.ts
lib/community-messenger/outgoing-call-surfaces.ts
lib/community-messenger/stores/call-session-bridge.ts
lib/notifications/client/room-missed-call-badge-store.ts   (배지 시험 1곳의 단언 제거)
```

### 1-2. 호출처 없는 옛 통화 API 삭제 (3개, + 1개 Owner 확인)
| 라우트 | 하는 일 | 대체 경로 |
|---|---|---|
| `POST /api/community-messenger/calls/[sessionId]/accept` | `updateCommunityMessengerCallSession` 얇은 포장 (21줄) | `PATCH /api/community-messenger/calls/sessions/[id]` (웹·Android `IncomingCallAcceptPatchHelper`·iOS 모두 이 경로) |
| `POST …/calls/[sessionId]/end` | 같음 (28줄) | 같음 |
| `POST …/calls/[sessionId]/reject` | 같음 (21줄) | 같음 (Android `IncomingCallRejectPatchHelper`) |
| `POST …/calls/stub-message` | 통화 스텁 메시지 직접 쓰기 | 서버 정식 경로(`updateCommunityMessengerCallSession → ensureTerminalCallStub`) |

같이 고칠 곳: `lib/auth/member-consent-mutation-policy.ts` 표 4줄 · `lib/auth/__fixtures__/member-p0-mutation-classification.csv` 4행(+ `member-p0-r3-fail-closed` 수치) · i18n 기준선 · 해당 라우트 파일을 읽는 통화 계약 시험 2개(`call-stub-message-dead-caller-contract`, `call-start-voip-before-stub-contract` 의 stub-message 단언).

## 2. 바꾸지 않는 것 (남김)
| 대상 | 이유 |
|---|---|
| `calls/[sessionId]/push-ack` | Android `IncomingCallPushAckHelper`·iOS `NativeVoiceCallApi` 가 호출 — 사용 중 |
| `calls/[sessionId]/missed` | QA 스크립트 `scripts/qa/notification-p0-scenario-5-10.mjs` 가 호출 (시험 도구) |
| `lib/call/actions/call-end-guard.ts` | `verify:cm-call-lifecycle-contract` 가 `runCallEndGuard` 를 요구 — 통화 잠금 계약 |
| `lib/chat-domain/ports/call-signaling-boundary.ts` | AGENTS.md 가 통화 경계 기준 파일로 지목 |
| 네이티브(`android/**`·`ios/**`) 파일 | 변경 0 |

## 3. 「왜」 — 증거
| 확인 | 결과 | 판정 |
|---|---|---|
| 현재 코드(웹·Android·iOS·Windows·service worker·vercel cron)에서 1-2 라우트 호출 | 0 (서브에이전트 추적 + grep) | 확인됨 |
| 네이티브 전체 git 이력(android·ios·windows)에 `calls/<id>/accept·reject·end·missed`·`stub-message` 가 있었던 적 | 없음 (이력 전체 `-G` 검색) | 확인됨 |
| 앱에 묶인 로컬 런타임(`capacitor-www`·`android assets`·`ios public`) 이력에 통화 API 호출 | 없음 | 확인됨 |
| 웹 코드 로드 방식 | `capacitor.config.ts` `server.url` — 앱은 운영 웹을 그대로 띄움 → 구 바이너리라도 웹 호출은 최신 코드 | 확인됨 |
| 설치된 구 바이너리 (`user_devices.app_version`, 최근 30일, 운영 DB 읽기 전용) | Android 1.0 ~ 1.2.6(40), iOS 1.0 ~ 1.2.1(31) 다수 활성 — 위 이력상 **어느 버전도 이 라우트를 부르지 않음** | 확인됨 |
| 운영 서버 로그에서 최근 실제 호출 0 | Vercel 로그 경로 검색이 시간 초과(3일·7일·30일) | **NOT_PROVEN** |
| DB(pg_net 등)에서 호출 | `supabase/` 에 경로 없음 | 확인됨 |

## 4. 영향받는 경로 점검
| 경로 | 영향 |
|---|---|
| 발신 시작·세션 생성 | 없음 — `calls/sessions` POST 그대로 |
| VoIP/FCM 발송 (`lib/push/**`) | 없음 — 파일 변경 0 |
| iOS CallKit·Android 수신 화면·수락/거절 | 없음 — 네이티브는 `calls/sessions/[id]` PATCH 만 사용, 변경 0 |
| 취소·거절·종료·부재중 | 없음 — `updateCommunityMessengerCallSession` 본체 변경 0 (포장 라우트만 삭제) |
| 상태 폴링·CallKit 종료 신호·push-ack | 없음 — 해당 라우트 유지 |
| 통화 기록·스텁 메시지 | 없음 — 서버 정식 경로 유지, 직접 쓰기 API(호출 0)만 삭제 |
| 통화 팝업·배너 UI | 없음 — 삭제 파일은 화면 어디에도 import 되지 않음 |
| 설치된 구 바이너리 | 없음 — 3절 이력 근거 |

회귀 위험: 저장소 밖 호출자(외부 스크립트·북마크)가 있었다면 200 → 404. 운영 로그 확인 못 한 부분(NOT_PROVEN)이 남은 위험.

## 5. Owner 지시와 기존 설계 충돌 (보고)
`lib/community-messenger/call-authority/call-chat-projection-authority.ts` 주석: 「stub-message API = DEAD product caller (CUT9 cleanup). **Preserve route.**」 — 이전 단계(CUT9)는 호출처가 없어도 라우트를 남기기로 했고, 이번 Owner 지시(죽은 코드 삭제)는 지우는 방향이다. 규정 7번에 따라 임의로 고르지 않고 보고한다. **승인 시 「stub-message 포함/제외」를 함께 지정**해 주시면 그대로 한다 (지정 없으면 제외 = 남김).

## 6. 구현·검증·롤백
1. 통화만 단독 브랜치 `chore/call-dead-code-d5` · 단독 PR (다른 정리와 묶지 않음). 통화 승인 전이므로 자동 병합은 Owner 승인 후 등록.
2. 로컬: `typecheck:build`·`typecheck:test`·`lint`·`ci:static` 18종·`verify:cm-call-lifecycle-contract`·통화 계약 시험 전체·vitest 전체.
3. 병합 후 Production SHA 확인 → 실기기 행렬(매 시험마다 SHA 기록, 시각은 운영 DB `community_messenger_call_sessions`·`notification_deliveries` 로 대조):
   Android↔iPhone 음성·영상 발신·수신 · 거절 · 벨 중 취소 · 취소 후 지연 푸시(재울림 없음) · 통화 중(busy) · 무응답 타임아웃 · 정상 종료 후 즉시 재발신.
4. 실기기 FAIL 시 즉시 중단 → Vercel Instant Rollback(재빌드 없음) → 원인 보고.
5. 롤백 방법: 해당 PR `git revert` 1커밋 (삭제만 있으므로 되돌리기 단순).
