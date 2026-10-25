# 2단계 수정 설계서 — 1단계 결함 16건 (2026-10-26 PHT · 승인 대기 · 구현 없음)

- 근거: [1단계 결함 목록](messenger-2026-10-26-stage1-defect-list.md) · [복구 계획서](messenger-2026-10-26-recovery-plan.md) 2단계.
- 기준 코드: origin/main `8756acd40`. 원인 조사는 읽기 전용(코드·운영 DB SELECT·Vercel/Supabase 로그). 핵심 주장은 Claude 가 코드·DB 로 다시 확인함(각 항목 「재확인」 표시).
- 표기: **확정** = 코드·DB·로그로 증명 · **가능성** = 증명 못 함(측정 방법 함께 적음).
- 규정: 통화 관련(웹·서버·네이티브)은 통화 규정 — 단독 커밋, 실기기 통화 행렬. 운영 DB·Vercel 설정 변경은 Owner 별도 승인. 네이티브는 수정 전 화면·로그 기록 → 수정 → 같은 항목 대조, 빌드 번호 증가.

---

## 1. 결함별 원인과 수정안

### D-13 「모두에게서 삭제」가 상대 화면에 반영 안 됨 (가장 중요)

| 항목 | 내용 |
|---|---|
| 원인 1 (확정·재확인) | 메시지 병합이 삭제 시각만 지키고 본문은 나중에 들어온 옛 행으로 덮음 — `community-messenger-room-helpers.tsx:218-227` `mergeRoomMessages` (`...existing, ...item` 뒤 `deletedForEveryoneAt` 만 보존), 같은 방식 `merge-community-messenger-foreground-bootstrap.ts:17-27`, `messenger-message-merge-authority.ts:2-9` |
| 원인 2 (확정) | 화면이 삭제 여부를 보지 않고 `content` 를 그대로 그림 — `MessengerTimelineVirtualRow.tsx:603,610`. 「삭제된 메시지입니다」는 서버가 content 에 넣을 때만 나옴(`service.ts:1549-1553`) |
| 원인 3 (확정·재확인) | 캐시·스냅샷 시드가 마지막에 덮음 — `merge-primed-timeline-seed.ts:16-18` 가 `mergeRoomMessages(base, seed)` 로 시드를 나중에 적용, `use-messenger-room-client-phase1.ts:446-459` 가 스냅샷이 바뀔 때마다 이 함수를 실행. 스토어(`messenger-realtime-store.ts:333,358`)·방 캐시·IndexedDB(`use-messenger-room-local-indexed-db-snapshot.ts:72-84`)도 같은 이유로 원문을 다시 저장 |
| 원인 4 (확정) | 다시 들어와도 같은 id 의 변경을 못 받음 — 캐시 5초 이내면 네트워크 없이 진입, silent_delta 는 메시지를 다루지 않음, 진입 따라잡기는 `after=` 만 사용(`use-messenger-room-remote-catchup.ts:186` 주석에도 같은 id 수정 놓침 명시) |
| 수정 | ① `messenger-message-merge-authority.ts` 에 「삭제 표시가 있으면 본문·첨부·답장 필드를 삭제 상태로 확정」하는 함수 하나를 두고 세 병합 함수가 모두 사용 ② 타임라인 행에 `deletedForEveryoneAt` 이면 「삭제된 메시지입니다」로 그리는 분기 ③ 시드 우선순위: 캐시·스냅샷 시드를 먼저, 지금 화면·스토어 행을 그 위에(서버 새 응답만 마지막) ④ 방 진입 때 최근 메시지 1회 정합(`reconcileLatestMessages`) 추가 |
| 영향·위험 | 웹(메신저)만. 같은 병합 함수를 거래·주문 방도 씀 → 회귀 테스트 필요. 병합에 통화 기록 중복 제거가 함께 있어 「삭제 표시가 있는 행에만 적용」으로 한정하고 통화 기록 회귀 테스트 필수 |
| 확인 | Samsung 답장·일반 메시지 「모두에게서 삭제」 → iPhone(방 열림·방 밖·재진입·앱 재시작) 즉시 「삭제된 메시지입니다」 · 태블릿 동일 · 통화 기록 줄 변화 없음 |

