# §2 묶음 6 — 친구 요청 중앙 팝업 실기기 검증 항목 (2026-10-25 · 검증 전)

- 남은 게이트: 묶음 6 은 main + 운영 DB PASS 이지만 **중앙 팝업 Realtime 실측 NOT_PROVEN** → CLOSED 금지 (Owner 2026-10-24 · `messenger-2026-10-24-bundle6-friend-request-ship-report.md`)
- 대상 코드 (현재 main): `GlobalIncomingFriendRequestHost` (`MessagingGlobalChrome` 장착 · `204cec578`) + 전역 피드 `useGlobalFriendRequestFeed` · 팝업 `MessengerIncomingFriendRequestPopup` (`0b3dd1bd` F-6)
- Production: `d372be96` → `dpl_GVVX5PmAWo58v4cEZCha1hpvuEDJ` READY (위 코드 포함)
- `[배포 구분] 웹만` — 앱 재시작만 · 네이티브 변경 없음
- 묶음 7 · W-9 와 섞지 않고 별도 기록

## 동작 요약 (코드 기준 · 검증 기대값의 근거)

| 경로 | 동작 |
|---|---|
| 앱 시작·로그인 | `/api/community-messenger/friend-requests` 1회 조회 → 받은 pending 요청을 팝업 큐에 적재 (앱이 꺼져 있던 동안 온 요청 포함) |
| 실시간 수신 | `community_friend_requests` Realtime (`addressee_id = 나`) → pending 이면 재조회·팝업 · pending 아니면 팝업 제거 |
| 보낸 쪽 | (`requester_id = 나`) `accepted` 로 바뀌면 스낵바 「○○님이 친구 요청을 수락했습니다.」 |
| 표시 위치 | 통화 화면(`/community-messenger/calls/*`) 제외 모든 화면 · 메신저·`/community`·`/philife/my` 즉시 · `/mypage`·`/philife` 는 최대 **5초** 지연 장착(idle) |
| 팝업 | 제목 「친구 요청」 · 본문 「{이름}님이 친구 요청을 보냈습니다.」 · 버튼 거절 / 수락 |
| 닫기(X·뒤로·바깥) | **팝업만 닫힘 · 거절 아님** (DB pending 유지 · 받은 요청 목록에 남음) · 같은 세션에서 자동 재표시 안 함 |
| 수락 / 거절 | 스낵바 「{이름}님과 친구가 되었습니다.」 / 「{이름}님의 친구 요청을 거절했습니다.」 · 이미 처리된 요청이면 「이미 처리된 친구 요청입니다.」 |

## 운영 DB 사전 확인 (2026-10-25 · 읽기 전용 · PASS)

| 항목 | 결과 |
|---|---|
| `community_friend_requests` 가 `supabase_realtime` publication 에 포함 | **PASS** (1) |
| RLS SELECT = `auth.uid() = requester_id OR addressee_id` (Realtime 수신 권한) | **PASS** |
| 현재 상태 분포 | pending 3 · accepted 68 · rejected 4 · cancelled 6 |

주의: 운영에 기존 **pending 3건**이 있다. 해당 수신 계정으로 검증하면 앱 시작 직후 기존 요청 팝업이 먼저 뜰 수 있다 — 새 요청과 구분해 기록한다.

---

## 0. 사전 조건 (매 세션)

| # | 확인 |
|---|---|
| 0-1 | Production SHA `d372be96` 이후 · 다른 배포 결과와 섞지 않음 |
| 0-2 | 두 기기 앱 완전 종료 → 재시작 · `user_devices.app_version` 기록 |
| 0-3 | 계정 A(보내는 쪽)·B(받는 쪽)는 **서로 친구 아님 · 차단 아님 · 기존 pending 없음** (운영 DB 읽기 전용으로 확인 · 데이터 변경 금지) |
| 0-4 | 매 테스트 기록: 요청 보낸 시각 · 팝업 표시 시각 · request id · DB `status`/`updated_at` (운영 DB 읽기 전용 대조) |
| 0-5 | 기기 조합: A=SAM · B=iPhone, 그리고 반대 A=iPhone · B=SAM (최소 1회씩) |

