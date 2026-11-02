# 실기 확인 시나리오 (Cursor 실행용) — 통화 안내·막힌 방·상대 나감·재참가 기록·나간 상대 통화 (2026-11-02)

> **실행 주체: Claude 세션(이 Mac 에 연결된 S·X·I 직접 조작) — Cursor 는 이 시나리오를 실행하지 않는다(Owner 2026-11-02 「중복 금지·한 곳에서」).** 결과는 같은 파일 끝 「실행 결과」 절에 기록한다.
> **코드·DB·설정 변경 금지 — 기기 조작·확인·기록만.** 커밋하지 않는다(실기 프롬프트 규정).
> 근거: `messenger-2026-11-02-call-notice-autodismiss-and-room-disabled-audit.md` · `messenger-2026-11-02-remaining-risk-design.md`(S-1) · `messenger-2026-11-02-s2-leave-history-call-design.md`(S-2).

## 0. 기기·계정·방 (2026-11-02 확인값)

| 기호 | 기기 | 계정(닉네임 / user_id) | 설치 | 조작 |
|---|---|---|---|---|
| **S** | 삼성 SM-M156S · `RFCY40PY2CA` | q테스트1 / `9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8` | 1.2.5 (32) | `ADB=~/Library/Android/sdk/platform-tools/adb` (Homebrew adb 는 기기를 못 봄) |
| **X** | 샤오미 24076RP19G · `8b37179f7d94` | zxzx11 / `0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc` | 1.2.5 (32) | 같음 |
| **I** | iPhone 14 Pro Max(`iPhonebk`) | w테스트1 / `edc8c2f0-2673-4ca8-9d63-92a609d556f4` | 1.2 (21) | iPhone 미러링(Owner 승인) · Mac Safari 웹 검사기 · `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl` |

| 방 | id | 메시지 | 쓰임 |
|---|---|---|---|
| S↔I (q-w) | `c202326f-8109-4ce4-aa61-394f0a799e7d` | 1,597 | 묶음 1 통화 · **나가기 시험 금지**(나가면 그 사람은 기록을 다시 못 봄 — 설계대로) |
| I↔X (w-x) | `a7c0ca62-1845-4419-bae2-5685b10b414e` | 15 | 묶음 3·4·5 (나가기·재참가·나간 상대 통화) |
| S↔X (q-x) | `1de13b3e-ba94-49bf-b611-582ef3f39ab9` | 127 | 묶음 2 차단 |

**조작 도구 (기존 Cursor 절차 그대로):**
- Android 화면: `$ADB -s <ID> exec-out screencap -p > <파일>.png` · 입력 `$ADB -s <ID> shell input tap X Y` / `input text` · 요소 찾기 `$ADB -s <ID> shell rm -f /sdcard/u.xml; $ADB -s <ID> shell uiautomator dump /sdcard/u.xml; $ADB -s <ID> exec-out cat /sdcard/u.xml`
- Android 앱 안 웹(CDP): `SOCK=$($ADB -s <ID> shell cat /proc/net/unix | grep -o "webview_devtools_remote_[0-9]*" | head -1); $ADB -s <ID> forward tcp:9252 localabstract:$SOCK` → `http://localhost:9252/json`
- Android 화면 녹화: `$ADB -s <ID> shell screenrecord --time-limit 30 /sdcard/r.mp4` → `$ADB -s <ID> pull /sdcard/r.mp4`
- Android 로그: `$ADB -s <ID> logcat -c` 후 `$ADB -s <ID> logcat -d -s DIBAY_WebView DIBAY_PUSH_ROUTE DIBAY_NOTIFY chromium`
- 방 바로 열기: `$ADB -s <ID> shell am start -n com.dibay.app/.MainActivity -a android.intent.action.VIEW -d "https://samarket.vercel.app/community-messenger/rooms/<방id>"`
- iPhone: 미러링 화면 캡처. **CallKit 수신·통화 화면은 미러링만으로 판정 금지**(2026-11 「연결 중 멈춤」 오판 사례) — 운영 DB 세션 시각(`answered_at`·`ended_at`)과 iPhone 실물 확인으로 판정.

## 1. 확인 조건 (매 묶음 시작 때)

| 항목 | 기준 |
|---|---|
| Production SHA | `c5e88318d` 이상 — Vercel Production READY SHA 를 **묶음마다** 다시 적는다. 다른 SHA 결과는 섞지 않는다 |
| 운영 DB | `20271102130000_cm_direct_rejoin_history_floor` 적용 |
| 앱 | 웹만 변경 — 시작 전 세 기기 앱 완전 종료 후 재실행 |
| 시각 | 모든 단계 PHT 분·초 |

