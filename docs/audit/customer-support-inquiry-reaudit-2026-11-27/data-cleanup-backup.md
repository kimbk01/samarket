# 데이터 정리 백업 (F5·F6) — 실행 직전 운영 DB 읽기 (2026-11-27 PHT)

## support_cases (status RESOLVED · admin_unread_count>0) — 6행, 정리 후 admin_unread_count=0
| id | 번호 | 상태 | admin_unread(전) | requester_unread |
|---|---|---|---|---|
| 79ec2180-e722-455f-969a-b322ed981485 | SC-100001 | RESOLVED | 2 | 1 |
| d2f01db1-b34b-4472-a194-d148753979c8 | SC-100005 | RESOLVED | 2 | 1 |
| 3f5fd010-fdc3-4692-b2ca-1951d16d31a4 | SC-100006 | RESOLVED | 2 | 1 |
| 6056cc9a-f586-4da3-a6f1-765530e9e107 | SC-100007 | RESOLVED | 2 | 0 |
| f8d518ee-cc50-4841-834e-35d280bacc81 | SC-100014 | RESOLVED | 1 | 0 |
| eb20bca9-569c-4c3a-b1f4-abd6e35f105f | SC-100027 | RESOLVED | 1 | 0 |

## notification_events (support_*, unread, 문의 종료) — 19행, 정리 후 unread=false·read_at=now
모두 문의 requester_unread_count=0 (F3 표시 대상 아님). 전 값 unread=true · read_at=null.
518ef7c4-750c-4542-8647-4c097b74cb7a (admin_replied) · 669151b0-fd5e-4d87-87c6-8cc970bb1f6f · 986af89c-f477-4039-b233-2074fe8d0956 · 9597b5df-1bbb-4231-b033-eb36b4bffb7c · 7e9485cd-95aa-4c0b-a2c0-aafcbc55c12c · 1e6289a8-e122-4d87-91f2-8fca0333d613 (assigned 5) · 4e5f95e1-6da1-49ee-9b9b-a9f94778f27b · fb8cd397-d5be-4580-a095-9f6daec5665a · 408ab0c7-3848-407d-b143-64d77d27baeb · ad83d01c-40ae-4917-bf26-30b4f26820e9 · 5d99ad3c-7db4-470f-9fe0-e7ad7583733c (created 5) · 6dde7571-1f72-45db-86f8-c07e13af94d3 · 0b24e6c7-013d-4ac3-bfae-0e2f2cf5f741 · 4b794ffc-0c42-44aa-83d8-73913873d3a6 · 48256b86-75f8-4173-aaa9-396a3eed3cc5 · 7c8a10d9-0865-4d41-9e6f-2b6e4edb7342 · 9e43d368-6781-46a5-8d08-cddf271ef4b8 · c1b4299d-a573-4a10-ac81-03bab2822f1e · b65d097b-b93e-4758-9da1-8ea76df63728 (resolved 8)

## 되돌리기
`update support_cases set admin_unread_count = <위 표 값> where id = …;` · `update notification_events set unread = true, read_at = null, opened_at = null where id in (…19…);` (opened_at 전 값은 모두 null 이었음 — 아래 확인 쿼리 결과)

## 실행 결과 (2026-11-27 19:44 PHT, Owner 「정리 실행」)
- 1차 실행: 작업자 실수 — 안전장치 식 `(1/0)` 이 계획 단계에서 항상 오류 → 트랜잭션 전체 취소. 재조회로 변경 0 확인(6·19 그대로).
- 2차 실행: support_cases 6행 `admin_unread_count → 0`, notification_events 19행 `unread=false · read_at · opened_at = 19:44 PHT`. 건수 일치 시에만 커밋(6·19 일치).
- 실행 후 대조: 6행 모두 admin_unread 0, 상태·requester_unread 그대로 / 19행 unread 0·read_at 19건 / 남은 고객지원 미읽음 알림 1건 = SC-100035(진행 중, 정상).
- 새로 확인한 영향: SC-100001·05·06 은 종료 + `requester_unread_count=1`(9월 문의). F3 배포 후 그 고객 3명의 내 문의 목록·FAB 숫자에 1번 다시 보인다(열면 사라짐).

## 2차 정리 — Owner 「문의는 모두 테스트, 모두 0 으로 승인」 (2026-11-27)
정정: 위 「새로 확인한 영향」의 3건은 틀렸다 — 종료 + requester_unread 1 은 **5건**(SC-100001·05·06·31·34, 앞 표는 admin_unread>0 행만 본 것).

백업(실행 직전):
| id | 번호 | 상태 | requester_unread(전) | admin_unread |
|---|---|---|---|---|
| c01ffd4d-f2b4-4e6e-93e0-034fc69fe96f | SC-100035 | WAITING_USER | 2 | 0 |
| 3f5fd010-fdc3-4692-b2ca-1951d16d31a4 | SC-100006 | RESOLVED | 1 | 0 |
| d2f01db1-b34b-4472-a194-d148753979c8 | SC-100005 | RESOLVED | 1 | 0 |
| 79ec2180-e722-455f-969a-b322ed981485 | SC-100001 | RESOLVED | 1 | 0 |
| e7ecaa68-b992-48b4-ac95-818305c4dce4 | SC-100034 | RESOLVED | 1 | 0 |
| b2c28d74-bd09-4488-9384-ea19228e9922 | SC-100031 | RESOLVED | 1 | 0 |
notification_events 699b27e8-d698-48cc-a1be-d22a5d8934bc (support_admin_replied, SC-100035) unread=true · read_at null · opened_at null.

실행 (19:47 PHT): support_cases 6행 requester_unread_count → 0 · notification_events 1행 읽음. 건수 일치(6·1) 시에만 커밋.
실행 후 대조: 고객 미읽음 문의 0 · 어드민 미읽음 문의 0 · 고객지원 미읽음 알림 0. SC-100035 상태는 WAITING_USER 그대로 — 마지막 글이 7일 넘게 지나, PR #671 배포 뒤 F7 자동 종료가 처음 도는 매시 정각대(UTC 분 0~4)에 종료된다.
