# DIBAY ADMIN — 채팅 도메인 전면 감사·설계안 (코드·DB·배포 변경 없음)

기준: main `a2319df8` (배달 `1d54a613` 포함) · 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회 2026-10-19 · 판정 PROVEN / DEFECT / MISSING / NOT_PROVEN
범위: 감사·설계만. **Owner 승인 전 채팅·통화 네이티브 수정, DB 구조 변경, main 병합·배포 없음.** 배달 미완료 작업은 섞지 않는다.

---

## 0. 배달 도메인 종료 증거

| # | 종료 기준 | 판정 | 증거 |
|---|---|---|---|
| 1 | 배달 변경만 main 병합 | PASS | PR #72 → `1d54a613`. 공용 파일은 배달 문구·cron 2개만 (PR 본문 「다른 도메인」) |
| 2 | Production 반영 | PASS (로그 증거) | 04:51 UTC 운영 DB 가 신규 대시보드 쿼리(`created_at` 경계 2026-10-12T16:00Z, 200) 수신 — 신규 코드만 발생시키는 쿼리 |
| 3 | 메뉴·대시보드 실제 화면 | NOT_PROVEN | Owner 육안 확인 대기 (Claude 환경에서 운영 도메인 접근 차단·Vercel 403) |
| 4 | 33개 페이지 실제 운영 기능 | NOT_PROVEN | 코드 단위 PASS 만 (배달 보고서) |
| 5 | 서버 권한·상태·감사·금전 무결성 | 코드 PASS | CI `check` PASS, 운영 로그 회귀 없음 |
| 6 | 고객·사장님 앱 연동 | NOT_PROVEN | Cursor 실기기 확인 대기 |
| 7 | Android APK 빌드 | 빌드 PASS / 설치·실행 NOT_PROVEN | GitHub `android` job PASS (PR #72) |
| 8 | iOS 빌드 | 빌드 PASS / 설치·실행 NOT_PROVEN | GitHub `ios` job PASS (PR #72) |
| 9 | 다른 도메인 손상·혼입 | PASS (로그 기준) | 배포 후 Supabase API 5xx 0, DB ERROR 0, 메신저·통화 테이블 요청 정상(4xx 0) |

배포 후 발견된 **기존(배포 전부터) 결함 1건** — 배달 잔여로 기록, 채팅 작업과 섞지 않음:
- `lib/stores/advertising/delivery-ad-operations-action-queue.ts:208-216` 이 `stores.select("name")` 을 조회 (컬럼은 `store_name`) → 매번 400, 배달 광고 처리 대기 항목의 매장명 공란. 03:44(배포 전)에도 동일 발생. 1줄 수정, Owner 지시 시 반영.

**배달 종료 판정:** 3·4·6·7·8 의 Owner·Cursor 확인이 남아 있으므로 **배달 종료 = 대기**. 채팅은 아래 감사·설계만 제출하고 구현은 배달 종료 + 본 설계 승인 후 시작한다.

---

## 1. 채팅 유형별 실제 기능과 DB 구조

### 1.1 운영 데이터 규모 (2026-10-19 읽기 전용)

| 유형 (`community_messenger_rooms.chat_domain`) | 방 | 최근 7일 활동 | 90일 이상 미사용 | 메시지 | 비고 |
|---|---|---|---|---|---|
| 일반 1:1 `general_direct` | 190 | 16 | 127 | 10,353 (call_stub 7,078) | 이미지 67·파일 33·음성 159 |
| 그룹 `group` (private 102 · open 8) | 110 (보관 6, 삭제 5) | 1 | 45 | 796 | |
| 거래 `trade` | 404 | 5 | 280 | 2,091 | 레거시 `chat_rooms` 446 · `product_chats` 440 **10/18 까지 신규 생성** |
| 배달 주문 `store_order` | 810 | 9 | 599 | 5,502 (system 4,057) | 레거시 `order_chat_*` 참조 0, drop 대기 |
| 고객센터 `support_cases` (별도 축) | 34 케이스 (전부 RESOLVED) | 0 | — | 93 | 첨부 없음 |

통화: `community_messenger_call_sessions` 7,181 (1:1 7,149 · 그룹 32). 최근 7일 부재중 40 · 취소 67 · 거절 10 · 정상 종료 108.
신고: `community_messenger_reports` **0건**. Ghost 감사 `community_messenger_admin_oversight_logs` 8건 (마지막 2026-07-05).

### 1.2 공통 구조 (PROVEN)
- **메시지 SSOT = `community_messenger_*`** — 1:1·그룹·거래·주문이 같은 방·메시지·참가자 테이블을 쓴다. 고객센터만 `support_cases`/`support_messages` 별도 축.
- 전송: `POST /api/community-messenger/rooms/[roomId]/messages` (분당 30, dedupe 2.5s) → RPC `community_messenger_send_text_message` → 서버만 Realtime bump (`community-messenger-room-bump:{roomId}`).
- 읽음: 참가자 `last_read_message_id` 커서 + `unread_count` 프로젝션, 메시지별 `community_messenger_message_reads`.
- 메시지 페이지네이션: 메시지 id 커서 `before/after/latest`, 기본 50 / 최대 100.
- 첨부: 버킷 `post-images` (**public=true 확인**), 업로드는 서명 URL, 조회는 public URL. 파일 15MB·허용 목록·매직바이트 검사. 동영상 전용 타입 없음(`file` 로 전송).
- 삭제·편집: 나에게서 숨김, 모두에게서 삭제(24시간 이내), 텍스트 편집, 반응.
- 보존: **보존·purge cron 없음** (상수만 존재 `chat-room-list-lifecycle-policy.ts:4-14`).
- 방 안 검색: 서버 API 없음 — 로드된 메시지만 클라이언트 필터.

### 1.3 유형별 기능 매트릭스 (I 구현 · P 부분 · M 없음)

| 항목 | 일반 1:1 | 그룹 | 거래 | 배달 주문 | 고객센터 |
|---|---|---|---|---|---|
| 생성 | I `direct/start` | I private/open/모임 | I (3원장 동시 생성) | I `ensureStoreOrderMessengerRoom` (주문 생성 시) | I `cases/open` (활성 케이스 재사용) |
| 초대·참여 | — | I 초대·링크·가입요청·비밀번호 | — | 자동 (구매자·사장님) | 자동 |
| 나가기 | P 참가자 물리 삭제 | private: soft `left_at` / open: 물리 삭제 (**불일치**) | I (원장 left_at → 잠금 → CM 삭제) | P ensure 시 재가입 (나가기 무효) | — |
| 종료·삭제 | M (관리자만) | I tombstone | I 거래 흐름 가드 | I 주문 종료 시 전송 차단 | I RESOLVED/ARCHIVED |
| 역할 | owner/member | owner/admin/member, 밴, 인원 2–1000 | seller/buyer (`product_chats`) | customer/owner — **직원 역할 없음** | MEMBER/OWNER/ADMIN/내부메모 |
| 읽음 | I | I + 메시지별 읽음 수 | P **레거시와 max 병합(이중 집계)** | I | P 케이스 단위만 |
| 첨부 | P (영상 타입 없음, public URL) | P | P (레거시 전송은 텍스트만) | P (매장 토글) | **M** |
| 목록 | P bootstrap 500 캡, 커서 없음 | 같음 | P 200 캡 | P 사장님 50 캡 | P 커서 없음, **메시지 무제한 조회** |
| 실시간·푸시 | I `chat_message` | I `group_message`·멘션·공지 | I `trade_message` | I `store_order_message` | I `support_*` |
| 신고·차단 | I CM reports·relations/block | I | P **CM reports + 레거시 `chat_reports` 이원화** | P (공통, 전용 정책 없음) | M |
| 제재 | I 전송 게이트·관리자 숨김 | I | P | P | — |
| 통화 | I 1:1 음성·영상 | I 그룹(≤4, 시트에서, 푸시 없음) | I 판매자 정책(none/voice/voice+video) | I 매장 토글 | M |
| 보관·복원 | P 참가자 `is_archived` | P | P (완료 후 숨김 6h/7d) | — | I archive/unarchive |

### 1.4 중복 저장소 (가장 큰 구조 문제)

| 도메인 | SSOT | 아직 쓰이는 레거시 | 미사용 잔존 |
|---|---|---|---|
| 1:1·그룹 | CM | `group_rooms/group_messages` + `/group-chat` 화면·API 살아 있음 | `meeting_chat_rooms` |
| 거래 | CM (+`product_chats` 상태) | `chat_rooms`·`chat_room_participants`(생성·나가기), `chat_messages`(CM 텍스트 미러), `product_chat_messages`(레거시 send·가격 제안·리스팅 시스템 메시지), `chat_reports`, `chat_event_logs` | — |
| 주문 | CM | 없음 | `order_chat_*` (drop 대기) |
| 고객센터 | `support_*` | — | — |

**스키마 드리프트:** `community_messenger_rooms.domain_identity_key` 는 운영 DB 에 존재하지만 레포 마이그레이션에 컬럼 추가문이 없다 (`domain_identity` 만). 새 환경 재현 불가 → DB 변경 승인 시 보정 마이그레이션 필요.

---

## 2. 기존 채팅 Admin 메뉴·페이지 대응표

| 현재 메뉴 (워크스페이스) | URL | 실제 기능 | 판정 | 개선 후 위치 (제안) |
|---|---|---|---|---|
| 채팅 대시보드 (채팅) | `/admin/messenger` | 방 수·신고 수 7종 | DEFECT: 「메신저 신고」 링크가 거래 신고 화면으로 감, 거래 방 수에 빈 방 포함 | 채팅 대시보드 (§6 재설계) |
| 일반 채팅 (채팅) | `/admin/chats/general` | CM general 200건 | DEFECT: 검색·필터·페이지·URL 없음, 원시 상태값 | 채팅방 › 일반 1:1 |
| 그룹 채팅 (채팅) | `/admin/chats/group` | CM group 200건 | 같음 | 채팅방 › 그룹 |
| 거래채팅 (참조) (채팅) | `/admin/chats/trade?from=messenger` | 거래 목록 | DUPLICATE | 채팅방 › 거래 (단일) |
| 주문 채팅 (참조) (채팅) | `/admin/order-chats?from=messenger` | 주문 채팅 목록 | DUPLICATE | 채팅방 › 배달 주문 (단일) |
| 신고채팅 (채팅) | `/admin/chats/reported` | **거래 신고만** | DEFECT: CM 신고 미포함 | 신고·제재 › 채팅 신고 (단일 큐) |
| 전체채팅 (메신저 고급) | `/admin/chats` | 실제로는 거래만 | DUPLICATE·명칭 오류 | 채팅방 (전체 유형 필터) |
| 커뮤니티 메신저 (메신저 고급) | `/admin/chats/messenger` | KPI·방 목록·통화·신고 처리 | DEFECT: 신고 실처리 큐가 고급 메뉴에 묻힘, 영문 하드코딩, 확인 없는 제재 | 기능 분해 → 채팅방·신고·통화 |
| 메신저 성능 (메신저 고급) | `/admin/chats/messenger-performance` | 프로세스 메모리 지표 | DEFECT: 서버리스에서 값 신뢰 불가 | 시스템 › 메신저 성능 (영속 지표로 교체) |
| 거래채팅 (거래) | `/admin/chats/trade` | **레거시 원장** 목록 | DEFECT (§4 C-1) | 거래 워크스페이스 유지 — CM 방 기준으로 |
| 거래흐름·온도 (거래) | `/admin/trade-flow` | 거래 완료 확정 | OK (방 링크가 사용자 화면) | 유지 |
| 주문 채팅 (배달) | `/admin/order-chats` | 주문 채팅 읽기 | DEFECT(경미): 첨부 미표시, 검색 없음 | 배달 유지 (배달 종료 범위) |
| 고객지원 관제 (고객지원) | `/admin/support` | 상담 처리 | OK | 유지 + 채팅 대시보드 지표 연결 |
| 채팅 가이드 (시스템) | `/admin/docs/chat` | 문서 | — | 유지 |
| (메뉴 없음) | `/admin/chats/[id]`, `/admin/chats/messenger/[id]` | 거래·메신저 상세 | DEFECT (§8) | 채팅방 상세 1개로 통합 |
| (메뉴 없음) | `/admin/chats/trade-complete` | trade-flow 와 동일 | DUPLICATE | 리다이렉트 |
| — | — | Philife DM 관리 | 해당 없음 | Philife DM 저장소 DROP 확인 — 관리 대상 없음 |

고아 API (UI 호출 없음): `/api/admin/chat/reports`, `/chat/reports/[id]/action`, `/chat/block-history`, `/chat/notifications`, `/community-messenger/friend-requests/[id]`.

---

## 3. 관리자 권한·고스트 입장

### 3.1 현재 구현 (PROVEN)
- 권한 키 `chats` 가 정의돼 있으나 **어디에서도 강제하지 않음** — 채팅·메신저·통화 Admin API 전부 `requireAdminApiUser` (관리자면 누구나).
- 고스트 입장: CM 상세 진입/이탈 시 `community_messenger.ghost_enter|exit` 감사(참가자 생성 없음 — 상대에게 보이지 않음). 단 **클라이언트가 호출**(API 직접 호출 시 우회), 사유는 고정 문자열 `admin_console_detail`, 배너는 「Platform Admin 전용」이지만 서버는 일반 관리자 허용.
- 거래·주문 채팅 열람은 **감사 기록 없음**.
- 하드 삭제(`bulk-delete`)가 `reports`·`moderation_actions` 까지 삭제, 감사 없음, 모든 관리자 가능.
- 관리자 메시지 발송: **없음** (고객센터 답변만).
- 통화 강제 종료: 사유·확인·감사 — 모범 사례.

### 3.2 권한 설계안 (Owner 결정 O-C1·O-C8)

| 권한 (신규 세분, `chats` 하위) | 허용 범위 | 기본 부여 |
|---|---|---|
| `chats.meta` | 방 목록·참여자·상태·신고 이력 (메시지 본문 제외) | 채팅 운영 관리자 |
| `chats.content.case` | **신고·분쟁·주문·상담에 연결된 방**의 메시지 열람 (해당 신고/주문 기준) | 채팅 운영 관리자 · 배달 관리자(주문 채팅) · 거래 관리자(거래 분쟁) |
| `chats.moderate` | 방 정지·읽기전용·보관·복구, 메시지 숨김(삭제 아님), 이용자 제재 연결 | 채팅 운영 관리자 |
| `chats.ghost` | 신고·분쟁 연결이 **없는** 사적 방(1:1·그룹) 메시지 열람 | super_admin 만 + (선택) 이중 승인 |
| `chats.intervene` | 방에 「DIBAY 운영팀」 시스템 메시지 발송 | super_admin 또는 명시 부여 |
| 하드 삭제 | 법적 요청 처리 전용 | super_admin + 증거 보존 사본 + L3 |

### 3.3 고스트 입장 통제안 (제안 — 현재 구현과 분리)
1. **사유 필수**: 신고 ID / 분쟁 ID / 주문 ID / 법적 요청 번호 중 하나 + 자유 사유 10자 이상.
2. **범위 제한**: 신고·분쟁 연결 시 해당 시점 전후 메시지 구간만 기본 표시, 전체 열람은 추가 사유.
3. **시간 제한**: 열람 세션 30분, 만료 시 재사유.
4. **서버 기록**: 메시지 본문을 반환하는 **GET 자체**에서 감사 기록 (클라이언트 호출 의존 제거) — 관리자·방·범위·사유·시각.
5. **비가시성 유지**: 참가자 생성 없음(현행 유지), 읽음 상태 변경 없음, 알림 없음.
6. **열람 ≠ 조치**: 고스트 열람 권한으로 메시지 발송·수정·삭제 불가. 조치는 `chats.moderate`·`chats.intervene` 로 별도.
7. **유형별 기본 정책**:

| 유형 | 메시지 열람 근거 | 필요 권한 |
|---|---|---|
| 일반 1:1 · 그룹 | 신고·법적 요청 시에만 | 신고 연결: `chats.content.case` / 연결 없음: `chats.ghost`(super_admin) |
| 거래 | 신고·분쟁·거래 완료 이의 | `chats.content.case` |
| 배달 주문 | 주문 운영 (주문 개입·환불 분쟁) | `chats.content.case` (배달 관리자 포함) |
| 고객센터 | 상담 업무 자체 | 상담 담당 관리자 (현행) |

8. **약관·개인정보**: 운영 목적 열람 조항이 이용약관·개인정보처리방침에 있는지 Owner 확인 필요 (O-C1).

---

## 4. 도메인 ↔ 채팅 Admin 동일 데이터 연동

| 화면 | 방 ID 출처 | 메시지 | 방 생성 | 읽음 | 첨부 | Admin 조치 | 판정 |
|---|---|---|---|---|---|---|---|
| 고객 주문 채팅 | `store_orders.community_messenger_room_id` → `store_order:{id}` 키 | CM | 예 (정식 ensure) | 예 | 예 | — | PROVEN |
| 사장님 주문 채팅 | 같은 함수 | CM | 예 | 예 | 예 | — | PROVEN |
| 배달 Admin 주문 채팅 | FK 만 (대체 키 없음) | CM 300건 | 아니오 | 아니오 | **미표시** | 읽기 전용 | DEFECT C-7 |
| 채팅 Admin (메신저 상세) | CM room id | CM | 아니오 | 아니오 | 표시 | 차단·숨김·고스트 | DEFECT: 도메인 구분 없음·주문 링크 없음 |
| 거래 사용자 화면 | `trade_item:`/`trade_pc:` → CM | CM (+텍스트 레거시 미러) | 예 | CM + 레거시 max | 예 | — | P |
| 거래 Admin / 전체채팅 | **레거시 `chat_rooms`/`product_chats`** | **레거시 원장** | 아니오 | — | **없음** | **레거시에만 반영 — 사용자 방에 미반영** | DEFECT C-1 (P0) |
| 고객센터 (고객·사장님·Admin) | `support_cases` | `support_messages` | 예 | 케이스 단위 | 없음 | 답변·상태 | PROVEN |

**설계 원칙 (SSOT):** 조회 화면은 도메인 Admin·채팅 Admin 양쪽에 둘 수 있으나
- 방 ID = CM `room_id` 하나, 도메인 키(`order_id`·`trade/product_chat_id`·`case_id`)로 양방향 해석,
- 메시지·첨부·참여자·읽음 = CM 서비스 함수 1벌 (`lib/admin-community-messenger` 를 공용 조회 계층으로),
- 조치(정지·숨김·제재) = 채팅 Admin 서버 함수 1벌, 도메인 Admin 은 같은 API 호출,
- 각 화면은 `returnTo` 로 원래 도메인 화면 복귀.

복귀 흐름 결함: 주문 상세 → 채팅만 보존. 목록 → 채팅, 채팅 → 주문 상세, 거래 상세, 메신저 목록, 고객센터 선택 케이스는 필터·검색·선택 유실 (C-11).

---

## 5. 채팅·통화·푸시 Android/iOS 연결 현황

- **기준 문서 (HARD LOCK):** `docs/dibay-chat-call-current-normal-hard-lock.md` (A Native · B 서버 writer · C 통화→채팅 · D 표시 동결, CALL PRODUCT CLOSED = NO), 세부 `docs/dibay-call-authority-lock.md`. **채팅 Admin 작업은 이 잠금을 해제하지 않는다.**
- 1:1 음성·영상: Android 네이티브 Runtime (실기기 LOCK), iOS CallKit+PushKit (Owner 승인 수준). ConnectionService 미사용.
- 그룹 통화: 웹 SFU 오버레이, ≤4명, **수신 푸시·네이티브·백그라운드 없음** (정책), 실기기 NOT_PROVEN.
- 통화 → 채팅: 종료 시 `call_stub` 1건 (세션당 idempotent), 방의 유일한 미확인 근거. 부재중 Bell 없음.
- 채팅 유형별 통화 버튼: 1:1 항상 · 그룹 시트(권한) · 거래 판매자 정책 · 주문 매장 토글 · 고객센터 없음.
- 푸시 종류: `chat_message` · `group_message`/멘션/공지 · `trade_message` · `store_order_message` · `missed_call` · `incoming_call_signal` · `support_*`. 탭 이동은 모두 `/community-messenger/rooms/{id}`.
- 레거시 앱: 웹은 즉시 반영, 네이티브는 재설치 필요. 서버 페이로드는 키 추가만 (삭제 금지).

**결함·위험 (채팅 Admin 변경 시 회귀 주의)**
- C-13 그룹 통화 푸시 없음 (정책 확인), 부재중 알림 `void` 호출로 서버리스 중단 가능, 부재중이 항상 `general_direct` 로 분류.
- C-14 url/envelope 없는 페이로드에서 Android·웹 이동 경로 불일치 (trade·group·missed_call).
- 회귀 핫스팟: `room_status`·`is_readonly`·`allow_member_call`·`chat_domain`(통화 거부 조건과 직결), `call_stub` 숨김·삭제(unread 붕괴), 강제 종료는 `updateCommunityMessengerCallSession` 경유 필수, `DibayAppRouteGuard` 허용 루트. 필수 게이트: `verify:call-authority-contract`, `verify:call-messenger-restore-hard-lock`.

---

## 6. 채팅 대시보드·운영 모니터링 설계

원칙 (배달과 동일): 지표 정의는 `lib/admin/metrics/chat-metrics.ts` 단일 정의, **현재 처리 업무(최근 기간)와 누적·장기 위험 분리**, 값 없음 = 「확인 불가」, 모든 지표는 같은 필터의 목록으로 이동.

| 구역 | 지표 (id) | 출처 | 이동 |
|---|---|---|---|
| 지금 처리할 일 | `chat.reports_open` (CM + 레거시 거래 신고 + reports chat_room 합산, 유형별) | 3개 신고 테이블 | 신고·제재 큐 `?status=open&type=` |
| | `chat.support_waiting_admin` | `support_cases` WAITING_ADMIN/OPEN | `/admin/support?tab=ACTIONABLE` |
| | `chat.rooms_blocked_review` (정지 후 검토 필요) | rooms `room_status=blocked` + 사유 | 채팅방 `?status=blocked` |
| 운영 위험 | `chat.push_failed_24h` (유형별) | `notification_deliveries` status=failed | 푸시 실패 목록 (신설 필요) |
| | `chat.call_failed_24h` (`ended_reason` failed_*) | `call_sessions.ended_reason` | 통화 기록 `?reason=failed` |
| | `chat.call_stuck_ringing` | ringing > timeout | 통화 기록 `?status=ringing` |
| | `chat.legacy_trade_writes_24h` (정리 전까지) | `chat_rooms`·`product_chat_messages` 신규 | 거래 채팅 정합 점검 |
| 현재 상태 | 유형별 방 (활성 7일 / 보관 / 정지 / 삭제) | rooms `chat_domain`·`room_status`·`last_message_at` | 채팅방 `?domain=&activity=` |
| | 유형별 메시지·첨부 (최근 7일) | messages × rooms | — |
| | 통화 (최근 7일 종료·부재중·거절·취소) | call_sessions | 통화 기록 |
| 장기·저장 | 90일 이상 미사용 방 (유형별) | `last_message_at` | 채팅방 `?idle=90` |
| | 저장 용량 (메시지·스냅샷·첨부) | pg_total_relation_size · storage | 시스템 |

현재 운영 값 예시: 처리 대기 신고 0 · 상담 대기 0 · 90일 미사용 방 1,060 (주문 599 · 거래 280 · 일반 127 · 그룹 45) · 7일 부재중 40.
**주의:** 「메신저 성능」의 프로세스 메모리 지표는 대시보드 근거로 쓰지 않는다 (C-12).

---

## 7. 장기 채팅 저장·페이지네이션·복구 정책

| 항목 | 현재 | 개선안 | 결정 |
|---|---|---|---|
| 보존 기간·삭제 | 정책·cron 없음 (상수만) | **삭제하지 않음 유지**. 기간 확정은 법무 검토 후 | O-C4 |
| 장기 보관 | 참가자 `is_archived`, 그룹 archived | 방 단위 `archived` 상태 + 관리자 복원 (기존 컬럼 사용) | 구현 단계 |
| Admin 메시지 조회 | 오래된 순 200/300건 고정 → **최신 메시지 잘림** | 사용자와 같은 id 커서 `latest`/`before` 재사용 | 구현 단계 |
| Admin 방 목록 | 200 캡, 커서 없음 | `last_message_at, id` keyset 페이지 + URL 상태 | 구현 단계 |
| 서버 메시지 검색 | 없음 | 관리자 전용: 방 내 기간·발신자·유형 필터 (본문 전문 검색은 인덱스 필요 → DB 승인) | O-C11 |
| 첨부 접근 | public 버킷 URL | 비공개 버킷 + 방 멤버십 서명 URL (기존 URL 호환 기간 필요) | O-C3 |
| 탈퇴·정지 | 메시지 유지, 표시 처리 미확인 | 탈퇴자 표시명 마스킹 확인·정책화 | O-C4 |
| 관리자 보관 기록 | 거래 `chat_event_logs`, CM `audit_logs` 혼재 | `audit_logs` 단일 | 구현 단계 |
| 용량·백업 | 스냅샷 테이블이 메시지보다 큼 (room_bootstrap 31MB > messages 15MB) | 스냅샷 TTL 검토 (성능 트랙과 협의) | 확인 |
| 목록 → 상세 → 원 도메인 → 복귀 | 대부분 유실 | `useAdminListQuery` + `returnTo` (배달 기준 재사용) | 구현 단계 |

---

## 8. 페이지별 UI/UX·CTA 결함과 우선순위

### P0 (데이터·보안)
- **C-1** 거래 Admin 이 레거시 원장을 읽고 조치도 레거시에만 반영 → 사용자 방 정지·숨김 불가, 첨부 미표시, 메시지 누락.
- **C-2** `chats` 권한 미적용 → 모든 관리자가 모든 사적 메시지 열람. 고스트 감사가 클라이언트 트리거·형식 사유.
- **C-3** 하드 삭제가 신고 증거까지 삭제, 감사 없음, 모든 관리자 가능.
- **C-4** 첨부 public URL — URL 유출 시 방 멤버십과 무관하게 열람.

### P1 (운영 기능)
- C-5 메시지 숨김·신고 조치: 확인 팝업·상태 조건·감사 없음, 중복 클릭 가능, 「기각」 없음.
- C-6 상세 메시지 오래된 순 N건 → 최신 잘림.
- C-7 주문 채팅 Admin: FK 없는 과거 주문 방 미조회, 첨부 미표시, 메신저 Admin 과 권한 이원화, 「최대 120건」 문구 불일치.
- C-8 거래 3원장 기록·unread 이중 집계, 레거시 `chat_reports` 와 CM 신고 이원화.
- C-9 레거시 `group_*` 축과 `/group-chat` API 생존.
- C-10 잘못된 링크 3건 (신고 보기 `targetId`, 대시보드 메신저 신고, 회원→메신저 `q=userId`), 중복 메뉴 5건, 개발자 용어 배너·영문 하드코딩·원시 상태값, 「테스트 데이터 정리」 링크 상시 노출.
- C-11 목록 페이지네이션·URL 상태·returnTo 부재.
- C-12 메신저 성능 지표가 프로세스 메모리.

### P2 (정합·잔여)
- C-13·C-14 통화·푸시 (§5), C-15 방 목록 500 캡·서버 검색 없음, C-16 고객센터 첨부 없음·메시지 무제한 조회, C-17 `domain_identity_key` 마이그레이션 누락, C-18 주문 채팅 레거시 생성 API 공개(`rooms` POST `storeOrderId`), C-19 주문 채팅 나가기 후 재가입, C-20 Realtime 이 `audit_logs` 전체 구독.

공통 UI 기준은 배달에서 만든 것을 그대로 재사용: `AdminStateViews` 상태 4종, `confirmAdminAction` L1/L2/L3, 상태 라벨 레지스트리, 결과 배너, `AdminTechDetails`, 제목=메뉴명.

---

## 9. 보안·개인정보·운영 위험과 Owner 결정 사항

| ID | 결정 사항 | 권장 | 근거 |
|---|---|---|---|
| O-C1 | 고스트 입장 정책 (등급·사유·범위·시간·이중 승인), 약관 근거 | §3.3 안 + super_admin 한정, 약관 조항 확인 | C-2 |
| O-C2 | 관리자 메시지 개입 범위 | 「DIBAY 운영팀」 시스템 메시지만, 사용자 명의·수정 불가 | 신규 |
| O-C3 | 첨부 비공개 전환 (서명 URL) | 승인 — 기존 URL 호환 기간 두고 단계 전환 | C-4 |
| O-C4 | 보존 기간·탈퇴자 처리 | 확정 전까지 삭제 없음 유지, 법무 검토 | §7 |
| O-C5 | 거래 레거시 원장 정리 (쓰기 중단 → 읽기 전용) | 승인 — 브리지 LOCK 해제 절차 필요 | C-1·C-8 |
| O-C6 | 레거시 `group_*`·`order_chat_*` DROP | 쓰기 경로 차단 후 보관, DROP 은 별도 승인 | C-9 |
| O-C7 | 하드 삭제 존치 | super_admin + 증거 보존 + L3, 또는 제거 | C-3 |
| O-C8 | `chats` 권한 세분 (§3.2) | 승인 | C-2 |
| O-C9 | 주문 채팅 Admin 조치 권한 | 배달 Admin 읽기 + 채팅 Admin 조치 (같은 API) | C-7 |
| O-C10 | 채팅 신고 단일 큐 | 승인 (CM + 레거시 + reports 통합 조회) | C-8 |
| O-C11 | 관리자 메시지 본문 검색 (인덱스) | 보류 — 필요 시 DB 승인 | §7 |
| O-C12 | 채팅 메뉴 재편 (§2 개선 후 위치, CUT J 개정) | 승인 | §2 |

---

## 10. 구현·검증·배포 순서 (배달 종료 + 본 설계 승인 후)

| 단계 | 내용 | 선결 | 검증 |
|---|---|---|---|
| CH0 | 권한 게이트(`chats.*`)·서버 측 열람 감사·하드 삭제 통제 | O-C1·C7·C8 | 권한 403 테스트, 열람 감사 서버 기록 테스트 |
| CH1 | 데이터 SSOT 정렬: 거래 Admin → CM 방 기준 조회·조치, 주문 채팅 대체 키·첨부 표시, 메시지 최신 커서 | O-C5·C9 | 같은 방 ID 왕복 테스트 (앱·도메인 Admin·채팅 Admin) |
| CH2 | 메뉴 재편 (중복 제거·명칭) | O-C12 | CUT J 게이트·경로 보존 |
| CH3 | 페이지 UI/CTA (C-5·C-10·C-11) | 없음 | 배달과 같은 CTA 9단계 코드 검증 |
| CH4 | 채팅 대시보드 (§6) | CH1 | 지표 값 = 목록 건수 일치 테스트 |
| CH5 | 장기 보관·페이지네이션·복귀 (§7) | O-C4 | 페이지 경계·복귀 테스트 |
| CH6 | 첨부 비공개 전환 | O-C3 | 앱 첨부 표시 회귀 (Android·iOS·구버전) |
| CH7 | 레거시 정리 (쓰기 중단 → 보관) | O-C5·C6, DB 승인 | 거래 unread·배지·푸시 회귀 |

모든 단계 공통: 통화 HARD LOCK 미해제, 네이티브 변경 없음(필요 시 원인 증명 후 별도 승인), `verify:call-authority-contract`·`verify:call-messenger-restore-hard-lock` 필수, 결과는 브랜치 / Preview / Production / 실기기 구분 보고.

**채팅 Admin 완료 기준 (배달과 동일 8항목):** 메뉴 · 페이지 UI/UX · CTA 9단계 · 유형별 운영 시나리오 · 도메인 동일 데이터 연동 · 대시보드 지표 일치 · 앱(Android·iOS) 반영 · 권한·열람 감사·무결성 — 모두 PASS, 실측 안 된 항목은 NOT_PROVEN.