### D-15 삭제된 말풍선에 답장 인용이 남음

| 항목 | 내용 |
|---|---|
| 원인 (확정) | 삭제 UPDATE 는 `content`·`metadata` 만 비우고 `reply_*` 를 남김(`service.ts:18622-18629`, 운영 DB 확인) · 서버 매퍼가 삭제 행에도 답장 필드 전달(`service.ts:1595-1602`) · 화면은 `replyToMessageId` 만 있으면 인용 표시(`MessengerTimelineVirtualRow.tsx:362-363`). 묶음2 D-1(`4f92abf63`)은 삭제된 메시지를 **인용한 다른 메시지**만 처리 — 이 경우는 범위 밖 |
| 정책 | 삭제되면 인용도 숨김(카카오 동일) |
| 수정 | 서버 매퍼: 삭제 행이면 답장 필드 제외 · 화면: 인용 조건에 「삭제 아님」 추가 · D-13 ①의 확정 함수에서도 비움. 운영 DB `reply_*` 정리는 하지 않음(읽기 쪽으로 충분) |
| 확인 | 답장 메시지 삭제 → 양쪽 모두 인용 없이 「삭제된 메시지입니다」 |

### D-14 받는 쪽에서 답장 인용이 안 보임

| 항목 | 내용 |
|---|---|
| 원인 (확정) | 실시간 bump 메시지 스냅샷에 답장 필드 4개가 없음 — 보내는 쪽 `community-messenger-room-bump-message-snapshot.ts:34-86`, 받는 쪽 파서 `:126-192`. 받는 쪽이 이 스냅샷을 먼저 병합하고, 뒤에 단건 조회로 답장 필드를 받아도 스토어 변경 감지(`messenger-room-timeline-paint-model.ts:141-153`)에 답장 필드가 없어 「변경 없음」으로 버림(`messenger-realtime-store.ts:436`) |
| 수정 | bump 직렬화·파서에 `replyToMessageId`·`replyPreviewText`·`replyPreviewType`·`replySenderLabelSnapshot`(길이 상한) 추가 · 변경 감지에 `replyToMessageId`·`replyPreviewText` 포함 |
| 영향 | bump 받는 모든 방(거래 포함). 필드가 없으면 지금과 같음 → 구버전 호환 문제 없음 |
| 확인 | Samsung 답장 → iPhone 방 열림·방 밖·재진입 모두 인용 표시 |

### D-12 상대가 읽었는데 「안 읽음」이 늦게 사라짐

| 항목 | 내용 |
|---|---|
| 원인 (확정) | 상대 읽음 실시간 갱신이 화면 상태에만 반영되고 방 캐시에는 안 씀(`use-messenger-room-client-phase1.ts:1248-1258`) · 재진입 때 silent_delta 병합은 읽음 표시를 무시(`merge-community-messenger-silent-delta.ts`) · 일반 부트스트랩 비교 지문에 읽음 표시가 없어 같은 것으로 보고 새 값을 버림(`merge-community-messenger-foreground-bootstrap.ts:64-68`, `messenger-room-bootstrap-refresh.ts:302-304`) |
| 가능성 | 02:13 에 사라진 계기(실시간 수신 또는 지문이 달라진 부트스트랩) — 기기 로그 없음 |
| 수정 | 부트스트랩 지문에 `readReceipt.lastReadMessageId` 포함 · silent_delta 에 읽음 표시 반영(서버 응답 포함 여부 확인 후) · 상대 읽음 패치 때 방 캐시도 패치 |
| 확인 | 상대가 읽은 뒤 내 방 열림·재진입 모두 「안 읽음」 즉시 사라짐 |

### D-10 「보관된 채팅 (N)」 줄이 반응 없음

