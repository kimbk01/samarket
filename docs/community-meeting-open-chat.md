# 커뮤니티 모임 오픈채팅 엔진 (카카오 오픈채팅형)

거래 채팅·매장 채팅·필라이프 `open_chat_*` + `chat_rooms`와 **분리**된 `meeting_id` 기반 전용 엔진입니다.

## 1. DB 설계 요약

| 테이블 | 역할 |
|--------|------|
| `community_chat_rooms` | 방 메타, `meeting_id`, 입장 방식(`join_type`), 비밀번호 해시, 최대 인원, 검색 공개, 방장, 신고 임계치, 집계 카운트 |
| `community_chat_room_members` | 방별 닉네임·아바타, `owner` / `sub_admin` / `member`, 참여 상태, 마지막 읽음 |
| `community_chat_messages` | 메시지 본문·타입·답글·블라인드·삭제·메타데이터 |
| `community_chat_message_attachments` | 이미지/파일 스토리지 참조 |
| `community_chat_reports` | 메시지 신고, 카테고리, 처리 상태 |
| `community_chat_bans` | 방 단위 차단(기간/영구), 해제 시 `released_at` |
| `community_chat_notices` | 공지 메타(고정 순서 등), 채팅 `notice` 타입과 `related_notice_id`로 연결 가능 |
| `community_chat_join_requests` | 승인방 입장 신청 |
| `community_chat_logs` | 강퇴·차단·블라인드·역할 변경 등 감사 로그 |

마이그레이션: `supabase/migrations/20260531150000_community_meeting_open_chat_engine.sql`

- RLS는 **활성화만** 되어 있고 정책은 후속 단계에서 멤버십 기준으로 추가합니다. 초기에는 **서비스 롤 API**가 주 진입점입니다.
- 비밀번호는 **평문 저장 금지**. API에서 bcrypt 등으로 `password_hash`만 저장합니다.

## 2. API / 서버 액션 설계 (권장 경로)

네임스페이스 예: `/api/community/meetings/[meetingId]/open-chat/...` (기존 community 미팅 API와 동일 `meetingId` 컨텍스트)

| 단계 | 메서드 | 경로(예) | 설명 |
|------|--------|----------|------|
| 2 | POST | `.../rooms` | 방 생성 (모임 멤버 검증 후). owner 멤버 행 자동 생성 |
| 2 | GET | `.../rooms` | 해당 모임의 방 목록(검색 옵션) |
| 2 | GET | `.../rooms/[roomId]` | 방 상세(공개 메타; 비밀번호 해시 제외) |
| 2 | POST | `.../rooms/[roomId]/join` | 공개 즉시 / 비밀번호 검증 / 승인방은 신청 생성 |
| 2 | POST | `.../rooms/[roomId]/join-requests/[id]/approve` | owner/sub_admin |
| 2 | POST | `.../rooms/[roomId]/join-requests/[id]/reject` | owner/sub_admin |
| 3 | GET | `.../rooms/[roomId]/messages` | 커서/페이지, 블라인드 필터(일반 vs 운영자) |
| 3 | POST | `.../rooms/[roomId]/messages` | text/image/file/reply; 첨부는 스토리지 업로드 후 메타 insert |
| 3 | POST | `.../rooms/[roomId]/read` | `last_read_message_id` 갱신 |
| 4 | GET | `.../rooms/[roomId]/members` | 참여자 목록(닉네임·역할·배지) |
| 4 | PATCH | `.../rooms/[roomId]` | 방 설정 (owner; sub_admin는 정책에 따라 제한) |
| 4 | POST | `.../rooms/[roomId]/members/[userId]/role` | 부방장 지정/해제 (owner) |
| 5 | POST | `.../rooms/[roomId]/messages/[messageId]/blind` | owner/sub_admin |
| 5 | POST | `.../rooms/[roomId]/members/[userId]/kick` | owner/sub_admin |
| 5 | POST | `.../rooms/[roomId]/members/[userId]/ban` | owner/sub_admin + `community_chat_bans` + 로그 |
| 5 | POST | `.../rooms/[roomId]/messages/[messageId]/report` | 일반 회원 |
| 5 | PATCH | `.../reports/[reportId]` | 운영 처리(반려/블라인드/강퇴/차단) |
| 6 | GET | `.../rooms/[roomId]/admin/summary` | 대기 신청·신고·차단·공지 요약 |
| 6 | CRUD | `.../rooms/[roomId]/notices` | 공지 관리 |

모든 변경 요청은 **서버에서** `community_chat_room_members` + `community_chat_bans` + `join_type` + `room.status`를 검증합니다.

## 3. 페이지·컴포넌트 구조 (제안)

- **페이지(얇게)**  
  - `app/(main)/community/meetings/[meetingId]/open-chat/page.tsx` — 방 목록 + 생성 진입  
  - `app/(main)/community/meetings/[meetingId]/open-chat/[roomId]/page.tsx` — 채팅 방 단일 화면

- **기능 컴포넌트** (`components/community-meeting-open-chat/`)  
  - `CommunityOpenChatRoomList.tsx`  
  - `CommunityOpenChatCreateForm.tsx`  
  - `CommunityOpenChatScreen.tsx` — 상단 앱바 / 본문 / 입력  
  - `CommunityOpenChatMessageList.tsx` — 날짜 구분선·시스템·블라인드 처리  
  - `CommunityOpenChatComposer.tsx` — 텍스트·이미지·파일·답글  
  - `CommunityOpenChatMemberSheet.tsx` — 바텀시트 참여자  
  - `CommunityOpenChatAdminMenu.tsx` — owner/sub_admin만  
  - `CommunityOpenChatAdminPanel.tsx` — 신청/신고/차단/공지 (6단계)

