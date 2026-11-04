# 운영자 알림·혜택 동의 — 처음 설계부터 지금까지 최종 감사 (2026-11-04 16:4x PHT)

> 기준: main `a31eff7cc`(운영자 알림 관련 마지막 커밋 `3fb11c1b3`) · 운영 DB 읽기 전용 · 실기 결과 `admin-push-confirmed-fix-device-result-2026-11-04.md`.
> 작업자가 코드 줄·운영 DB 로 직접 확인. 코드 변경 없음.

## 1. 단계별 구현 여부
| 단계 | 커밋 | 상태 |
|---|---|---|
| 재감사 단계 1(서버 앱 사용 중 판정 삭제·푸시만→알림함+푸시·공지 설정 종류·동의 저장 단일화 등) | `c46d05e32` | 반영 · 이 단계에서 만든 결함 3건(열람 부풀림·「모두 읽음」 열람·방해금지 오분류)은 B-1·B-2 로 정정 → 실기 PASS |
| R-4 기기 권한 「꺼짐」 분기 삭제 | `02cfd0d02` | 반영 |
| Android 요약 카드·아이콘 숫자 | `82c214717`·`0d131be5b`(37) | 반영 · Owner 「37 방식 유지」(지운 뒤 일시적으로 적게 보일 수 있음) |
| 확정 설계 단계 C(DB) | 마이그레이션 `20271105090000` | 운영 적용 · 열 대조 PASS |
| 확정 설계 단계 B-1~B-20 | `2c6856804`·`e24091ac6` | 아래 2·3절 |
| 방해 금지 시각 저장(실기 중 발견) | `3fb11c1b3` | 반영 · 실기 PASS |

## 2. 항목별 대조 (확정 설계 B·C)
| # | 구현 | 실기 | 비고 |
|---|---|---|---|
| B-1 열람 = 연 것만 | ✅ | PASS(앱 안·푸시 탭·iOS 시뮬) | **오류 E-1** 아래 |
| B-2 막힌 이유 순서 | ✅ 사유 순서 | PASS(F1) | **누락 M-1**: 어드민 「방해금지」 별도 칸 없음(지금은 「설정 꺼짐」에 포함 · `campaign-list-service.ts:65`) |
| B-3 푸시만 퇴역 | 입력 거부 ✅ | 코드 PASS | 발송 직전 방어 = Owner 「지금처럼 유지」(이벤트 배포 계약) |
| B-4 미리보기 = 발송 | ✅ | 코드 PASS | **누락 M-2**: 옛 열 `marketing_push_enabled` 를 `/api/me/settings`(`lib/me/user-settings-select.ts:5`)가 아직 읽음. 알림 판정 쪽 읽기만 제거됨 |
| B-5 기록 사유 | ✅ | 코드 PASS | |
| B-6 상세 재발송 = 새 알림 | 화면 ✅ | 코드 PASS | **누락 M-3**: 같은 회차 재실행 경로가 **API 에는 남아 있음** — `/send` 가 `failed` 회차를 다시 받음(`run-campaign-send-batch.ts` `assertOccurrenceSendAllowed`). 화면 호출처는 0 |
| B-7 테스트 회차 마무리 | ✅ | 운영 `sending` 고착 0 | |
| B-8 배지 0 방지 | ✅ | iPhone NOT_PROVEN(시뮬 한계) | |
| B-9 오류 기록 | ✅ | `record_error_count>0` 0건(오류 없음) | 오류 **E-2** 아래 |
| B-10 집계 페이지 읽기 | ✅ | 코드 PASS | |
| B-11 커서 스캔 | ✅ | 코드 PASS | 누수 L-1 아래 |
| B-12 회차 번호 DB 배정 | ✅ | 같은 번호 중복 0 | |
| B-13 결과 표시 | 대상 없음·알림함 전용·테스트 제외 합계·반복 스냅샷 ✅ | PASS(F2) | **누락 M-4**: 「상태와 결과 배지를 같은 회원 단위 집계로」 미구현 — 회차 상태는 행(기기) 단위 집계(`resolveFinalOccurrenceStatus`) 그대로 |
| B-14 동의 저장 순서 | ✅ | NOT_PROVEN(신규 가입 실기 없음) | |
| B-15 설정 바뀐 열만 | ✅ | PASS | |
| B-16 동의 회원 대상 | 입력 거부 ✅ | 코드 PASS | 이벤트 배포 기본값 = Owner 「지금처럼 유지」 |
| B-17 닫음 | ✅ 규칙 | 경로 없음 | 범위 밖 결함: 알림을 밀어 지운 것을 서버에 알리는 앱 경로 0 |
| B-18 테스트 발송 권한·횟수 | ✅ | 정상 발송 PASS | |
| B-19 죽은 코드 | ✅ 삭제 | — | |
| B-20 예전 키 재시도 | ✅ 삭제·복사 방식 | 회차 없는 새 대상 행 0 | |
| C-1~C-6 | ✅ | 열 대조 PASS | C-3 은 이벤트 배포 4건 원복(작업자 잘못 · 기록 있음) |

