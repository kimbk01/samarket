# 재감사 C·D — 영향 분석 · 적용 계획 (2026-11-19 PHT)

- 지시: Owner 「C·D 진행」(재감사 `full-reaudit-2026-11-19.md` §7).
- 운영 DB 적용은 **Owner 승인 후**에만 한다. 이 문서 작성 시점에 운영 변경은 없다.

## C. `member_badge_counters` 그림자 퇴역

| 항목 | 내용 |
|---|---|
| 지우는 것(DB) | 트리거 4개(`participants` ins·upd·del, `rooms`) · 함수 4개(`trg_…participants`, `trg_…rooms`, `recompute_member_badge_counters`, `get_member_badge_counters`) · 표 `member_badge_counters`(38행) |
| 남기는 것 | `internal.cm_badge_text_has_content` — 입력 표 트리거가 함께 씀 |
| 지우는 것(코드) | `member-badge-counters-shadow.ts` · `build-domain-badge-authority-http.ts` 의 그림자 호출 · 테스트 1개 |
| 남기는 감시 | 하단 탭 수 ↔ 앱 아이콘 수 갈림 기록 `[badge-loader-authority-diverged]` — DB 호출 없이 같은 표본(10%) |
| 운영 확인(읽기 전용) | 표를 읽는 함수는 위 4개뿐. 의존 뷰 0. 트리거 4개 켜짐 |
| 바뀌는 동작 | 화면 숫자 **없음**(이 표는 숫자 계산에 안 씀) |
| 효과 | 메시지 보내기·읽음 처리 안에서 참가자마다 돌던 다시 세기 제거. 배지 요청 표본의 그림자 RPC 1건 제거 |
| 위험 | DROP TRIGGER 가 `participants`·`rooms` 표를 아주 잠깐 잠금 → `lock_timeout` 을 짧게 걸고 적용. 실패하면 그대로 두고 다시 시도 |
| 되돌리기 | `20271119150000_member_badge_counters_shadow.sql` 재적용(백필 포함) |

## D. 중복 방지 기록 7일 보존

| 항목 | 내용 |
|---|---|
| 실측 | 10,059행 · 11 MB · 07-31 이후 삭제 0건 · 하루 약 225행 · 지금 7일 넘은 것 8,412행 |
| 추가(DB) | `dibay_purge_room_unread_idempotency(p_keep_days=7, p_max_rows=50000)` — service_role 전용 · 한 번에 최대 5만 행 |
| 추가(코드) | 매일 메신저 정리 예약 작업(04:10 PHT)에서 1번 호출(Supabase 1건/일). 실패해도 연락처 정리는 진행 |
| 지워도 되는 근거 | 읽음 키(사용자·방·끝 메시지): 다시 오면 그냥 다시 읽음 처리(이미 읽었으면 변화 없음). 보내기 키: 메시지 표 고유 색인(room·sender·client_message_id)이 중복을 따로 막음 |
| 효과 | 표 크기 일정(약 7일치). 오래된 결과를 「재전송」으로 돌려주는 일 감소 |
| 위험 | 첫 실행 8,412행 삭제 — 짧음. 색인 없이 순차 조회(회원 1만 기준 수십만 행/일 → 하루 1번이면 허용) |
| 되돌리기 | 함수 삭제 + 예약 작업 호출 제거(남은 기록에는 영향 없음) |

## 적용 순서 (승인 후)

1. 코드 PR(이 브랜치) 병합 → 운영 배포 확인(배포 SHA).
2. 운영 DB: `20271119231000`(D 함수) 적용 → 함수를 1번 직접 실행해 지운 수 확인.
3. 운영 DB: `20271119230000`(C 퇴역) 적용(`lock_timeout` 짧게).
4. 확인: 트리거·표 없음, 보내기·읽음 정상(운영 로그 오류 0), 배지 그림자 로그 `badge-counter-shadow` 사라짐.

C 를 코드 배포보다 먼저 적용하면, 그림자 RPC 가 오류를 내고 조용히 넘어간다. 화면에는 영향이 없지만 Postgres 오류가 쌓이므로 순서를 지킨다.
