# 연락처 동기화 4단계 — 통화 영향 분석·계획 (승인 전 · 구현 없음)

- 작성: 2026-11-10 PHT · 근거: AGENTS.md 「통화 변경 규정」 1~7 · SSOT `docs/design/messenger-contacts-sync-plan.md` v5 §1 #9 · §6-4 · §9 · §12 4단계
- 상태: **영향 분석 제출 — Owner 승인 후 구현** (통화 단독 커밋 · 단독 main 반영 · 실기기 행렬 PASS 전 다음 단계 금지)

## 1. 바꾸는 것 (승인된 정책 범위만)
| # | 내용 | 정책 |
|---|---|---|
| C1 | 연락처 회원 시트·친구 프로필 시트의 「전화」를 누르면 **선택 시트**: 「DIBAY 음성 통화」·「DIBAY 영상 통화」·「휴대폰 전화」 (휴대폰 전화는 이 기기에 그 번호가 있을 때만) | #9 · 시안 10 |
| C2 | 「기본 통화 방식」 설정 (매번 묻기·DIBAY·휴대폰) — `messenger_contact_settings.call_default` (1a 에 이미 있음, 기본 ask) | #9 |
| C3 | 통화 거절 문구 중립화 (차단·거절당한 쪽): `cm_call_deny_blocked` · `cm_call_deny_peer_rejected` → 「통화를 연결할 수 없어요」 | #7 A안 |

## 2. 바꾸는 파일·함수 (예정)
| 파일 | 변경 | 통화 코드 여부 |
|---|---|---|
| `components/community-messenger/contacts/MessengerContactsCallChoiceSheet.tsx` (신규) | 선택 시트 UI. DIBAY 선택 시 **기존 함수 그대로** `guardInstantOutgoingCallStart` → `launchOutgoingDirectCall({ kind, peerUserId, peerLabel })` 호출 | 기존 통화 시작 함수의 **새 호출처** |
| `components/community-messenger/contacts/MessengerContactsMemberSheet.tsx` | 「전화 걸기」 → 선택 시트 | 호출처 |
| `components/community-messenger/MessengerFriendProfileSheet.tsx` · 친구 행 빠른 메뉴 | 「음성」 버튼: 이 기기에 번호가 있고 기본=매번 묻기면 선택 시트, 아니면 **지금과 같은 경로** | 호출처 (기존 동작은 번호 없을 때 그대로) |
| `components/community-messenger/contacts/MessengerContactsSettingsScreen.tsx` | 「기본 통화 방식」 선택 1줄 | 아님 |
| `lib/i18n/catalog/community-messenger-ui.ts` | C3 문구 2개 ko·en | 통화 화면 문구 |
- **바꾸지 않는 것**: `lib/community-messenger/call*` · `call-v4/**` · `service.ts` 통화 함수 · 세션 API · `lib/push/**` · VoIP/FCM 발송 · 네이티브(`android/**`·`ios/**`) 통화·CallKit·수신 화면 · 통화 권한 판정(`direct-call-permission.ts`) · 통화 정책(`messenger_direct_call_policy`).

## 3. 바뀌는 동작
- DIBAY 통화를 고르면 **지금 친구 프로필에서 거는 것과 같은 함수·같은 서버 판정**(차단·상대 통화 설정 everyone/friends_only/nobody)으로 건다. 연락처에서 걸어도 친구가 아니면 상대 설정에 따라 막힐 수 있음 — 기존 규칙 그대로.
- 휴대폰 전화는 `tel:` 로 기기 전화 앱을 연다 (서버·통화 세션·푸시 없음, 통신사 요금).
- 친구 프로필 「음성」: 이 기기 연락처에 그 친구 번호가 없거나 기본=DIBAY 면 **지금과 완전히 같음**.

## 4. 영향받는 경로 점검표
| 경로 | 영향 | 근거 |
|---|---|---|
| 발신 시작 · 세션 생성 | 없음 (같은 함수 재사용) | `launchOutgoingDirectCall` 변경 없음 |
| VoIP/FCM 발송 | 없음 | 서버 미변경 |
| iOS CallKit / Android 수신 화면 | 없음 | 네이티브 미변경 |
| 취소·거절·종료·부재중·상태 폴링·종료 신호 | 없음 | 세션 코드 미변경 |
| 통화 기록·팝업 | 없음 | 미변경 |
| 거절 문구 (C3) | 차단·거절당한 쪽 안내 글만 바뀜 | i18n 값만 |
| **설치된 구 바이너리** | 웹 화면만 바뀌므로 구 바이너리에서도 같은 웹 코드로 동작. 「휴대폰 전화」는 연락처 플러그인 있는 바이너리에서만 번호가 있어 나타남 | 운영 `user_devices.app_version` (2026-11-10): Android 1.2.5(37)×10 · 1.2.6(39)×7 · 1.0.1×3 · 1.2.1(4)×2 · 기타 3 / iOS 1.2(27)×9 · 1.2(22)×5 · 1.2(30)×4 · 1.2(21)×3 · 1.2.1(31)×1 — **연락처 플러그인 들어간 바이너리 0대** |