| 항목 | 내용 |
|---|---|
| 원인 (확정·재확인) | 줄의 처리 `openArchivedChatsStable` 이 화면 상태만 「보관함」으로 바꾸고 주소(URL)는 그대로(`CommunityMessengerHome.tsx:2990-2994`) · 주소→탭 맞춤 처리(`use-community-messenger-home-shell-effects.tsx:193-279`)가 렌더마다 새로 만들어지는 `openSettingsSheet={() => …}`(`CommunityMessengerHome.tsx:3364`) 때문에 다시 돌아 곧바로 「대화」로 되돌림 |
| 수정 | `openArchivedChatsStable` 을 정상 탭 전환 함수(`onPrimarySectionChange("archive")`, 주소 갱신 포함)로 바꾸고 보관 채팅 시트를 엶 · `openSettingsSheet` 를 고정 함수로(렌더마다 주소 맞춤이 도는 것도 제거) |
| 영향 | 메신저 홈 탭 전환만. 회귀 위험 낮음, 렌더 횟수 감소 |
| 확인 | Samsung·iPhone·태블릿에서 「보관된 채팅」 누르면 보관 채팅 시트, 다른 탭 전환 정상 |

### D-7 통화 뒤 대화 목록 미리보기가 늦게 바뀜 (통화 규정)

| 항목 | 내용 |
|---|---|
| 원인 (확정·재확인) | 통화 기록 저장(`appendCommunityMessengerCallStubMessage`, `service.ts:5492-5916`)에 목록 스냅샷 무효화 없음(일반 메시지는 `invalidateOwnerHubBadgeForCommunityMessengerPeers` 로 양쪽 무효화) · 오래된 스냅샷도 그대로 응답하고 갱신만 예약(`home-sync-snapshot.ts:273-288`) |
| 수정 | 통화 기록 저장이 끝난 뒤(방 마지막 메시지 갱신 후) 양쪽 사용자에 일반 메시지와 같은 무효화 호출. 오래된 스냅샷 응답 정책은 **유지**(바꾸면 10-22 운영 DB 과부하 원인 재발) |
| 영향 | 통화 1건당 목록 재계산 최대 2회(일반 메시지 1건과 같은 부하). 통화 동작은 바꾸지 않음 |
| 확인 | 통화 행렬(음성·영상 발신·수신·거절·취소·무응답) 각 종료 직후 양쪽 대화 목록 미리보기 즉시 변경 + 통화 동작 회귀 없음 |

### D-5 통화 뒤 iPhone 「통화」 탭에 그 통화가 안 나옴 (통화 규정)

| 항목 | 내용 |
|---|---|
| 원인 (경쟁 조건은 확정, 실제 발생은 가능성) | 세션 종료 신호 120ms 뒤 통화 기록 조회 → 통화 기록 행 삽입(약 0.2초 뒤)보다 먼저 나가면 새 행 없는 목록을 받음(`use-community-call-history-realtime-sync.ts:19,179-198`) · 뒤이은 삽입 신호의 조회는 진행 중인 옛 조회에 합류해 새 조회가 안 나감(`run-single-flight.ts:24-31`) · 네이티브 통화 화면에서 돌아올 때 화면 표시 이벤트가 없어 재조회 안 됨(가능성) |
| 수정 | 신호마다 진행 중 조회가 끝난 뒤 1회 더 조회(뒤따름 조회) · 네이티브 통화 종료 신호·앱 복귀 때도 재조회 |
| 영향 | 통화 1건당 목록 조회 1~2회 증가. 통화 신호 경로는 안 바꿈 |
| 확인 | 통화 행렬 각 종료 직후 양쪽 「통화」 탭 맨 위에 그 통화 |

### D-1 통화 종료 안내 로고가 흰 바탕에 묻힘 (통화 규정 · 화면만)

| 항목 | 내용 |
|---|---|
| 원인 (확정·재확인) | 흰 글자 로고(`/images/brand/dibay-logo-mark.png`, 녹색 바탕용)를 흰 팝업에 바탕 없이 사용(`CallInAppNoticeCenterDialog.tsx:14,67-75`, `call-in-app-notice-center.css:37-42`) |
| 수정 | 로고에 브랜드 녹색 바탕 칩을 줌(또는 녹색 바탕 앱 아이콘 이미지로 교체) |
| 확인 | 거절·통화 중·무응답·종료 안내 3기기 캡처 |

### D-6 보관된 방에 새 메시지·통화가 와도 목록으로 안 돌아옴 (정책 + 운영 DB)