- **라이브러리** (`lib/community-meeting-open-chat/`)  
  - `types.ts` (완료)  
  - 이후: `permissions.ts`, `api-client.ts`, `message-mapper.ts` 등 단계별 추가

## 4. 핵심 타입

TypeScript: `lib/community-meeting-open-chat/types.ts`

## 5. 전체 플로우 (구현안)

1. 모임(`meetings`) 참가자가 방 생성 → `community_chat_rooms` + `members`(owner) + `community_chat_logs(room_created)`  
2. 공개방: `join` → 멤버 행 `joined`  
3. 비밀번호방: `join` + 비밀번호 검증 → 멤버 행  
4. 승인방: `join` → `community_chat_join_requests` → 관리자 승인 시 멤버 행 + 로그  
5. 차단 조회: 활성 `community_chat_bans` 있으면 입장 거절  
6. 메시지 전송: `community_chat_messages` (+ 첨부 테이블); 답글은 `reply_to_message_id`  
7. 블라인드: `is_blinded=true`, 일반 API 목록에서 제외(또는 플래그만 내려서 클라이언트 숨김은 보조)  
8. 신고 누적: `report_threshold` 초과 시 자동 큐 또는 운영 알림(비즈니스 규칙은 API에서)  
9. 방 종료: `status=closed`, 신규 메시지/입장 차단 + 시스템 메시지

## 6. 적용 순서 체크리스트

- [x] **1단계**: DB 마이그레이션 + 타입 정의 + 본 문서  
- [x] **2단계**: 방 생성·목록·상세·join(공개/비번/승인)·차단 검증 API  
  - `GET/POST /api/community/meetings/[meetingId]/open-chat/rooms`  
  - `GET /api/community/meetings/[meetingId]/open-chat/rooms/[roomId]`  
  - `POST /api/community/meetings/[meetingId]/open-chat/rooms/[roomId]/join`  
  - 비밀번호: `lib/community-meeting-open-chat/join-password.ts` (scrypt, 의존성 없음)  
- [x] **3단계**: 메시지 목록·전송·읽음  
  - `GET/POST .../open-chat/rooms/[roomId]/messages` (`before`, `limit`, 블라인드·삭제 필터, `attachments` 포함)  
  - `POST .../open-chat/rooms/[roomId]/read` (`{ messageId? }`)  
  - `lib/community-meeting-open-chat/room-access.ts`, `messages-service.ts`  
- [ ] **3b(후속)**: 전용 업로드 URL·스토리지 정책(이미지/파일)  
- [x] **4단계**: 참여자 목록·역할 변경·방 설정  
  - `GET .../open-chat/rooms/[roomId]/members`  
  - `PATCH .../open-chat/rooms/[roomId]` (방장·부방장; 입장 방식·비번은 방장만)  
  - `PATCH .../open-chat/rooms/[roomId]/members/[userId]/role` (`{ "role": "sub_admin" | "member" }`, 방장만)  
  - `lib/community-meeting-open-chat/admin-service.ts`  
- [x] **5단계**: 신고·블라인드·강퇴·차단·신고 처리·임계치 자동 블라인드  
  - `POST .../messages/[messageId]/report` `{ category, detail }`  
  - `POST .../messages/[messageId]/blind` `{ reason? }` (방장·부방장)  
  - `POST .../members/[userId]/kick` · `POST .../members/[userId]/ban` `{ reason?, banUntil? }`  
  - `GET .../reports?status=pending` (운영자)  
  - `PATCH .../reports/[reportId]` `{ status, resolutionNote?, banUntil? }` — `dismissed` | `action_blind` | `action_kick` | `action_ban`  
  - `community_chat_rooms.report_threshold` 이상이면 해당 메시지 자동 블라인드  
  - `lib/community-meeting-open-chat/moderation-service.ts`, `open-chat-api-context.ts`  
- [ ] **6단계**: 운영 패널 UI + 공지 CRUD + 입장 대기/신고/차단 목록  
- [x] **6단계(백엔드)**: 입장 신청·공지·차단 목록·운영 요약 API  
  - `GET .../join-requests?status=pending` · `PATCH .../join-requests/[requestId]` `{ decision, rejectReason? }`  
  - `GET .../notices` (`includeInactive=true` 는 방장·부방장만) · `POST .../notices` · `PATCH|DELETE .../notices/[noticeId]`  
  - `GET .../bans` · `GET .../admin/summary`  
  - `lib/community-meeting-open-chat/ops-service.ts`, `syncCommunityChatPendingJoinCount` (`admin-service`)  
- [ ] **6단계(UI)**: 모바일 운영 화면(요약·목록·승인/공지 편집) — API 준비됨  
- [ ] **후속**: RLS 정책(선택) 또는 API만 사용 정책 명문화  

## 권한 매트릭스 (요약)

| 작업 | owner | sub_admin | member |
|------|-------|-----------|--------|
| 방 삭제/종료 | 예 | 아니오 | 아니오 |
| 방장 위임 | 예(정책 정의) | 아니오 | 아니오 |
| 부방장 지정 | 예 | 아니오 | 아니오 |
| 방 설정·공지·블라인드·강퇴·차단·승인 | 예 | 예 | 아니오 |
| 메시지·답글·신고·본인 삭제 범위 | 예 | 예 | 예 |

(세부는 제품 정책에 맞게 API에서 최종 확정.)
