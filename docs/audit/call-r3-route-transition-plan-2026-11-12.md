# R3 통화 화면 이동 연출 — 영향 분석·계획 (2026-11-12 · 통화 변경 규정 §2·§3 · 구현 전 Owner 승인 필요)

Owner 지시: 「R3 진행」(2026-11-12). 근거 설계: `docs/audit/cold-start-and-remaining-defects-final-design-2026-11-12.md` §4 R3, `docs/audit/d1-root-cause-total-design-2026-11-12.md` §2 S1.
이 문서는 **계획만** 담는다. 코드 변경 없음.

## 0. 작업자 잘못 (먼저 보고)
- S1(PR #163, 운영 `e765abf99`, 2026-11-12 07:08 PHT 반영)은 「통화 화면은 통화 변경 규정상 제외」라고 적었으나, 제외 판정이 `isCommunityMessengerCallPath` = **`/community-messenger/calls/` 로 시작하는 주소만**이었다.
- 운영에서 실제로 쓰는 통화 화면은 **`/community-messenger/calls-v4/<callId>`** 이다(운영 빌드 확인: `isCallV4TelegramLaneEnabled` → `return !0`, 청크 `43f915b1e1ab7a85.js`).
- 그 결과 **07:08 PHT 부터 운영의 v4 통화 화면 진입 연출이 승인·실기 행렬 없이 바뀌어 있다**(예전: 두 화면 연출 / 지금: 같은 surface + 밑그림). 통화 변경 규정 §3·§5 위반.
- 07:08 PHT 이후 운영 통화 4건(운영 DB `community_messenger_call_sessions`, 23:08 UTC 이후): 영상 종료 2 · 영상 취소 1 · 음성 부재중 1. **정상 여부 판정 근거가 아니다**(행렬 아님) → 통화 실기 상태 NOT_PROVEN.

## 1. 현재 상태 (운영 `df2106fbe`)
| 주소 | v4 경로에서 쓰임 | 이동 연출 | 보관 탭 화면 |
|---|---|---|---|
| `/community-messenger/calls/outgoing` | 1:1 발신 시작 셸 (`CommunityMessengerHome` 발신 → 여기로 이동 후 세션 생성) | 예전 두 화면 연출(D) | 코드상 소실(두 화면 연출이 children 을 옮김 — S1 분석과 같은 원인). **통화 경로 실기 재현 NOT_PROVEN** |
| `/community-messenger/calls/[sessionId]` | v4 에서 즉시 `calls-v4/…` 또는 `calls/outgoing` 으로 `router.replace` | 예전 두 화면 연출(D) | 위와 같음 |
| `/community-messenger/calls/logs` | 메신저 통화 탭으로 서버 redirect | 해당 없음(허브로 감) | 영향 없음 |
| `/community-messenger/calls-v4/[callId]` | **실제 통화 화면** | S1 새 연출(**승인 없이 바뀜**) | 유지 |
| `/community-messenger/calls-v3/[callId]` | v3 경로 꺼짐 — 쓰이지 않음 | S1 새 연출 | — |

## 2. 계획 (두 단계 · 각각 통화 단독 커밋·단독 main 반영)
### R3-A 원상 복구 (먼저)
- 바꾸는 곳: `components/route-transition/AppRouteTransition.tsx` 의 S1 통화 제외 판정 2곳(줄 795 `liveSurfaceSlide`, 줄 1091 `headerlessSlideTarget`)만. 판정을 `/community-messenger/calls/`·`/calls-v3/`·`/calls-v4/` 셋 다로 넓힌다(이 파일 안 전용 함수). 공용 `isCommunityMessengerCallPath`(하단 탭 정책·통화 이동 잠금이 씀)는 **바꾸지 않는다**.
- 바뀌는 동작: v4 통화 화면 진입·이탈 연출이 S1 이전(두 화면 연출 = 마지막으로 통화 행렬을 통과한 상태)으로 돌아감.
- 영향 경로: 발신 시작(메신저 홈·방 → `calls/outgoing` → `calls-v4`), 수신 수락(네이티브 수락 → `calls-v4?action=accept`), 배너 펼치기(`calls-v4?incomingPreview=1`), 종료 후 복귀, 통화 중 최소화·복귀. 세션 생성·VoIP/FCM 발송·CallKit·Android 수신 화면·취소/거절/종료 신호·통화 기록은 **코드 무변경**(화면 전환 연출만).
- 설치 바이너리 호환: 웹만 — 네이티브 무변경. 최근 14일 설치 버전(운영 `user_devices`): Android 1.2.6(39) 11대·1.2.5(37) 6대·1.2.5(20) 7대 등, iOS 1.2(27) 10대·1.2(22) 9대·1.2.1(31) 5대 등 — 모두 같은 웹을 받으므로 버전별 차이 없음.
- 회귀 위험: 예전 두 화면 연출로 돌아가므로, 통화 화면으로 갈 때 보관 탭 화면이 다시 사라짐(S1 이전과 같음) — R3-B 에서 해결.
- 롤백: 해당 커밋 revert(웹만).
### R3-B 통화 화면도 S1 방식 적용 (R3-A 실기 PASS 후)
- 바꾸는 곳: 같은 2곳에서 통화 제외를 없앰(통화 화면도 같은 surface + 밑그림).
- 추가로 확인할 것: `calls/outgoing` → `calls-v4` 의 `router.replace`(같은 연출 안 두 번 이동)에서 밑그림이 두 번 생기지 않는지, 통화 화면 위 최소화 PIP·네이티브 수락 진입(콜드 스타트 경로)에서 밑그림이 남지 않는지.
- 롤백: 해당 커밋 revert.

## 3. 실기기 검증 (각 단계 · 통화 변경 규정 §5 최소 행렬 · Production SHA 매 시험 확인)
Android↔iPhone 음성·영상 발신·수신 / 거절 / 벨 중 취소 / 취소 후 지연 푸시(재울림 없음) / 통화 중(busy) / 무응답 타임아웃 / 정상 종료 후 즉시 재발신 + 이번 변경 항목: 발신·수신·종료 때 화면 전환 모양(녹화), 종료 후 탭 화면 보관 여부.
- 각 시험: 발신 시각·세션 생성·VoIP/FCM 발송(`notification_deliveries`)·수신 화면 표시·연결·종료 시각(PHT, 운영 DB 대조).
- 필요한 기기: Android 2대 이상(삼성·샤오미) + iPhone 1대. **iPhone 시험은 Owner 기기 필요** — 작업자가 조작할 수 없으면 NOT_PROVEN.

## 4. 승인 요청
R3-A(원상 복구) 구현 승인. R3-B 는 R3-A 실기 PASS 뒤 따로 승인.