| 항목 | 내용 |
|---|---|
| 원인 (확정) | 보관 해제는 본인이 방에 들어가거나 걸 때만(`service.ts:10919,13290`, `CommunityMessengerHome.tsx:1294-1316`). 메시지·통화 기록 쓰기 DB 함수(`community_messenger_send_text_message`, `dibay_append_room_message_atomic`)는 받는 사람 안읽음만 올리고 보관은 안 바꿈 |
| 정책 (Owner 결정 필요) | 텔레그램 방식 권장: **받는 사람이고, 알림 꺼짐이 아니고, 나가지 않았고, 차단 숨김이 아니면** 새 메시지·통화가 오면 보관 해제. 보낸 사람 쪽은 그대로. 통화는 「받는 쪽 부재중·수신 통화」에만 적용(거절·취소 포함 여부 결정 필요) |
| 수정 | 두 DB 함수의 받는 사람 갱신에 보관 해제 조건 추가(같은 트랜잭션, 추가 왕복 없음) — **운영 DB 변경 → 별도 승인** · 통화 기록의 「기존 행 갱신」 경로는 DB 함수를 안 거치므로 서버에서 같은 조건으로 해제 · 해제된 사람 목록 스냅샷 무효화(D-7 과 같은 호출) · 앱 실시간 갱신에서 「알림 켜진 방이면 보관 해제」 반영 |
| 영향 | 그룹 포함 여부(그룹은 차단·나간 사람 제외), 통화 기록 결과가 바뀌므로 통화 규정 적용 |
| 확인 | 받는 쪽 보관 → 메시지·통화 수신 → 대화 목록 복귀 · 알림 꺼진 보관 방은 그대로 · 보낸 쪽 보관 그대로 |

### D-8 차단 해제가 숨김 값을 남김

| 항목 | 내용 |
|---|---|
| 원인 (확정·재확인) | 차단이 `hidden_at`·`last_visible_message_id` 까지 쓰고 해제는 `blocked_hidden_at` 만 지움(`participant-block-hide.ts:106-111,136-141`) |
| 실제 영향 (확정·재확인) | **현재 사용자에게 보이는 영향 없음** — 이 두 컬럼을 읽는 코드가 없음(`git grep` 쓰기 1곳뿐). 그러나 컬럼 정의는 「차단과 무관한 숨김」이라 나중에 누가 쓰면 차단 해제한 방(운영 5개)이 다시 숨겨질 위험 |
| 수정 | 차단 때 `hidden_at`·`last_visible_message_id` 를 쓰지 않음(차단 숨김은 `blocked_hidden_at` 하나). 남은 운영 데이터 정리는 급하지 않음 — 필요 시 별도 승인 |
| 확인 | 차단 → 해제 → 운영 DB 세 값 모두 원래대로 |

### D-11 친구 요청 팝업에 사진이 없음 (사진 파일 자체가 없음)

| 항목 | 내용 |
|---|---|
| 원인 (확정·재확인) | 팝업은 사진 주소를 받음. 그러나 q 의 `profiles.avatar_url` 이 가리키는 파일이 Storage 에 없음(HTTP 400 `NoSuchKey`, 10-26 재확인). 운영 Storage 아바타 16개 중 q 하나만 없음 → 모든 화면에서 q 사진 안 보임 |
| 파일이 사라진 경위 (가능성) | 사진 바꾸기 때 「이전 사진 파일 삭제」(`app/api/me/profile/route.ts:1195-1222`)가 오래된 화면의 저장과 겹치면 현재 사진 파일을 지울 수 있음. 로그 보존 기간 밖이라 확정 못 함 |
| 수정 | ① 데이터: q 계정에서 사진 다시 올리기(시험 계정) ② 프로필 저장에서 사진 주소를 바꿀 때 「현재 DB 값과 같을 때만」 조건 또는 새 파일 존재 확인 → 지우면 안 되는 파일을 지우는 경쟁 방지 |
| 확인 | 사진 변경 반복·다른 화면 저장 겹침 후 파일 존재·표시 |

### D-2 부재중 알림이 iPhone 수신 화면보다 먼저 옴 (통화 규정)

