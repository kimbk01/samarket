# 모임 전용 오픈채팅 (LINE UI) — 구조 분석·설계·구현 순서

거래/매장/기존 통합 채팅(`chat_rooms` / `chat_messages`) 및 필라이프 오픈채팅과 **분리된**, **모임(meeting) 전용** 오픈채팅 설계서입니다.  
(요청하신 작업 **시작 전** 제출용 1~7항 + 8단계 구현 순서)

---

## 1. 기존 채팅 구조 분석 (요약)

| 구역 | 저장소·메타 | UI | 비고 |
|------|-------------|-----|------|
| **거래** | `product_chats` + `chat_rooms`(item_trade) + `chat_messages` | `ChatDetailView`, `/chats`, `/api/chat/rooms/*` | 상품·거래 상태·예약 연동 |
| **매장** | `chat_rooms`(store_order) + 동일 메시지 파이프 | `StoreOrder*` 컴포넌트 | 주문·배달 맥락 |
| **필라이프 오픈채팅** | `open_chat_rooms` → **`linked_chat_room_id` → `chat_rooms`** | 필라이프 `/philife/open-chat/*`, `lib/open-chat/*` | 메시지는 통합 `chat_messages` |
| **모임(구 통합)** | `meetings.chat_room_id` + `group_meeting` 등 `chat_rooms` | `MeetingChatTab` 등 | 메인/부가 방이 `chat_rooms` 트리 |
| **모임 오픈채팅(최근 엔진)** | **`community_chat_*`** (전용 메시지 테이블) | API만 존재 (`/api/.../open-chat/*`) | `chat_rooms` 비연동 |

공통점: 거래·매장·(대부분의) 필라이프·모임 메인 채팅은 **같은 메시지 파이프(`chat_messages`)와 권한 모델**에 의존합니다.

---

## 2. 왜 기존 구조를 “수정 이어붙이기”로 재사용하면 안 되는지

1. **도메인 결합**: 거래/매장은 `item_id`, `store_order_id`, 예약·주문 상태와 강하게 묶여 있어, 모임 오픈채팅 UX(자유 입장·방별 닉네임·운영 메뉴)를 넣을 때 분기가 기하급수적으로 늘어납니다.  
2. **메시지 스키마 한계**: `chat_messages`는 필라이프 오픈채팅용 `metadata`, 관리자 숨김 등이 이미 얹혀 있어, 요청하신 `member_id`, `intro_message`, LINE형 시스템 메시지·날짜 구분선 전용 필드를 **깨끗하게** 넣기 어렵습니다.  
3. **이중 진실 공급원**: 같은 화면에서 “통합 채팅 + 오픈채팅”을 섞으면, 목록/읽음/알림이 **이중 집계**되기 쉽습니다.  
4. **오류 반복**: 과거에도 `room_type`·`context_type` 분기로 버그가 나온 전례가 있어, **새 제품면은 새 파이프**가 유지보수에 유리합니다.  
5. **요구사항 정합**: “오픈프로필 전용 필드”, `join_type` 확장(`password_approval`), `last_seen_at`, `muted_until` 등은 **전용 멤버/메시지 테이블**이 맞습니다.

→ **결론**: 이번 모임 오픈채팅은 **`chat_rooms` / `chat_messages` / 기존 `ChatDetailView` 흐름을 확장하지 않고**, API·UI·DB를 **전용 트랙**으로 둡니다.

---

## 3. 오픈채팅 전용 DB 설계안

### 3.1 테이블 물리 이름 (중요)

요청하신 논리 이름 `open_chat_rooms` 등은 **이미** 필라이프용으로 `public.open_chat_rooms`가 존재합니다 (`20260402100000_open_chat_schema.sql`, `chat_rooms` 연동).

**권장 물리 접두사 (충돌 방지):** `meeting_open_chat_*`  
(개념·API에서는 “모임 오픈채팅”으로 통일하고, DB만 접두사로 구분)

아래는 **논리 모델 = 요청 스펙**, **권장 물리명 = `meeting_open_chat_*`** 로 매핑합니다.

### 3.2 테이블 정의 (권장 물리명)

**`meeting_open_chat_rooms`** (논리: `open_chat_rooms`)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| meeting_id | uuid FK → meetings | |
| title | text | |
| description | text | |
| thumbnail_url | text | |
| join_type | text CHECK | `free`, `password`, `approval`, `password_approval` (초기 3종만 구현 가능) |
| password_hash | text | `join_type`이 password 계열일 때만 NOT NULL 권장 |
| max_members | int | |
| is_active | boolean | 방 종료 시 false |
| is_searchable | boolean | |
| owner_user_id | uuid | |
| allow_rejoin_after_kick | boolean | 강퇴 후 재입장 정책 (요청: 설정값) |
| last_message_preview | text | 리스트용 (선택, 비정규화) |
| last_message_at | timestamptz | 리스트용 |
| created_at / updated_at | timestamptz | |