**판정:** 캡처·녹화·DB 결과가 있는 항목만 PASS. 증거 없으면 NOT_PROVEN. 기대와 다르면 원인과 관계없이 먼저 FAIL. 통화(묶음 1·5)는 코드 PASS · Production 반영 · 실기 PASS 를 따로 적고, **FAIL 이면 즉시 중단·보고**(통화 규정 6번).

**DB 대조 (읽기 전용 · `ckdosyydvgzqwpbwuhon`):**
```sql
select user_id, joined_at, left_at, cleared_at from community_messenger_participants where room_id = :room;
select id, sender_id, message_type, left(content,30) c, created_at from community_messenger_messages where room_id = :room order by created_at desc limit 10;
select id, initiator_user_id, recipient_user_id, status, ended_reason, created_at, answered_at, ended_at from community_messenger_call_sessions where room_id = :room order by created_at desc limit 5;
select id, user_id, type, created_at from notification_events where call_session_id = :session;
```

---

## 묶음 1 — 통화 안내 팝업 4초 자동 닫힘 (`7870b5c2a` · 방 S↔I)

| # | 조작 | PASS 기준 | 증거 |
|---|---|---|---|
| 1-1 | S 방에서 음성 발신 → I 거절 | S 「통화 거절」 팝업이 손대지 않아도 약 4초 뒤 사라짐 | S 녹화 · 세션 `rejected` |
| 1-2 | 1-1 반복, 팝업 뜨면 「확인」 | 즉시 닫힘 | S 캡처 |
| 1-3 | 1-1 반복, 팝업 바깥 탭 | 즉시 닫힘 | S 캡처 |
| 1-4 | S 발신 → I 무응답(타임아웃) | S 「응답 없음」 4초 뒤 닫힘 · I 부재중 알림 1건 | 녹화 · 세션 `missed` · 알림 1행 |
| 1-5 | I 가 X 와 통화 중일 때 S → I 발신 | S 「상대방 통화 중」 4초 뒤 닫힘 · I 통화 유지 | 녹화 · 세션 `cancelled/peer_busy` |
| 1-6 | I → S 로 1-1·1-4 반복 | I 의 팝업도 4초 뒤 닫힘 | 미러링 녹화 |
| 1-7 | 무회귀: S↔I 음성·영상 발신→수락→종료, 종료 직후 재발신 | 정상 | 세션 시각 |

## 묶음 2 — 막힌 방 안내 (`db4378cdd`·`bf8344405` · 방 S↔X)

⚠ 차단은 **양쪽 친구 관계를 지운다**(정책). 끝나면 S 가 X 차단 해제 + 친구 다시 추가.

| # | 조작 | PASS 기준 | 증거 |
|---|---|---|---|
| 2-1 | S 가 X 차단 → S 에서 S↔X 방 열기 | 입력창 없음 · 「채팅을 할 수 없습니다」 + 「차단된 사용자와는 메시지를 주고받을 수 없습니다.」 · 상단 「차단한 사용자입니다」 | S 캡처 |
| 2-2 | X 에서 같은 방 열기 | **1행만** · 상단 「친구 추가 \| 차단」 바 없음 | X 캡처 |
| 2-3 | 2-1·2-2 를 앱 재실행 직후 첫 진입으로 | 흐린 입력창 없이 같은 안내 줄 | 녹화 |
| 2-4 | X 에서 CDP 로 발송 API 직접 호출 시 거부 문구 | 안내 줄 2행과 같은 계열(서버 `blocked_target`) | CDP 응답 |
| 2-5 | 완료·취소된 주문 채팅 / 판매자가 종료한 거래 채팅(있는 계정으로) | 주문: 「완료되거나 취소된 주문에서는…」 / 거래: 노란 상자 없음 + 「상품 보기」 | 캡처 (해당 방 없으면 NOT_PROVEN) |
| 2-6 | 정리: 차단 해제 → 정상 방 입력창 복귀 | 입력창 정상 | 캡처 |

## 묶음 3 — 상대가 나간 1:1 (S-1 · 방 I↔X)