## 3. 오류·중복·누수
| 구분 | # | 내용 | 영향 |
|---|---|---|---|
| 오류 | **E-1** | 푸시 탭 읽음 API(`app/api/me/notifications/read/route.ts`)가 알림함 행이 **이미 읽힌 상태**면 `ok:false` 로 끝나 푸시 열람을 기록하지 않음(예: 「모두 읽음」 뒤 OS 알림 탭) | 열람 수가 실제보다 적게 보일 수 있음 |
| 오류 | E-2 | `record_error_count` 증가가 읽고-쓰기(원자적 아님) | 같은 회차를 동시에 두 배치가 돌 때만 — 발송 잠금(lease)으로 동시 실행 없음 → 실제 영향 없음 |
| 중복 | D-1 | 상세 「재발송」(`AdminNotificationCampaignDetailPage.tsx` `resendFailedMembers`)과 목록 「다시 보내기」(`AdminSentNotificationPanels.tsx` `sendNow`)가 같은 2단계(만들기→보내기)를 각자 구현 | 동작 같음 · 한쪽만 고치면 어긋날 위험 |
| 누수 | L-1 | `send_progress_offset` 을 커서와 함께 계속 씀(스캔은 더 이상 안 씀) | 동작 영향 없음 |
| 누수 | L-2 | `CampaignTargetWriteMode` 가 `"occurrence"` 1값만 남음 · 사유 목록 `CAMPAIGN_SKIP_REASONS` 에 새 사유(dispatch 사유·`send_exception`) 없음(라벨은 있음) | 동작 영향 없음 |
| 데이터 | — | 시험 데이터: `[F2] 알림함만 확인` 실제 발송 1건이 「보낸 알림」 목록에 남음(A 1명) · 테스트 회차들은 QA 샌드박스라 목록에 안 보임 | Owner 판단 |

확인한 이상 없음(운영 DB): 같은 회차 번호 중복 0 · `sending` 고착 0 · 대기 회차 31(발송 기록 없음 = 설계대로) · 「푸시만」 초안 4(이벤트 배포 · 결정대로) · 방해 금지 켰는데 시각 없음 0 · 배포 뒤 푸시 열람 3건 = 실제 푸시 탭 경로(T6 회원 iPhone 2대 09:21 · R1) — 앱 안 열기가 푸시 열람으로 새는 경우 0.

## 4. 수정 제안 (승인 대기 · 웹만)
| # | 수정 |
|---|---|
| M-1 | 결과 표·받은 사람 창에 「방해금지」 칸 분리(`quiet_hours` 를 「설정 꺼짐」에서 뺌) |
| M-2 | `/api/me/settings` 선택 열에서 `marketing_push_enabled` 제거(화면 사용처 0 확인 후) |
| M-3 | `/send` 가 `failed` 회차를 다시 받지 않게(새 알림 = `resend` 만) |
| M-4 | 회차 상태를 회원 단위 집계로(실패 회원 있음·성공 회원 있음 기준) |
| E-1 | 푸시 탭: 알림함 행이 이미 읽혔어도 그 알림의 발송 기록은 「열람」으로 |
| D-1·L-1·L-2 | 정리(동작 변경 없음) — 같은 커밋에 포함 |

## 5. 수정 결과 (Owner 「수정 승인」 2026-11-04)
| # | 반영 |
|---|---|
| M-1 | `push_quiet` 집계 · 목록 「방해금지」 열 · 받은 사람 창 카드·거르기·줄 표시 |
| M-2 | `USER_SETTINGS_ROW_SELECT` 에서 `marketing_push_enabled` 제거(DB 열·타입 유지) |
| M-3 | `resolveActiveOccurrenceForSend`: 지정 회차가 `failed` 면 거부 · 자동 선택은 `queued` 만 · 미사용 `resolveLatestQueuedOccurrenceId` 삭제 |
| M-4 | `resolveFinalOccurrenceStatusByMembers`(회원 단위) · 행 단위 `resolveFinalOccurrenceStatus` 삭제 |
| E-1 | 푸시 탭: 이미 읽은 알림도 열람 기록 · 열람·닫음 기록에 `user_id` 조건 |
| D-1 | 상세 재발송이 목록과 같은 `sendNow` 사용 |
| L-1·L-2 | `send_progress_offset` 쓰기 중단(커서만) · `CampaignTargetWriteMode` 삭제 · 사유 목록에 dispatch 사유·`send_exception` 추가 |
| 테스트 | 신규 `admin-push-final-audit-2026-11-04.test.ts` 9건 · 회원 집계·스테이징 계약 테스트 갱신 |

검증(로컬 · 최종 트리): `typecheck:build`·`typecheck:test` PASS · 관련 vitest 122 파일(관리자 표준 문구 검사 포함) PASS · 변경 파일 eslint 오류 0.