| 항목 | 내용 |
|---|---|
| 원인 (확정) | 서버 무응답 마감 = 서버 시작 + 30초(`call-missed-deadline-authority.ts:59-67,104`) · iPhone 벨 타이머 = VoIP 받은 시점 + 30초(`NativeVoiceCallRuntime.swift:15,409-420`), 실제 1.5초 더 늦게 실행 · 서버는 iPhone 벨이 이미 끝났다고 전제하고 일반 알림 부재중을 바로 보냄(`push-payload-types.ts:160,176,199-216`) |
| 수정 1 (서버 · 설치 앱 호환) | VoIP 수신 화면이 뜬 iPhone 에 보내는 일반 알림 부재중만, 그 iPhone 벨이 끝날 시점(VoIP 발송 시각 + 30초 + 여유) 뒤로 늦춰 보냄 |
| 수정 2 (네이티브 · 다음 빌드) | iPhone 타이머 기준을 서버 시작 시각으로 맞춤 |
| 기각 | iPhone 에 VoIP 로 부재중 보내기 — A1 회귀 위험 |
| 확인 | 무응답 시험에서 iPhone 수신 화면이 먼저 닫히고 그 뒤 부재중 알림 |

### D-9 태블릿 첫 탭 약 10초 흰 화면

| 항목 | 내용 |
|---|---|
| 원인 (가능성 강함 · 서버 로그 근거) | 10-26 01:09 재현 때 방 진입이 앱 안 전환이 아니라 **웹뷰 전체 새로고침**으로 처리됨(Vercel 로그: 방 주소 HTML 문서 요청 → 시작 화면·세션·기기 등록 순서). 재현 두 번 모두 직전에 Production 배포가 있었음 → 옛 빌드 화면이 새 배포의 파일을 못 찾아 강제 새로고침(배포 버전 불일치) · 분할 화면은 진입 가림막·로딩 화면이 없어 그 동안 빈 화면(`community-messenger-room-forward-navigation.ts`, `begin-cm-pre-route-room-opening.ts:15`, `rooms/[roomId]/loading.tsx`) |
| 수정 | ① 배포 버전 보호: `next.config.js` 에 배포 ID 지정 + Vercel Skew Protection — **Vercel 설정 변경 → 별도 승인** ② 분할 화면 방 로딩 화면에 보이는 스피너 |
| 확정 방법 | 배포 직후 첫 탭 vs 배포 없이 첫 탭 비교 · `adb logcat` chromium 태그로 새로고침·ChunkLoadError 확인 |

### D-4 iPhone 영상 발신: 상대 정상 종료를 실패로 처리 (네이티브 · 통화 규정)

| 항목 | 내용 |
|---|---|
| 원인 (확정·재확인) | 음성 발신은 「연결 중 상대 정상 퇴장(QUIT)」을 정상 종료로 처리(`NativeVoiceOutgoingCallCoordinator.swift:135-139`)하지만 **영상 발신에는 이 분기가 없음** — 「내가 끊음」으로 처리(`NativeVideoOutgoingCallCoordinator.swift:128-138`) · 이어 웹이 종료를 한 번 더 부르면 이미 「종료 중」이라 오류 → 실패로 기록(`NativeVideoIncomingCallCoordinator.swift:289-294`, `NativeVideoCallRuntime.swift:189-199,248-249`, iPhone 로그 02:02:07.675) |
| 수정 | ① 영상 발신에 음성과 같은 「상대 정상 퇴장 → 정상 종료」 분기(A5 와 같은 방식) ② 이미 「종료 중」이면 종료 시작을 건너뛰고 종료 완료만 |
| 영향 | iOS 새 빌드 필요(1.2 (12)). 영상 발신 종료·CallKit 종료·통화 기록. 상대 연결 끊김(reason 1)은 지금처럼 실패 유지 |
| 확인 | 수정 전·후: iPhone→Samsung 영상 → Samsung 종료 → iPhone 화면·안내·로그·통화 기록 대조 + 통화 행렬 |

### D-3 iPhone 영상 발신 「연결 중」 6초 더 표시 (네이티브 · 원인 미확정)