| # | 조작 | PASS 기준 | 증거 |
|---|---|---|---|
| 3-1 | X 에서 방 나가기 | 확인 문구 「나가면 내 대화 내용과 목록에서 삭제됩니다. 상대방의 대화는 그대로 남습니다.」 · X 목록에서 사라짐 · DB X 행 없음 | X 캡처 · DB |
| 3-2 | I 에서 방 열기 | 헤더에 **zxzx11 이름·사진**(「새 대화」 아님) · 입력창 정상 | I 캡처 |
| 3-3 | I 텍스트 1건 | X 푸시 1회 · X 목록에 방 재등장 · 안 읽음 1 · DB X 행 재생성 + `cleared_at` | X 캡처·logcat · DB |
| 3-4 | 3-1→3-3 을 이미지·음성·파일·스티커로 각각 | 같은 결과 | 캡처 · DB |
| 3-5 | X 나가기 → X 가 I 차단 → I 보내기 | I 안내 줄(2행 없음) · **X 행 재생성 0** · 정리: 차단 해제 + 친구 재추가 | 캡처 · DB |

## 묶음 4 — 다시 참가한 사람의 기록 (S-2a/b · 방 I↔X)

준비: I·X 서로 5건 이상(이미지·음성 포함), I 가 그중 1건에 답장.

| # | 조작 | PASS 기준 | 증거 |
|---|---|---|---|
| 4-1 | X 나가기 → I 「새 메시지」 | X 방에 「새 메시지」만 · 위로 스크롤해도 이전 대화 없음 · 안 읽음 1 | X 녹화 · DB `cleared_at` |
| 4-2 | X 목록 미리보기 | 「새 메시지」 | X 캡처 |
| 4-3 | I 가 옛 메시지에 답장 | X: 답장 보이고 인용은 「삭제된 메시지」 | X 캡처 |
| 4-4 | I 가 옛 메시지 수정·삭제 | X 화면 변화 없음 | X 녹화 |
| 4-5 | I 화면 | 기록 전체 그대로 | I 캡처 |
| 4-6 | X 나가기 → X 앱 재실행 → 친구 목록에서 I 와 1:1 열기 | 이전 대화가 한 번도 그려지지 않음(빈 대화) | X 녹화 |
| 4-7 | 4-6 뒤 X 목록 | 옛 메시지 미리보기 없음 | X 캡처 |
| 4-8 | X CDP: 옛 메시지 id 로 `GET /api/community-messenger/rooms/<방>/messages/<옛id>` | 404 `not_found` | CDP 응답 |
| 4-9 | 무회귀: S↔I·S↔X 방(나간 적 없음) | 기록·미리보기·안 읽음 그대로 | 캡처 |

## 묶음 5 — 나간 상대에게 통화 (S-2c `c5e88318d` · 방 I↔X · 통화 규정)

각 시험: 발신·세션 생성·수신 화면·연결·종료 시각 기록(서버 시각은 DB).

| # | 조작 | PASS 기준 |
|---|---|---|
| 5-1 | X 나가기 → I 방에서 **음성** 발신 | 통화 버튼 활성 · X 수신 화면 → 수락 → 연결 → 종료 · X 목록에 방 재등장(통화 기록부터) · DB X 행 재생성 + 세션 1 |
| 5-2 | 5-1 을 **영상** | 같음 |
| 5-3 | I 나가기 → X 발신 | I CallKit 수신 → 연결 → 종료 (DB `answered_at` 로 판정) |
| 5-4 | X 나가기 → I 발신 → X 거절 | I 「통화 거절」 4초 닫힘 · 방 「거절」 기록 |
| 5-5 | X 나가기 → I 발신 → I 벨 중 취소 | X 수신 화면 사라짐 · 지연 푸시로 재울림 없음(1분 관찰) |
| 5-6 | X 나가기 → I 발신 → X 무응답 | X 부재중 알림 1건(탭 → 그 방) · 방 「부재중」 |
| 5-7 | X 나가기 + X 가 I 차단 → I 발신 | 거부 · X 울림 없음 · X 행 재생성 0 · 세션 0 (정리: 차단 해제 + 친구 재추가) |
| 5-8 | X 나가기 + X 가 S 와 통화 중 → I 발신 | I 「상대방 통화 중」 · X 통화 유지 |
| 5-9 | 무회귀: 나간 적 없는 S↔I 음성·영상 발신·수신·거절·벨 중 취소·무응답·종료 직후 재발신 | 기존과 같음 |

## 보고 (묶음별 1회)

확인 조건 표 → 항목별 PASS / FAIL / NOT_PROVEN + 증거 파일명·DB 결과 → FAIL 은 화면 그대로 먼저, 원인 추정은 따로 → 통화 묶음은 코드·Production·실기 PASS 구분.

