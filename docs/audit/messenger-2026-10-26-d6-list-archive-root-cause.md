# D-6 보관 방 목록 반영 — 전 경로 원인·설계 (2026-10-26 PHT)

땜질 4건(`f320d9cf9`·`ee0459aca`·`340d4e287`·`72122e9ad`)은 `767dba206` 으로 리버트. 서버 ①`a4b4a04fd`(DB 함수, 운영 적용)·②`345dffb22`(통화 기록)는 유지.

## 1. 보관 값의 진실 = 서버 `community_messenger_participants.is_archived`

쓰는 곳(모두 participants UPDATE):
- 받은 메시지·부재중 → `community_messenger_send_text_message` · `dibay_append_room_message_atomic`(①) · `service.ts updateExistingStub`(②)
- 보관/해제 버튼 → `service.ts` `.update({ is_archived })`

## 2. 앱까지 전달 — 원인 A (확정)

- 운영 DB(읽기 전용 조회 16:59): `community_messenger_participants` 는 `supabase_realtime` 발행 포함, 발행 컬럼에 `is_archived` 포함, REPLICA IDENTITY FULL → UPDATE 마다 `is_archived` 포함 전체 행 전송.
- 앱은 이미 내 행을 구독(`community-messenger-home-realtime-channels.ts` home_meta_self, `user_id=eq.나`). 16:43 실측의 `ROOM_UPDATE`(unread merge)가 이 처리기.
- **처리기가 `unread_count`·`last_read_*` 만 힌트로 만들고 `is_archived` 를 버린다** → 목록에 서버 보관 값이 실시간으로 오지 않음. (땜질은 이 값을 클라이언트 규칙으로 재계산하려다 메시지 경로 층마다 막힘)

## 3. 화면 행까지 — 원인 B·C·D (확정, 2026-04 부터 있던 코드)

`data.chats` → ① `sortRoomsWithStableOutput` → ② `unifiedRooms` 행 재사용 → 필터 → ③ 안정화 → 화면.
- **B** ① 정렬 캐시 키(`communityMessengerRoomsSortCacheKey`)에 보관·차단 숨김·방 상태·삭제 없음 → 보관 값만 바뀌면 캐시 히트로 **옛 방 객체** 반환. 실측 16:32·16:52: 데이터 a=true, 화면 행 a=false, 보관 버튼 눌러도 목록에 남음.
- **C** ②③ 행 비교(`unifiedListItemRowDisplayEqual`)에 같은 값 없음 → 옛 행 재사용.
- **D** silent home-sync 동일 판정 지문(`fingerprintHomeSyncLists`)에 보관 값 없음 → 서버가 보관만 바꿔 보내도 「같음」으로 버림. 실측 16:0x: 캐시 arch=true·서버 false.

## 4. 설계 (한 커밋)

1. 채널 힌트에 `isArchived`(행에 `is_archived` 가 boolean 일 때만) 추가 → `mergeParticipantUnreadDeltaIntoHomeListRoom` 이 unread 와 함께 `isArchivedByViewer` 를 서버 값으로 맞춤. 클라이언트 보관 규칙 없음(서버 단일 진실).
2. B·C·D 세 곳에 목록 표시 여부 입력(보관·차단 숨김·방 상태·삭제; 지문은 보관) 추가.
- 바꾸지 않음: 메시지 반영 경로·방 활동 투영·DB·통화·네이티브.
- 순서 위험: 보관 버튼 낙관 반영 직후 그 이전 UPDATE 행이 늦게 오면 잠깐 이전 값 → 버튼의 UPDATE 행이 마지막에 와서 서버 값으로 끝남.

## 5. 검증

로컬: 힌트·merge·B·C·D 단위 시험(수정 전 실패/후 통과) + typecheck + 관련 vitest + eslint.
실기기(배포 1회 후 1회): 보관 버튼 즉시 빠짐 · 보관 해제 즉시 복귀 · 7-1 받은 메시지 즉시 복귀 · 7-2 알림 끈 방 유지 · 7-3 부재중 복귀 · 7-4 받은 통화 유지 · 차단/해제 목록 정상.

## 추가 목록 후보(이번 범위 밖)

- 정렬 캐시 키에 `isMuted` 없음 → 알림 끄기 목록(`mutedListItems`) 반영 지연 가능(미측정).