| 항목 | 내용 |
|---|---|
| 확정 | 발신 iPhone 은 「연결됨」 전환을 상대 참가 신호 하나에만 의존(`NativeVideoCallAgoraEngine.swift:516-519`) |
| 가능성 | 이 통화에만 「채널 참가 성공」 로그가 없음(같은 날 수신 영상은 있음) → 직전 음성 통화 뒤 엔진 재생성·콜백 지연 후보. 코드만으로 증명 못 함 |
| 수정 | **원인 특정 먼저**: 연결 상태 변화·첫 상대 음성/영상 프레임·엔진 생성/해제 로그 추가(D-4 와 같은 빌드) → 재현 → 원인 확정 후 수정 설계 |

### D-16 Samsung 사진 보내기 「최근 사진」 비어 있음 (Android 네이티브)

| 항목 | 내용 |
|---|---|
| 원인 (가능성 높음 · 코드 일부 확정·재확인) | 사진 조회 정렬 문자열에 `LIMIT` 를 넣음(`MessengerPhotoLibraryPlugin.java:103`) — Android 11 이상은 이를 거부하고 예외를 던짐. 예외를 기록 없이 삼키고 빈 목록 반환(`:130`) |
| 수정 | 조회 인자 방식으로 개수 제한 · 예외 기록·오류 반환 |
| 확인 | 수정 전 `adb logcat` 로 예외 확인 → 수정 후 최근 사진 표시. Android 새 빌드(versionCode 12) |

---

## 2. 반영 순서 (승인 단위)

| 순서 | 묶음 | 결함 | 종류 | 승인 |
|---|---|---|---|---|
| 1 | 메시지 삭제·답장·읽음 | D-13 · D-15 · D-14 · D-12 | 웹(메신저), 결함별 단독 커밋 | 이 설계서 |
| 2 | 홈 | D-10 | 웹(메신저) | 이 설계서 |
| 3 | 통화 목록 반영 | D-7 → D-5 → D-1 | 통화(서버·웹), 각각 단독 커밋 + 통화 행렬 | 이 설계서 |
| 4 | 차단 숨김 | D-8 | 웹·서버 | 이 설계서 |
| 5 | 보관 복귀 | D-6 | 운영 DB 함수 + 서버 + 웹, 통화 규정 | **정책 결정 + 운영 DB 승인** |
| 6 | 부재중 순서 | D-2 (서버 1안) | 통화 서버 | 이 설계서 |
| 7 | 태블릿 흰 화면 | D-9 | Vercel 설정 + 웹 | **Vercel 설정 승인** |
| 8 | 사진 | D-11 | 프로필 API + 시험 계정 사진 재등록 | 이 설계서 |
| 9 | 네이티브 | D-4 · D-3 계측 (iOS 1.2 (12)) · D-16 (Android 12) · D-2 2안 | 네이티브 빌드 — 수정 전 기록 → 수정 → 대조 | **네이티브 승인** |

각 단계: 로컬 검증(typecheck·관련 vitest·eslint) → main 반영 → Production SHA 확인 → 1단계와 같은 실기기 시험으로 수정 전/후 표 → 다음 단계.

## 3. 결정이 필요한 것

1. D-6 정책: 보관된 방에 새 활동이 오면 목록으로 돌릴지(권장: 텔레그램 방식, 알림 꺼진 방 제외), 통화는 어떤 종류에 적용할지(권장: 받는 쪽 부재중·수신).
2. D-9 Vercel Skew Protection 설정 변경 승인.
3. 네이티브 빌드(iOS 1.2 (12) · Android versionCode 12) 진행 승인 — 빌드는 Claude 가 먼저 시도, 안 되면 Cursor.

## 4. 구현·실기기 기록

### D-13 — `1931ebcad` (2026-10-26)

- 반영: 설계 ① 확정 함수(세 병합 + 스토어), ② 타임라인 삭제 분기, ④ 방 진입 최신 정합 1회. ③ 시드 순서 변경은 **하지 않음** — ①로 병합 순서와 무관하게 삭제가 유지되고, 순서를 바꾸면 새 서버 행이 옛 화면 행에 밀릴 위험이 있음.
- 로컬: typecheck PASS · 새 테스트 8건 PASS(수정 전 코드로 돌리면 4건 실패 — 재현 확인) · eslint 오류 0. `attachment` 자동저장 테스트 15건 실패는 수정 전과 동일(로컬 Node `localStorage` 없음, 범위 밖).
- Production: `1931ebcad` READY 확인 후 Samsung 새로고침·iPhone 앱 종료 후 재실행·태블릿 앱 종료 후 재실행.

