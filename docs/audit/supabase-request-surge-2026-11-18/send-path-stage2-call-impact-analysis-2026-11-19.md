# 보내기 2단계 (푸시 발송) — 통화 영향 분석·계획 (통화 변경 규정 3번)

- Owner 「둘 다 승인」(2026-11-19): 1단계 구현 + **이 분석서 작성**. 이 문서의 구현은 **별도 Owner 승인 후**, **통화 단독 PR**, 실기기 통화 행렬 PASS 전 다음 단계 금지(규정 4~6).
- 근거: `send-path-analysis-2026-11-19.md` §2 B·D·E · 코드 추적(2026-11-19).

## 1. 왜 바꾸나 (증거)
운영 11-18 00~03 UTC, 텍스트 보내기 81건 → 메시지 라우트 Supabase 호출 중 푸시 발송 몫(`after()`):
- 배지 전체 재계산(`force:true`) 1푸시 ≈ 8건 — `notify-push-dispatcher.ts:178-183`
- 알림음 표 3개 48/74(인스턴스 캐시 60초, 1푸시에 2번 호출 `:177`·`dispatch-push-for-user.ts:237`)
- 알림 설정 4표 74/74 — 일반 회원도 사장님·관리자 설정까지(`notification-preference-storage-reader.server.ts:72-110`)
- 안전 검사의 차단 관계·방·참가자 재조회 — `notification-delivery-safety-gate.ts:53,71,213`
통화 결함 재현이 아니라 **호출 수 결함**이다. 통화 동작은 바꾸지 않는 것이 목표.

## 2. 바꾸는 것 (파일·함수·동작)

| # | 파일·함수 | 지금 | 바꾼 뒤 | 통화 푸시 영향 |
|---|---|---|---|---|
| 2-a | `notify-push-dispatcher.ts` `dispatchNotificationPush…`(:178-183) | `fetchDomainBadgeAuthorityPayload(force)` 로 FCM `badge_count` 계산 | **회원 배지 B = `member_badge_counters`(D2) + A(종 알림) 1 RPC** 로 같은 값 계산. D2 그림자 불일치 0 확인 뒤, 1주 그림자 비교(값 다르면 기존 값 사용) 후 전환 | `missed_call` 분기도 같은 `badge_count` 사용 → **값이 같아야 함**(그림자로 증명) |
| 2-b | 같은 파일 :177 · `dispatch-push-for-user.ts:237` | 알림음 SSOT 를 1푸시에 2번 hydrate | 1번만(dispatcher 가 이미 했으면 생략 표시 전달) | 수신벨·통화음 매핑이 같은 SSOT → **데이터 동일, 호출 횟수만 감소** |
| 2-c | `web-push-user-settings-gate.ts:206` → 설정 읽기 | 4표 항상 | **받는 사람별 DB 함수 1번**(회원·설정 + 사장님·관리자 행은 해당자만) | 통화 푸시도 같은 게이트 → 함수 결과가 4표와 같은지 그림자 비교 후 전환 |
| 2-d | `notification-delivery-safety-gate.ts` | 차단·방·참가자 재조회 | 2-c 와 같은 DB 함수에 포함 | 통화 푸시 안전 검사 동일 경로 → 그림자 비교 |
| (유지) | `dispatch-push-for-user.ts:248` 알림 행 재조회 | — | **바꾸지 않음** — 발송 직전 「이미 읽음·취소」 상태 확인용(제거하면 읽은 뒤 푸시가 갈 수 있음) | — |

## 3. 영향받는 경로 (통화 규정 3번 목록)
발신 시작·세션 생성: 무관(이 파일들 미사용). **VoIP/FCM 발송**: `dispatchPushForUser` 공유 → 2-b·2-c·2-d 영향. iOS CallKit/Android 수신 화면: payload 불변(값 동일 증명 조건). 취소·거절·종료·부재중: `terminalDismiss`·`missed_call` 분기 공유 → 2-a(missed_call badge)·2-b·2-c. 상태 폴링·통화 기록·팝업: 무관.

## 4. 설치된 구 바이너리 호환
서버만 바뀌고 FCM/APNs **payload 키·값 불변**(그림자로 값 동일 확인 후 전환) → 앱 재설치 불필요. 설치 버전 확인은 구현 시점 `user_devices.app_version` 조회로 기록.

## 5. 회귀 위험 · 대책
| 위험 | 대책 |
|---|---|
| 앱 아이콘 숫자가 달라짐 | 2-a 전환 전 1주 그림자(불일치 0) · 다르면 기존 계산 사용 |
| 통화 푸시가 설정·차단 판정 차이로 안 감/더 감 | 2-c·2-d 그림자 비교(판정 불일치 0) 후 전환 · 통화 푸시는 마지막에 전환 |
| 알림음 없음 | 2-b 는 같은 데이터, hydrate 실패 시 지금처럼 다시 시도 |

## 6. 롤백
Vercel Instant Rollback(재빌드 없음) → 원인 수정 PR → Promote. DB 함수는 추가만(기존 함수 불변) → 코드 롤백만으로 원상.

## 7. 실기기 검증 (규정 5번 최소 행렬, Production SHA 매 테스트 확인)
Android↔iPhone 음성·영상 발신·수신 · 거절 · 벨 중 취소 · 취소 후 지연 푸시(재울림 없음) · 통화 중(busy) · 무응답 타임아웃 · 정상 종료 후 즉시 재발신 · **+ 메시지 푸시: 앱 아이콘 숫자·알림음·차단/음소거 상대 무푸시**. 각 항목 발신·세션·발송·수신 화면·연결·종료 시각(운영 DB 대조).

## 8. 순서
① D2 그림자 불일치 0 확인 → ② 2-b(데이터 동일, 위험 최소) → ③ 2-c·2-d 그림자 → ④ 2-a 그림자 → 각 전환 → 실기기 행렬. 각 단계 통화 단독 PR.
