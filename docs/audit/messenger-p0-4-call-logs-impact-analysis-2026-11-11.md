# 채팅 P0-4 — 통화 탭 재조회(M4) 통화 규정 영향 분석 (2026-11-11 · **구현 보류 = Owner 승인 대기**)

- 근거 설계: `docs/audit/messenger-p0-structural-audit-design-2026-11-11.md` §2 P0-4 · AGENTS.md 「통화 변경 규정」 1~7.
- 상태: **BLOCKED** — 통화 기록·부재중 알림 읽음 경로에 닿으므로 이 문서 승인 전 코드 변경 없음. P0-1~3 커밋은 이 경로 무변경.

## 1. 증거 (재현·특정)
| 항목 | 내용 | 표기 |
|---|---|---|
| 증상 | 메신저 「통화」 탭에 들어갈 때마다 0.6~1.2초 걸림 | 실측(Samsung M15·Xiaomi 태블릿, 스테이징 `24deb05`, 2026-11-10) — 616~1,206ms |
| 원인 ① | 통화 패널이 조건부 마운트 → 방문마다 `GET /api/community-messenger/calls` 재조회(모듈 캐시 없음) | 코드 `MessengerHomeMainSections.tsx:391-406`, `MessengerCallLogsPanel.tsx:187-196`(마운트 재조회) |
| 원인 ② | 통화 탭 진입마다 `POST /api/me/notifications/missed-call-read` — 부재중 0건이어도 | 코드 `NotificationRouteReadSync.tsx:62-75` |
| 운영 DB 근거 | 통화 세션·`notification_deliveries` 대조 **없음** — 이 결함은 통화 신호·발송이 아니라 목록 재조회 지연 | NOT_PROVEN(DB 대조 미실시, 승인 후 측정 항목에 포함) |

## 2. 바꾸려는 것 (승인 시)
| 파일·함수 | 바뀌는 동작 |
|---|---|
| `MessengerCallLogsPanel.tsx` 마운트 재조회 | viewer 단위 모듈 저장소(통화 기록 목록·커서) — 캐시가 유효하면 마운트 시 재조회 생략 |
| `use-community-call-history-realtime-sync.ts` | `community_messenger_call_logs` 실시간 INSERT/UPDATE·`visibilitychange`·재연결 시에만 저장소 무효화 → 재조회(현행 신호 그대로) |
| `NotificationRouteReadSync.tsx` | 부재중 미읽음 > 0 일 때만 `missed-call-read` POST |

## 3. 영향받는 경로 (통화 규정 3번 목록)
| 경로 | 영향 | 위험 |
|---|---|---|
| 발신 시작·세션 생성·VoIP/FCM 발송 | **없음** (서버·푸시 코드 무변경) | — |
| iOS CallKit / Android 수신 화면·취소·거절·종료 | **없음** (네이티브·통화 화면 무변경) | — |
| 부재중 | 통화 목록 행 표시 시점이 실시간 신호에 의존 — 신호 누락 시 다음 visibility 복귀까지 옛 목록 | 중 — 실시간 누락 대비 visibility·재연결 재조회 유지로 완화 |
| 부재중 배지·알림 읽음 | missed-call-read 조건부 → 미읽음 숫자 판정이 틀리면 배지가 남음 | 중 — 배지 숫자 시험 필수 |
| 통화 기록 | 캐시 키 = viewer — 계정 전환 시 이전 계정 목록 혼입 위험 | 높음 — 로그아웃·계정 전환 시 저장소 비우기 필수 |
| 상태 폴링·CallKit 종료 신호·팝업 | 없음 | — |

## 4. 설치된 구 바이너리 호환
웹 변경만(네이티브·API 응답 형식 무변경) → 현재 설치된 모든 `user_devices.app_version` 에서 동일 동작. 승인 시 착수 전 운영 DB 로 현재 설치 버전 목록을 조회해 보고에 첨부(읽기 전용).

## 5. 롤백
단독 커밋 1개 → `git revert` 후 main 반영(스테이징) · 운영은 Vercel Instant Rollback.

## 6. 실기기 검증 항목 (승인 시 · 코드 PASS + 실기 PASS)
1. 통화 탭 재방문(캐시 유효) 요청 0건 · 첫 방문 1건.
2. Android↔iPhone 음성·영상 각각: 발신·수신·거절·벨 중 취소·무응답 타임아웃·busy·정상 종료 후 — 통화 탭 목록에 행이 즉시 생기는지(실시간), 앱 복귀 시 맞는지.
3. 부재중 1건 발생 → 통화 탭 진입 → 배지 0·`missed-call-read` 1회 / 부재중 0건 → POST 0회.
4. 계정 A→B 전환 → 통화 탭에 A 기록 0건.
5. 각 시험의 발신·세션 생성·발송·표시 시각과 Production SHA 기록(서버 시각은 운영 DB 대조).

## 7. Owner 결정 필요
- 이 분석으로 P0-4 구현을 승인할지 (승인 전 구현 없음 — 통화 규정 3번).
