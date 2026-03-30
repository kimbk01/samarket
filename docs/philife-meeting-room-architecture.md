# 필라이프 모임방 확장 설계

## 왜 필요한가

현재 `필라이프 모임`은 `meetings + meeting_members + group_meeting chat` 조합으로 동작하지만, 실제 운영형 모임방으로 보기에는 다음이 부족하다.

- 가입 방식이 `open / approve` 정도만 있어 비밀번호/초대제 요구를 담지 못함
- 참여자 상태가 단순해서 승인, 거절, 강퇴, 재가입 금지 흐름이 약함
- 공지/운영 로그/운영자 권한(공동 운영자) 구조가 없음
- 모임 차단과 채팅 참여자 상태가 DB 차원에서 강하게 묶여 있지 않음

## 이번 확장 목표

- `meetings` 기반은 유지한다
- `trade` 채팅 모델을 끌어오지 않고 `필라이프 모임방`을 독립 도메인으로 키운다
- 운영 중 문제가 나기 쉬운 부분을 DB 레벨에서 먼저 막는다
- 기존 `join_policy`, `meeting_members.status`, `group_meeting` 채팅과 호환되게 만든다

## 추가되는 핵심 개념

### 1. 입장 정책

- `entry_policy`
- 허용값: `open`, `approve`, `password`, `invite_only`
- 레거시 `join_policy` 와 양방향 호환

### 2. 멤버 역할/상태

- 역할: `host`, `co_host`, `member`
- 상태: `pending`, `joined`, `left`, `kicked`, `banned`, `rejected`
- 승인/거절/강퇴/퇴장 시각과 처리자 기록 보존

### 3. 운영 테이블

- `meeting_join_requests`
  가입 요청 이력
- `meeting_member_bans`
  모임 단위 차단
- `meeting_notices`
  상단 공지/고정 공지
- `meeting_events`
  운영 로그

## 운영상 중요하게 본 문제

### 승인제/초대제의 무단 입장

앱 코드만 믿으면 잘못된 API 호출이나 오래된 클라이언트에서 자동 입장이 발생할 수 있다. 그래서 DB 트리거에서 `requires_approval` 상태의 직접 `joined` 진입을 차단한다.

### 차단 후 채팅방 잔류

강퇴/차단된 사용자가 `meeting_members` 에서는 빠졌는데 `chat_room_participants` 에는 남는 상황이 생기면 운영 문제가 커진다. 그래서 멤버 상태 변경 시 채팅 participant 를 같이 비활성화하도록 동기화한다.

### 카운터 표류

참여자 수, 대기자 수, 차단 수, 공지 수를 앱에서만 관리하면 쉽게 어긋난다. 그래서 `refresh_meeting_room_stats()` 로 DB 재계산 기준을 둔다.

### 운영자 권한 과소/과다 노출

공지, 차단, 가입 요청 조회는 아무 참여자나 다 볼 수 있으면 안 된다. 그래서 `can_manage_meeting()` 기준으로 운영 권한을 묶는다.

## 이번 SQL이 해주는 것

- `meetings` 에 운영 정책 컬럼 추가
- `meeting_members` 역할/상태 확장
- 공지/가입요청/차단/이벤트 테이블 생성
- 운영 카운터 재계산 함수 추가
- 멤버 상태와 채팅 participant 최소 동기화
- 운영 로그 자동 적재
- RLS 정책 추가

## 이번 SQL이 아직 하지 않는 것

- 비밀번호 해시 생성 로직
  이건 앱/API에서 안전하게 넣어야 함
- 승인/거절/강퇴 UI
- 공지 작성/수정 UI
- 공동 운영자 관리 UI
- 참석 체크 UI

## 코드 반영 우선순위

1. 모임 상세 API가 `entry_policy`, `joined_count`, `pending_count`, `notice_count`, `last_notice_at` 를 내려주도록 확장
2. 참여 API를 `가입 요청` 기준으로 재작성
3. 운영자 패널에서 `승인 / 거절 / 강퇴 / 차단 / 공지` 처리
4. 채팅 헤더에 공지/정원/운영 상태 표시
5. 관리자 페이지에 모임 운영 이벤트 로그 노출

## 적용 파일

- 마이그레이션: `supabase/migrations/20260329143000_philife_meeting_room_upgrade.sql`

## 적용 전 체크

- 기존 필라이프/커뮤니티 관련 선행 마이그레이션이 먼저 적용되어 있어야 함
- `meetings`, `meeting_members`, `chat_rooms`, `chat_room_participants` 가 실제 DB에 있어야 함
- 스테이징 또는 백업 후 적용 권장