| 시험 (Samsung q 가 보내고 「모두에게서 삭제」) | 삭제 시각(DB, PHT) | 받는 쪽 결과 | 판정 |
|---|---|---|---|
| A 일반 메시지, iPhone 방 열림 | 02:48:58 | 3초 안에 「삭제된 메시지입니다」 | PASS |
| A 답장 메시지, iPhone 방 열림 | 02:49:45 | 인용 없이 「삭제된 메시지입니다」(Samsung 쪽도 인용 없음) | PASS |
| B iPhone 방 밖(목록) → 재진입 | 02:50:29 | 목록 미리보기 원문 사라짐, 재진입 시 「삭제된 메시지입니다」 | PASS |
| C iPhone 앱 백그라운드 → 복귀 | 02:51:22 | 「삭제된 메시지입니다」 | PASS |
| C iPhone 앱 종료 → 재실행 → 진입 | (같은 행) | 「삭제된 메시지입니다」 | PASS |
| 태블릿(zxzx11) 방 열림 | 02:54:04 | 「삭제된 메시지입니다」, 통화 기록 줄 변화 없음 | PASS |

- 수정 전(1단계): 02:15:19 삭제 후 iPhone 에 「S1reply0214」 원문 유지 → 수정 후 위 6건 모두 반영.
- 범위 밖 발견(보고만): iPhone 이 방 안에 있을 때 삭제된 메시지가 방을 나간 직후 목록 미리보기에 원문(「D13r0249」)으로 남음. 서버 `last_message` 는 「새 메시지」로 갱신돼 있었음 → 목록 화면 쪽 미리보기 갱신 결함. 다음 메시지가 오면 정상으로 바뀜.
- 증거: `tmp/verify-2026-10-25-stage2-claude/d13-*.png`(Samsung·태블릿), iPhone 미러링 캡처.

### D-15 — `6b7f0ddf6` (2026-10-26)

- 반영: 서버 매퍼 2곳(단건·목록 `mapCommunityMessengerDbMessageRowToMessage`, 방 스냅샷 `replyPieces`)과 실시간 매퍼가 삭제 행이면 인용 필드 제외 · 타임라인 인용 조건에 「삭제 아님」. 운영 DB `reply_*` 는 그대로(삭제 행 DB 컬럼에 인용 값 남아 있음 — 읽기 쪽에서 제외).
- 로컬: typecheck PASS · 새 테스트 2건 PASS(수정 전 코드로 2건 실패 확인) · 메신저 관련 vitest 75파일 429건 PASS · eslint 오류 0.
- 서버 응답 수정 전/후 (같은 삭제 답장 `daac816b`, `messages?latest=1`):
  - 03:00 PHT(수정 전 배포): `replyToMessageId=ecf99737…`, `replyPreviewText="S1check0209"` 내려옴
  - 03:05 PHT(`6b7f0ddf6` READY): 인용 필드 없음. 삭제 행 5건 모두 `reply=null`

| 시험 (Samsung q 답장 → 「모두에게서 삭제」) | 삭제 시각(DB, PHT) | 결과 | 판정 |
|---|---|---|---|
| 사진에 답장 `40b6afb8`, iPhone 방 열림 | 03:06:41 | iPhone·Samsung 모두 인용 없이 「삭제된 메시지입니다」 | PASS |
| 같은 행, iPhone 앱 종료 → 재실행 → 진입(서버 경로) | — | 인용 없음 | PASS |
| 텍스트에 답장 `6d621e1c`, 태블릿 방 열림 | 03:08:34 | 태블릿·Samsung 모두 인용 없음, 통화 기록 줄 변화 없음 | PASS |

- 증거: `tmp/verify-2026-10-25-stage2-claude/d15-*.png`, iPhone 미러링 캡처.