---

## 1. 필수 항목 (Realtime 실측)

| # | B(받는 쪽) 상태 | 절차 | 기대 결과 |
|---|---|---|---|
| P-1 | 메신저 **친구 탭** 열어 둠 | A 가 검색 → 친구 요청 | B 에 **수 초 내** 중앙 팝업 (새로고침·탭 이동 없이) · 제목·본문 이름 정확 |
| P-2 | **마켓 홈**(메신저 아님) 열어 둠 | A 요청 | B 에 중앙 팝업 (전역 피드 동작) |
| P-3 | **채팅방(1:1 다른 방)** 열어 둠 | A 요청 | 방 위로 중앙 팝업 · 방 입력·타임라인 깨짐 없음 |
| P-4 | P-1 팝업에서 **수락** | — | B 스낵바 「A님과 친구가 되었습니다.」 · 양쪽 친구 목록에 서로 표시 · **A 기기에 스낵바 「B님이 친구 요청을 수락했습니다.」** (A 가 앱을 보고 있을 때) |
| P-5 | 새 요청 팝업에서 **거절** | — | B 스낵바 「…친구 요청을 거절했습니다.」 · 친구 아님 · DB `rejected` |
| P-6 | 새 요청 팝업에서 **X(닫기)** | 이후 B 가 받은 요청 목록 열기 | 팝업만 닫힘 · 목록에 요청 **남아 있음** · DB `pending` · 같은 세션 동안 팝업 재표시 없음 |
| P-7 | B **앱 완전 종료** 상태 | A 요청 → B 앱 실행 | 앱 시작 후 팝업 표시 (시작 시 조회 경로) |
| P-8 | B 팝업이 떠 있는 동안 | A 가 요청 **취소** | B 팝업이 **사라짐** (Realtime 으로 pending 아님 반영) |

## 2. 보조 항목

| # | 절차 | 기대 결과 | 필수 |
|---|---|---|---|
| P-9 | B 가 `/mypage` 에 있을 때 A 요청 | 최대 약 5초 안에 팝업 (지연 장착 정책) | 비차단 |
| P-10 | B 가 통화 중(통화 화면)일 때 A 요청 | 통화 화면에는 팝업 없음 · 통화 종료 후 다른 화면에서 표시 | 비차단 (통화 행렬과 분리 · 통화 동작 변경 아님) |
| P-11 | 두 기기가 거의 동시에 수락·거절 (자연 발생 시) | 늦은 쪽 「이미 처리된 친구 요청입니다.」 | 비차단 NOT_PROVEN 허용 |
| P-12 | 다크 모드 기기에서 팝업 | 글자 보임 (5e2b09b5 회귀 없음) | 필수 |

## 3. 무회귀

| # | 확인 |
|---|---|
| R-1 | 차단한 상대에게 요청 → 거부 (`blocked_target`) · 팝업 없음 |
| R-2 | 친구 탭 「받은 친구 요청」 수·목록 수락/거절 (TEST APP T1~T6 경로) 운영에서도 동일 |
| R-3 | 그룹 초대 하단 알림(같은 Host)이 계속 정상 표시 |

## 4. 기록 표

| 항목 | A 기기 | B 기기 | 앱 버전 | SHA | 요청 시각 (PHT) | 팝업 시각 | request id | DB status | 결과 |
|---|---|---|---|---|---|---|---|---|---|
| P-1 | | | | | | | | | |

## 5. CLOSED 판정

- 필수 P-1~P-8 · P-12 · R-1~R-3 **양방향(SAM↔iPhone) PASS** → 묶음 6 **CLOSED**
- 비차단: P-9 · P-10 · P-11
- 테스트로 생긴 친구 관계·요청 행 정리는 앱 UI(친구 삭제)로만 · 운영 DB 직접 수정 금지