## 5. 회귀 위험
| 위험 | 대응 |
|---|---|
| 새 호출처에서 통화 시작 가드(연속 탭·전화 인증 필요) 누락 | 홈과 같은 `guardInstantOutgoingCallStart` → `launchOutgoingDirectCall` 순서 그대로, 결과 처리(`alertOutgoingCallFailure`·전화 인증 안내)도 같게 |
| 친구 프로필 「음성」 동작 변화 | 번호 없음·기본 DIBAY 면 기존 경로 그대로 — 단위 시험으로 고정 |
| 문구 변경으로 차단한 본인이 이유를 못 봄 | 차단한 본인은 기존 `cm_call_unavailable_blocked_by_me` 그대로 (C3 대상 아님) |

## 6. 롤백
- 통화 단독 커밋 1개 → `git revert` 1번 + main 반영 (웹만, 앱 재시작). 네이티브·DB 롤백 없음 (C2 열은 1a 에 이미 있고 기본 ask).

## 7. 실기기 검증 (통화 규정 5 · 매 테스트마다 Production/스테이징 SHA 기록)
| # | 시험 | 기록 |
|---|---|---|
| V1 | Android→iPhone · iPhone→Android 음성: 연락처 시트 → DIBAY 음성 | 발신 시각·세션 생성·VoIP/FCM 발송·수신 화면·연결·종료 (운영 DB 대조) |
| V2 | 같은 조합 영상 | 같음 |
| V3 | 친구 프로필 「음성」 (번호 없음·기본 DIBAY) — 기존과 동일 | 같음 |
| V4 | 거절 · 벨 중 취소 · 취소 후 지연 푸시(재울림 없음) · 통화 중(busy) · 무응답 · 종료 후 즉시 재발신 | 같음 |
| V5 | 휴대폰 전화 — 기기 전화 앱 열림, 서버 세션 없음 | 운영 DB 세션 0건 |
| V6 | 차단·거절당한 쪽 문구 (C3) · 차단한 본인 문구 그대로 | 화면 캡처 |
- 연락처 플러그인 들어간 앱 빌드(Owner 일괄 빌드) 후에만 V1·V2·V5 가능. 실기기 FAIL 시 즉시 중단·통화 정상화 우선.

## 8. Owner 승인 요청 항목
1. C1·C2·C3 범위로 구현
2. 통화 단독 커밋·단독 main 반영 순서 (연락처 다른 변경과 묶지 않음)

## 9. 구현 기록 (2026-11-10 · Owner 「4단계 승인」)
- C1: `MessengerContactsCallChoiceSheet` — 연락처 회원 시트 「전화 걸기」 → DIBAY 음성·영상(기존 `guardInstantOutgoingCallStart` → `launchOutgoingDirectCall` · 실패 `alertOutgoingCallFailure` · 발신 중이면 `useOutgoingCallBlocked` 로 막음) / 휴대폰 전화(`tel:`, 이 기기 번호 있을 때만).
- C2: 연락처 설정 「기본 통화 방식」(매번 묻기·DIBAY·휴대폰) → 회원 시트 「전화 걸기」에 적용.
- C3: `cm_call_deny_blocked` · `cm_call_deny_peer_rejected` → 「통화를 연결할 수 없어요」(en: This call can't be connected.). 차단한 본인 문구(`cm_call_unavailable_blocked_by_me`)는 그대로.
- **§2 의 친구 프로필 시트 「음성」 변경은 하지 않음**: 친구의 이 기기 번호를 알려면 연락처 목록 서버 함수가 친구에게도 기기 연락처 식별값을 내려줘야 해 운영 DB 함수 변경이 필요 — 이 문서 범위(통화 코드·DB 미변경) 밖. 친구 프로필 통화는 지금과 완전히 같음.
- 통화 코드(`lib/community-messenger/call*`·`call-v4/**`·세션 API·푸시·네이티브) 변경 없음. 검증: typecheck · eslint · 통화 문구·연락처 시험 · test:ci 전체 PASS. 실기기 V1~V6 은 연락처 플러그인 들어간 앱 빌드 후 (NOT_PROVEN).