---

## 실행 결과 (Claude 직접 실행 · 2026-11-02 21:23~21:54 PHT · 1차 — FAIL 발견으로 중단)

**조건:** Production `88e4ac9da`(21:24 확인) → 시험 중 다른 세션 배포로 `08e42167a`(21:33)·`ffc1e1094`(21:34) 교체, 둘 다 `c5e88318d` 포함. 21:34 이후 결과는 `ffc1e1094` 기준. S·X Android `1.2.5 (32)`(adb 확인), I iOS `1.2 (21)`(devicectl 확인). 계정 S=q테스트1 · X=zxzx11 · I=w테스트1(목록·DB 대조로 확인). Android 앱은 배포용 빌드라 앱 안 웹 디버깅 불가 → 화면 캡처·uiautomator·운영 DB·Vercel 로그로 판정. 증거 파일: scratchpad `dev/*.png`·`r11.mp4`.

| # | 결과 | 증거 |
|---|---|---|
| 1-1 거절 팝업 자동 닫힘 (S→X) | **PASS** — 녹화 기준 3.7초 표시 후 자동 닫힘 | `r11.mp4` 밝기 분석 · 세션 `7553c5fa` rejected 21:26:26→21:26:43 |
| 1-2 「확인」 즉시 닫힘 | **PASS** | S12a/S12b |
| 1-3 바깥 탭 즉시 닫힘 | **PASS** | S13a/S13b |
| 1-4 응답 없음 | **PASS** — 팝업 21:29:50→21:29:54 자동 닫힘 · X 부재중 알림 1행 | 세션 `3d69c5b4` missed · notification_events 1 |
| 1-4 X 휴대폰 알림창 | NOT_PROVEN — 앱 화면이 떠 있어 생략(기존 동작) | dumpsys |
| 1-5 상대 통화 중 | **PASS** — 21:31:07→21:31:11 자동 닫힘 · X 의 I 통화 유지(00:14) | S15a · X15c |
| 1-6 iPhone 발신 거절 팝업 | **PASS** (미러링 캡처 간격상 약 4~6초) | 미러링 캡처 21:32:44~50 |
| 1-7 무회귀(연결·종료) | **PASS** (I→X 음성 26초 연결·종료) | 세션 `33d83b2a` |
| 3-1 나가기 문구·DB | **PASS** — 문구 일치 · X 참가 행 삭제 | X31c · DB |
| 3-1 나가기 뒤 목록에서 사라짐 | **FAIL** — 분할 화면 목록에 방이 남음(앱 재시작 후 사라짐) | X31d/e/f |
| 3-2 남은 사람 헤더 | **PASS** — 「zxzx11 · 온라인」 사진 유지 | 미러링 |
| 3-3 보내면 상대 재참가 | **PASS** — X 재참가 21:36:49.55 · cleared_at 21:36:48.54 · 안 읽음 1 · X 목록 재등장 | DB · X33 |
| 3-3 X 푸시 표시 | NOT_PROVEN — 앱 화면 떠 있음 | |
| 4-1 새 메시지만 보임 | **PASS** (재시작 직후 상태에서) | X41c |
| 4-2 목록 미리보기 | **PASS** | X42 |
| 4-3 옛 메시지 답장 인용 | **PASS** — 「삭제된 메시지」 | X43 |
| 4-4 옛 메시지 삭제가 X 에 영향 없음 | **PASS** | X44b |
| 4-5 I 기록 전체 | **PASS** | 미러링 |
| 4-6 재시작 후 친구 목록으로 열기 | **PASS** — 「아직 메시지가 없습니다」 | X46e · DB |
| 4-7 목록 미리보기 | **PASS** — 「메시지를 보내 보세요.」 | X46d |
| 4-8 옛 id 직접 조회 | NOT_PROVEN — WebView 디버깅 불가 | |
| 5-1 나간 상대 음성 통화 | **PASS** — 재참가 21:48:04.207 → 세션 .249 → 연결 21:48:10 → 종료 · X 방엔 통화 기록만 | DB · X51 |
| 5-2 영상 | **PASS** — 재참가 21:49:41.216 → 세션 .251 → 연결 21:50:12 → 종료 | DB |
| 5-4 거절 | **PASS** (DB·방 기록) · I 팝업 NOT_PROVEN(캡처 시점) | DB |
| 5-6 무응답 | **PASS** — X 알림창 「부재중 전화 · w테스트1 · 부재중 음성 통화」 · 탭 → 그 방 | dumpsys · X56b |
| **5-6 뒤 X 방 내용** | **FAIL** — 기록 하한 이전 기록 3건(21:48·21:49·21:51)이 보임. 서버 기준 X 에게 보일 것은 「부재중」 1건뿐 | X56c · DB |
| 읽음 표시 | **FAIL** — 상대가 재참가한 뒤 열어 둔 방에서 상대 읽음 미반영(다시 열면 반영) | 미러링 · DB last_read |
| iPhone 흰 화면 | **FAIL(1회·재현 안 됨)** — 21:39 방 열기 후 흰 화면 지속, 배포 교체 직후. devicectl 재실행 후 재현 안 됨 | 미러링 · Vercel 로그 |
| 기타 | 답장 인용 이동 버튼 접근성 이름이 번역 키 그대로 `cm_ui_jump_to_original_message` (기존 결함) | uiautomator |