**`meeting_open_chat_members`** (논리: `open_chat_members`)

| 컬럼 | 설명 |
|------|------|
| id | uuid PK |
| room_id | FK |
| user_id | |
| open_nickname | 방별 닉네임 |
| open_profile_image_url | |
| intro_message | 소개 |
| role | `owner`, `sub_admin`, `member` |
| status | `active`, `pending`, `left`, `kicked`, `banned` (DB CHECK) |
| joined_at | |
| last_seen_at | |
| muted_until | 운영 “메시지 제한” 등 |
| kicked_at / banned_at | 감사·표시용 |

UNIQUE `(room_id, user_id)` 유지. `banned`는 `meeting_open_chat_bans`와 정합.

**`meeting_open_chat_messages`**

| 컬럼 | 설명 |
|------|------|
| id, room_id | |
| user_id | null 허용(system) |
| member_id | FK → members (발화 시점 멤버 스냅샷, 선택이나 강력 권장) |
| message_type | text, image, file, notice, system, reply |
| content | 본문(또는 JSON 메타 병행 시 jsonb 추가 가능) |
| reply_to_message_id | |
| is_blinded, blinded_reason, blinded_by | |
| created_at, updated_at, deleted_at | |

**`meeting_open_chat_attachments`**

| message_id, file_type, file_url, file_name, file_size, sort_order |

**`meeting_open_chat_join_requests`**

| room_id, user_id, intro_message, status pending/approved/rejected, handled_by, handled_at, created_at |

**`meeting_open_chat_reports`**

| room_id, message_id, reporter_user_id, target_user_id, report_reason, report_detail, status pending/reviewed/actioned/rejected, handled_by, handled_at, created_at |

**`meeting_open_chat_bans`**

| room_id, user_id, reason, banned_by, banned_at, expires_at, is_active |

**`meeting_open_chat_notices`**

| room_id, message_id (선택: 채팅에 올린 공지 메시지와 연결), title, content, is_pinned, created_by, created_at |

**`meeting_open_chat_logs`**

| room_id, actor_user_id, target_user_id, action_type, action_detail (jsonb 권장), created_at |

### 3.3 기존 `community_chat_*` 와의 관계

- **삭제하지 않음** (임의 삭제 금지).  
- 신규 LINE UI·신규 API는 **`meeting_open_chat_*` 전용**으로 연결.  
- 이후 제품 결정으로 `community_chat_*` 데이터 마이그레이션 또는 API 폐기를 별도 계획으로 둡니다.

---

## 4. 타입 정의 (TypeScript 제안)

파일: `lib/meeting-open-chat/types.ts` (신규)

- `MeetingOpenChatJoinType` = `'free' | 'password' | 'approval' | 'password_approval'`
- `MeetingOpenChatMemberRole`, `MeetingOpenChatMemberStatus`
- `MeetingOpenChatMessageType`
- Row 타입: `MeetingOpenChatRoomRow`, `MeetingOpenChatMemberRow`, `MeetingOpenChatMessageRow`, …
- API 응답용 DTO: 비밀번호 해시 제외, 리스트용 `lastMessage`, `unreadCount`, `participantCount`, `hasNoticeBadge` 등

---

## 5. 폴더 / 파일 구조 제안

```
lib/meeting-open-chat/
  types.ts
  permissions.ts          # 서버 권한 매트릭스
  password.ts             # 기존 scrypt 유틸 최소 재사용 또는 복사 1회
  rooms-service.ts
  messages-service.ts
  members-service.ts
  moderation-service.ts
  ops-service.ts

app/api/community/meetings/[meetingId]/meeting-open-chat/
  rooms/route.ts                    # GET 목록, POST 생성
  rooms/[roomId]/route.ts           # GET 상세, PATCH 설정
  rooms/[roomId]/join/route.ts
  rooms/[roomId]/messages/route.ts
  rooms/[roomId]/messages/[messageId]/report/route.ts
  ... (운영·신고·공지는 동일 패턴으로 meeting-open-chat 네임스페이스)

app/(main)/community/meetings/[meetingId]/meeting-open-chat/
  page.tsx                          # 방 리스트 (얇게)
  [roomId]/page.tsx                 # 채팅 상세 (얇게)
  [roomId]/create/page.tsx          # 방 생성 (선택)

components/meeting-open-chat/
  line/
    LineOpenChatListScreen.tsx
    LineOpenChatRoomScreen.tsx
    LineOpenChatHeader.tsx          # ★ sticky 헤더 (썸네일·제목·인원·3아이콘)
    LineOpenChatNoticeStrip.tsx
    LineOpenChatMessageList.tsx
    LineOpenChatComposer.tsx        # +, 이미지, 파일, 입력, 전송
    LineOpenChatDateDivider.tsx
    LineOpenChatSystemBubble.tsx
    LineOpenChatBlindPlaceholder.tsx
  sheets/
    LineOpenChatParticipantSheet.tsx    # ★ 참여자 목록
    LineOpenChatProfileSheet.tsx        # ★ 상대/참여자 프로필
    LineOpenChatOperatorMenuSheet.tsx   # ★ 운영자 메뉴
  hooks/
    useMeetingOpenChatRoom.ts
    useMeetingOpenChatMessages.ts
```