**미실행(중단):** 3-4, 3-5, 5-3, 5-5, 5-7, 5-8, 5-9, 묶음 2 — FAIL 수정 후 같은 행렬로 재실행.

## 실행 결과 2차 (2026-11-02 22:13~22:46 PHT · Production `b5419b6b5` READY · 세 기기 앱 재실행 후)

| # | 결과 | 증거 |
|---|---|---|
| F-2 방 안 나가기 → 분할 화면 목록 | **PASS** — 22:13:45 나가기, 22:13:51 목록에서 사라짐 | R2 · DB |
| F-1 재시작 없이 재참가 방 열기 | **PASS** — X 가 같은 앱 실행에서 봤던 21:52·21:58 기록 미표시, 「8880011」만 (위로 스크롤 포함) | uiautomator · DB 하한 22:33:39.684 |
| F-3 열어 둔 방에서 상대 읽음 반영 | **PASS** — X 22:34:00 읽음 → iPhone 재진입 없이 「안 읽음」 사라짐(22:34:22 캡처) | DB last_read · 미러링 |
| 3-3 재확인 | **PASS** — X 목록 「8880011 · 1」 재등장 | uiautomator |
| iPhone 나가기 | **PASS** — 문구 · iPhone 목록에서 즉시 사라짐 · iPhone 재참가 후 하한 이후 기록만 표시 | 미러링 · DB |
| 5-3 iPhone 이 나간 방에 X 발신 | 재참가 22:35:41.963 → 세션 .991 · iPhone 푸시 2건 · 무응답 `missed` + iPhone 부재중 알림 1 — **PASS(서버)** / iPhone CallKit 수신·수락 **NOT_PROVEN**(미러링에 CallKit 미표시) | DB |
| 5-5 벨 중 취소 | **PASS** — `cancelled` 22:37:15 → X 수신 화면 22:37:20 사라짐 → 3분간 재울림 없음 | uiautomator · DB |
| 5-8 상대 통화 중 | **PASS** — iPhone 「상대방 통화 중」 팝업 자동 닫힘 · X↔S 통화 유지(00:28) · `cancelled/peer_busy` · X 재참가 안 됨(통화 중 검사가 되살림보다 먼저) | 미러링 · DB |
| 3-4 스티커 | **PASS** — X 재참가 22:42:48.311 → 스티커 .465 · 안 읽음 1 | DB |
| 3-4 사진·음성·파일 | NOT_PROVEN — 기기 최근 사진이 개인 사진뿐이라 업로드하지 않음(같은 서버 함수 `prepareMessengerRoomSend`, 계약 테스트 고정) | |
| **신규 F-5** | **FAIL(원인 확인 못 함)** — X·S 통화 종료(22:42:11) 뒤 분할 화면 오른쪽 방 영역이 빈 레이어(View+빈 TextView)로 덮여 방이 안 열림(22:43~22:45). 웹 콘솔 오류 없음. 뒤로가기 1회로 복구, 이후 방 정상 | uiautomator 덤프 · logcat |
| 기존 로그 | `Uncaught (in promise) Error: "NativeIncomingCall.then()" is not implemented on android` — 앱 주소 열기(app_url_open)마다 반복(이번 변경 무관, 보고만) | logcat |

**미실행:** 차단 묶음(2-1~2-3, 3-5, 5-7) — 차단은 양쪽 친구 관계를 지우므로 시험 계정 친구 재설정이 필요. 5-9 무회귀는 1·2차에서 음성·영상·거절·취소·무응답·통화 중을 Android↔iPhone 로 확인(iPhone 수신 CallKit 제외).