- 기존 `components/chats/*` **import 하지 않음** (공통 토큰·색만 `lib/ui` 등 최소 공유 가능).

---

## 6. 화면 구조 제안 (LINE 기준)

### A. 방 리스트

- 상단: 뒤로 / 모임 홈, 검색, **새 방** FAB 또는 우측 버튼  
- 카드: 썸네일, 제목, 마지막 메시지·시간, 안읽음, 참여자 수, 공지 뱃지, `free|password|approval` 뱃지

### B. 방 상세 (핵심)

- **Sticky 헤더** (`LineOpenChatHeader`): 뒤로 · 썸네일 · 제목 한 줄 · 참여자 수 · **[검색 | 참여자 | 메뉴]**  
- 본문: 공지 고정 → 날짜 구분 → 메시지/시스템/블라인드 플레이스홀더 → 답글 UI  
- 하단: LINE식 입력줄 (+ / 이미지 / 파일 / 입력 / 전송)

### C. 참여자 목록

- 헤더 “참여자”에서 열리는 **바텀시트 또는 우측 패널** (`LineOpenChatParticipantSheet`)  
- 역할 배지, 닉네임, (선택) intro, last_seen  
- 탭: 일반 / 운영자 액션 분기는 **서버 권한 + 클라이언트 표시**

### D. 프로필 보기 (필수)

- `LineOpenChatProfileSheet`: 큰 아바타, 닉네임, 역할, 소개, 참여일, 최근 활동  
- 일반: 신고  
- 운영: 부방장 지정/해제, (정책에 따라) 메시지 제한, 강퇴, 차단, 블라인드 이력 링크

### E. 운영자 메뉴

- `LineOpenChatOperatorMenuSheet`: 공지 관리, 승인 대기, 신고 목록, 차단 목록, 방 설정, 참여자 관리 진입

---

## 7. 단계별 구현 순서 (8단계)

| 단계 | 내용 |
|------|------|
| **1** | DB 마이그레이션 (`meeting_open_chat_*`) + `lib/meeting-open-chat/types.ts` + `permissions.ts` + 서비스 롤 API 골격 |
| **2** | 방 생성 / 입장 (`free` → `password` → `approval` → 이후 `password_approval`) + 차단·강퇴 재입장 플래그 |
| **3** | **LINE 스타일 헤더** 단독 컴포넌트 + sticky + 라우트 `[roomId]` 껍데기 |
| **4** | 메시지 리스트 / 전송 / 날짜 구분 / 시스템 메시지 삽입 훅 |
| **5** | 참여자 목록 시트 + 목록 API 연동 |
| **6** | 상대 프로필 시트 + 신고 진입 (회원 실명·전화 미노출) |
| **7** | 공지 / 신고 / 블라인드 / 강퇴 / 차단 API + UI 연결 |
| **8** | 운영자 메뉴 시트 + 승인 대기·차단·신고 목록 화면 |

---

## 8. 서버 권한 (반복 강조)

- 모든 쓰기·민감 읽기는 **API에서** `role` + `status(active만 발화 등)` + `ban` 검증.  
- 클라이언트는 버튼 숨김만으로 끝내지 않음.

---

## 9. 다음 액션 (저장소 기준)

1. 본 문서 기준으로 **`meeting_open_chat_*` 마이그레이션** 초안 작성  
2. `app/api/.../meeting-open-chat/*` 라우트 신설 (`community_chat_*` API와 URL 분리)  
3. `LineOpenChatHeader` → `ParticipantSheet` → `ProfileSheet` → `OperatorMenu` 순으로 UI 착수  

이 문서는 **기존 채팅 수정이 아니라 전용 신규 트랙**으로의 전환을 명시합니다.
