# 단계 B 실기기 기준선 REPORT (2026-10-23)

- 계획: `docs/audit/messenger-2026-10-22-reaudit-plan.md` §3 B
- 관찰 SSOT: `.tmp/call-scenarios-2026-10-22/scenario.md` (**C1~G2** · 2026-10-22 REPORT NOT_RUN 잔여)
- 계획 문구「메신저 M·N·O·P·Q」→ 본 SSOT **F1~F10**으로 실행
- 성격: **관찰만**. 코드·네이티브·DB·신규 기능 수정 없음
- Production / tip: `0fb36c4f9`
- 설치: Samsung `1.2.4 (11)` · iPhone `1.2 (11)`
- 계정: S=`q테스트1` · I=`w테스트1` · X=`zxzx11`(**활성 device 0 → E1·E2 NOT_PROVEN**)
- 보류(이번 B 수정 금지): SIDE-01 · SIDE-02 · 15:14~16 수신 체감(희귀·NOT_PROVEN)

## 재사용 증거 (재수집 안 함)

| ID | 판정 | 근거 |
|---|---|---|
| E3 | PASS | A7 세션 `28ccece5` 직전/직후 재발신·수신·연결 (15:23~15:25 PHT) |
| E5 | PASS | A6 §4-17-11 Owner 청각 + `native_voice` 스피커 로그 |
| E6 | PASS | A6 §4-17-11 Owner 음소거 청각 + mic_mute 로그 |
| E7 | PASS | A7 Owner 「스피커 음소거 끝」·세션 `28ccece5` connected |
| E8 스피커 | PASS | A6 진행 시 Owner/관찰 「Samsung 스피커 됨」(scenario 주석과 동일) |
| E8 음소거 | FAIL | **SIDE-01** (별도 대장) — B에서 수정 안 함 · 관찰만 유지 |
| E9 | NOT_PROVEN | A6에서 영상 무회귀 Owner `3 끝`만 있음 · 스피커/음소거 분리 측정 없음 |
| E10 | NOT_PROVEN | CallKit 시스템 UI 스피커·음소거 동기화 미측정 |

## 실행표 (진행)

| ID | 판정 | callId/시각 | 비고 |
|---|---|---|---|
| C1 | **PASS*** | `b81f53b7` · 15:31:51~15:32:20 PHT | *Owner가 밀어 종료 후 수신·연결·S 종료. `am force-stop` 준비 상태에서는 수신 실패 → **SIDE-04** |
| C2 | **PASS** | `ead1aace` · 15:36:34~15:36:55 PHT | 잠금 수신·연결 · ended_by_caller(I 종료) |
| C3 | **PASS** | `ed61954b` · 15:38:13~15:38:32 PHT | BG 수신·연결 · ended_by_callee(S 종료) |
| C4 | **PASS** | `65d84573` · 15:39:28~15:39:45 PHT | FG 수신·연결 · ended_by_caller(I 종료) |
| C5 | **PASS** | `c9000367` · 15:40:28~15:40:39 PHT | rejected / declined |
| C6 | **PASS** | `180f2625` · 15:41:31~15:41:36 PHT | 잠금 거절 rejected/declined |
| C7 | **PASS** | `41147ef9` · 15:42:37~15:42:52 PHT | 취소 · Owner 「재울림 없음」 |
| C8 | **PASS** | `cb54806b` · 15:44:12~15:44:43 PHT | missed · missed_call sent · Owner 부재중 알림 있음 |
| D1 | **PASS** | `a8eeb045` · 15:45:49~15:46:08 PHT | video · ended_by_callee |
| D2 | **PASS** | `b2a98547` · 15:47:02~15:47:19 PHT | video · ended_by_caller |
| D3 | **PASS** | `5e49b9c4` · 15:48:09~15:48:26 PHT | video · ended_by_callee |
| D4 | **PASS** | `07dad1e0` · 15:49:18~15:49:26 PHT | video · rejected/declined |
| E1·E2 | NOT_PROVEN | | X 활성 device 없음 |
| E4 | **PASS** | `9d1ea84f`·`26a28f5f`·`c329c992` · 15:51:12~15:52:06 PHT | S→I 음성 3연속 수신·연결 |
| E9·E10 | NOT_PROVEN | | 재사용 표 유지 (분리 측정 없음) |
| F1 | **FAIL** | msg `eb0e137b`·`549ee162`·`5ef07a89` · 15:53:17~15:54:15 PHT | 알림 표시는 됨 · **알림음 3중 2회 없음** → SIDE-05 · 탭 진입=앱→커뮤니티→방 |
| F2 | **FAIL** | msg `3e047ac9`·`3ca0247d`·`b91b83b9` · 15:58:12~15:58:43 PHT | 잠금 알림 3회 표시 · **알림음 0/3** → SIDE-05 |
| F3 | **FAIL** | msg `04fb64bb`~`7ca265ab` · 16:00:46~16:01:53 PHT | 인앱 배너·알림음·맨위 OK · **1건 전송인데 안읽음 2** → SIDE-06 |
| F4 | **PASS** | msg `cb0f8efe`~`c1be1b10` · 16:04:22~16:04:37 PHT | 같은 방 즉시 표시 · 알림 없음 · chat_message delivery 0 |
| F5 | **PASS** | msg `4e189740` · 16:05:40 PHT | 알림·알림음 · FCM sent · 탭=앱→커뮤니티→방(관찰) |
| F6 | **FAIL** | msg `60e01697` · 16:07:35 PHT | 알림음 울림 · **잠금 화면 알림 미표시** → SIDE-07 (OS설정 가능·미확정) |
| F7 | **PASS** | msg `eb299f8b`·`1b23ce05` · 16:09:38~16:09:44 PHT | 같은 방 즉시 표시 · 알림음 없음(기대) · delivery 0 |
| F8 | **PASS** | img `276eb247`·`4f8d4efc` · 16:11:02~16:11:15 PHT | S→I·I→S image · 양쪽 표시 · thumb meta 있음 |
| F9 | **PASS** | 16:12:24~16:12:41 PHT | Owner 수신 누락·중복 없음 · DB는 입력 오타 혼입 |
| F10 | **FAIL** | msg `00701fe1`~`f871f2b5` · 16:15:19~16:15:23 PHT | 알림4·뱃지4(메시지4와 일치) · **알림음 없음** → SIDE-05 |
| G1 | **PASS** | 16:17~16:18 PHT 스크린샷 | S·I 통화탭 목록 대칭(발신↔수신·거절·영상) |
| G2 | **PASS** | 16:20~16:21 PHT 스크린샷 | 방 안 통화 기록 메시지 · 종류·시간·중복 없음 |

---

## 시나리오 상세

### C1 — I→S 음성 · S ①꺼짐
- 시각: 15:31:51~15:32:20 PHT · callId: `b81f53b7-c185-4866-b436-7db39d9d397b`
- 선행 실패: Cursor `am force-stop` 상태 → 수신 안 됨 (세션 `32c3b295` cancelled) → **SIDE-04**
- Owner: 앱 밀어 종료 후 수신 → 연결 → S 종료
- DB: answered_at·connected_at 있음 · ended_by_callee · FCM call_ringing sent
- 판정: **PASS** (①꺼짐=밀어 종료 기준) · 준비 방법 이슈는 SIDE-04
- 별도: iPhone 대화목록 미표시 → **SIDE-03** (B에서 수정 안 함)

### C2 — I→S 음성 · S ②잠금
- 시각: 15:36:34~15:36:55 PHT · callId: `ead1aace-40bd-4fa2-a292-64209fd9000d`
- DB: accepted · connected · ended_by_caller · FCM call_ringing sent
- 판정: **PASS**

### C3 — I→S 음성 · S ③뒤
- 시각: 15:38:13~15:38:32 PHT · callId: `ed61954b-6e25-493d-afaf-d014f1c33e15`
- DB: accepted · connected · ended_by_callee
- 판정: **PASS**

### C4 — I→S 음성 · S ④켜짐
- 시각: 15:39:28~15:39:45 PHT · callId: `65d84573-1de0-45cf-b2cb-0a9a5e3ea467`
- DB: accepted · connected · ended_by_caller
- 판정: **PASS**

### C5 — I→S 음성 · S ①꺼짐 · 거절
- 시각: 15:40:28~15:40:39 PHT · callId: `c9000367-bf15-4226-99f0-ca8958148c99`
- DB: status=rejected · declined
- 판정: **PASS**

### C6 — I→S 음성 · S ②잠금 · 거절
- 시각: 15:41:31~15:41:36 PHT · callId: `180f2625-0ee5-4765-ab60-da90c1b160f5`
- DB: status=rejected · declined
- 판정: **PASS**

### C7 — I→S 음성 · S ①꺼짐 · 발신 취소
- 시각: 15:42:37~15:42:52 PHT · callId: `41147ef9-22f2-4bd2-8a41-57e092ea713c`
- DB: cancelled · call_cancel sent · Owner: 재울림 없음
- 판정: **PASS**

### C8 — I→S 음성 · S ①꺼짐 · 무응답
- 시각: 15:44:12~15:44:43 PHT · callId: `cb54806b-2752-4557-9f5f-1d13d7039c4a`
- DB: missed · missed_call sent · Owner: 부재중 알림 있음
- 판정: **PASS**

---
**C1~C8 완료.**

### D1 — I→S 영상 · S ①꺼짐
- 시각: 15:45:49~15:46:08 PHT · callId: `a8eeb045-f0ea-4f46-bdbf-c32a1aeaa49b`
- DB: call_kind=video · accepted · connected · ended_by_callee
- 판정: **PASS**

### D2 — I→S 영상 · S ②잠금
- 시각: 15:47:02~15:47:19 PHT · callId: `b2a98547-6f1d-4b82-8ff4-23b1e370ea8a`
- DB: video · accepted · connected · ended_by_caller
- 판정: **PASS**

### D3 — I→S 영상 · S ④켜짐
- 시각: 15:48:09~15:48:26 PHT · callId: `5e49b9c4-8493-4bb3-a153-d177945f2ac6`
- DB: video · accepted · connected · ended_by_callee
- 판정: **PASS**

### D4 — I→S 영상 · S ①꺼짐 · 거절
- 시각: 15:49:18~15:49:26 PHT · callId: `07dad1e0-a6ae-45de-b00d-674c6a19d2f5`
- DB: call_kind=video · status=rejected · declined
- 판정: **PASS**

---
**D1~D4 완료.**

### E4 — S→I 음성 · I ①꺼짐 · 받기→끊기 3연속
- 시각: 15:51:12~15:52:06 PHT
- callId: `9d1ea84f-8377-443e-ac78-31a936f296b0` · `26a28f5f-eacf-4648-b681-545a92fdafe0` · `c329c992-3dec-40ba-aeda-ea851e5d442b`
- DB: 3건 모두 voice · answered · connected · ended
- 판정: **PASS** (3번 모두 수신·연결)

---
**E 구간 완료** (E1·E2·E9·E10 NOT_PROVEN 유지 · E3·E5~E8 재사용).

### F1 — S→I 텍스트 · I ①꺼짐
- 시각: 15:53:17~15:54:15 PHT · 메시지 3건 `111` · room `c202326f`
- msgId: `eb0e137b` · `549ee162` · `5ef07a89`
- DB: APNs `chat_message` sent 2건(`87cb7db4` 15:53:18 · `f8e9048f` 15:54:16) · voip 토큰 skipped(정상)
- Owner: 3중 **2회 알림 모달만·알림음 없음** · 알림 탭 시 **앱 → 커뮤니티 → 해당 채팅방** 형태로 진입
- 판정: **FAIL** (시나리오: 알림·소리) — B에서 수정 안 함 → **SIDE-05**
- 탭 목적지(해당 방)는 도달 · 중간 경로(커뮤니티 경유)는 관찰만 (별도 FAIL 미승격)

### F2 — S→I 텍스트 · I ②잠금
- 시각: 15:58:12~15:58:43 PHT · 메시지 3건 (`222`/`111`/`3333`)
- msgId: `3e047ac9` · `3ca0247d` · `b91b83b9`
- DB: APNs `chat_message` sent 3건 http 200 (`6413bb6a`·`ac001e51`·`dbf52b76`)
- Owner: 잠금 알림 **3회 옴** · **알림음 없음** (앱 죽음/멈춤 아님)
- 판정: **FAIL** (소리) → **SIDE-05** 증거 추가 · B에서 수정 안 함

### F3 — S→I 텍스트 · I ④켜짐(다른 대화방)
- 시각: 16:00:46~16:01:53 PHT · 메시지 4건 (`Err`/`Err`/`Ggg`/`Vgvv`) — Owner「3회」+ 추가 1건
- msgId: `04fb64bb` · `78d5d1be` · `965178bb` · `7ca265ab`
- Owner: 「메세지가 도착 했습니다」배너 + **알림음 있음** · 목록 **맨 위** · **1회 보내도 안읽음 2** (3회 동일)
- 판정: **FAIL** (안읽음 배지) — 배너·소리·맨위는 PASS 관찰 → **SIDE-06** · B에서 수정 안 함

### F4 — S→I 텍스트 · I ④켜짐(같은 대화방)
- 시각: 16:04:22~16:04:37 PHT · msg `cb0f8efe`·`e7c7341c`·`c1be1b10`
- DB: 해당 구간 `chat_message` delivery **0**
- Owner: 즉시 표시 · 알림 없음
- 판정: **PASS**

### F5 — I→S 텍스트 · S ①꺼짐
- 시각: 16:05:40 PHT · msg `4e189740` (`Huhh`)
- DB: FCM `chat_message` sent (`0a039878`)
- Owner: 알림·알림음 있음 · 탭 시 **앱 → 커뮤니티 → 해당 방** (F1 iPhone과 동일 경로 · 목적지 방 도달)
- 판정: **PASS** (알림·소리·방 진입) · 다단 경로는 관찰만

### F6 — I→S 텍스트 · S ②잠금
- 시각: 16:07:35 PHT · msg `60e01697` (`Jjh`)
- DB: FCM `chat_message` sent (`d1d4c2a4`)
- Owner: **알림음 울림** · **잠금 화면에는 알림 안 보임** · 기기 설정 의심
- 판정: **FAIL** (시나리오: 잠금 화면 알림) → **SIDE-07** · B에서 수정 안 함. 원인=제품 vs OS 잠금알림 표시 설정은 **미확정**

### F7 — I→S 텍스트 · S ④켜짐(같은 대화방)
- 시각: 16:09:38~16:09:44 PHT · msg `eb299f8b`·`1b23ce05`
- DB: `chat_message` delivery **0**
- Owner: 즉시 표시 · 알림음 없음
- 판정: **PASS**

### F8 — 양방향 사진 1장씩 · 같은 방
- 시각: 16:11:02~16:11:15 PHT · `276eb247`(S) · `4f8d4efc`(I) · type=image · `image_thumb_url` meta 있음
- Owner: 양쪽 정확히 표시 (썸네일=채팅 말풍선 미리보기 이미지)
- 판정: **PASS**

### F9 — S→I 빠른 연속 전송
- 시각: 16:12:24~16:12:41 PHT · S 텍스트 연속
- DB 내용: `1,W,2,2,4,5,6,7,8,9,Q0` (입력 오타·3 없음·10=`Q0`) — 전송 무결성 이슈로 보지 않음
- Owner: 문제 없음 (수신 누락·중복 없음)
- 판정: **PASS**

### F10 — S→I 텍스트 연속 · I ①꺼짐
- 시각: 16:15:19~16:15:23 PHT · msg 4건 `V` (`00701fe1`·`036b6f2a`·`f08c847b`·`f871f2b5`) — 시나리오「3개」대비 Owner/DB **4건**
- 선행 08:14 `Z`×3 + APNs sent 3건도 존재 (1차 시도로 추정)
- DB: APNs `chat_message` sent 4건(2차) http 경로 정상
- Owner: **알림 4개** · **알림음 없음** · **뱃지 4**
- 판정: **FAIL** (소리) → **SIDE-05**. 알림·뱃지 수는 메시지 4와 일치(개수 불일치 FAIL 아님)

---
**F1~F10 완료.** FAIL: F1·F2·F10(SIDE-05) · F3(SIDE-06) · F6(SIDE-07).

### G1 — 통화 기록 탭
- 시각: 16:17~16:18 PHT · Owner 스크린샷 2장 (S=`q테스트1` · I=`w테스트1`)
- 관찰: 상단 동일 시각대 — S 발신 음성 3건 ↔ I 수신 음성 3건 · S 거절 영상 3:49 ↔ I 거절 · S 수신 영상 ↔ I 발신 영상 (대칭)
- Owner: 「통화목록 동일」
- 판정: **PASS**

### G2 — 대화방 안 통화 기록 메시지
- 시각: 16:20~16:21 PHT · Owner 스크린샷 2장 (I=`q테스트1`방 · S=`w테스트1`방)
- 관찰: 음성/영상 · 거절(주황) · 취소(회색) · 부재중(빨강) · 연결 초수(초록) · 발신/수신 라벨 · 양측 대응 · **중복 없음**
- 판정: **PASS**

---

## 단계 B 종료 요약 (2026-10-23 16:21 PHT)

- 관찰 SSOT **C1~G2** 실행 완료 (코드·네이티브 수정 없음)
- Production tip: `0fb36c4f9` · 설치 S `1.2.4 (11)` · I `1.2 (11)`

### PASS
C1*~C8 · D1~D4 · E3·E4·E5~E8(재사용, E8음소거는 SIDE-01 관찰) · F4·F5·F7·F8·F9 · G1·G2  
\*C1: 밀어종료 기준 PASS · force-stop은 SIDE-04

### FAIL → 단계 C (수정은 C에서만)
| ID | SIDE | 요지 |
|---|---|---|
| E8 음소거 | SIDE-01 | Android 음성 음소거 실기기 |
| (보류) | SIDE-02 | 음성→영상 전환 미제공 |
| C1 부수 | SIDE-03 | iPhone 대화목록 미표시 |
| C1 준비 | SIDE-04 | `am force-stop` ≠ ①꺼짐 |
| F1·F2·F10 | SIDE-05 | iPhone 메신저 **알림음** 미재생(BG/잠금) |
| F3 | SIDE-06 | iPhone 목록 **안읽음 +1** |
| F6 | SIDE-07 | Samsung **잠금화면 알림** 미표시 |

### NOT_PROVEN
E1·E2 (X=`zxzx11` 활성 device 0) · E9·E10 (스피커/CallKit 분리 미측정) · 15:14~16 희귀 수신

### 다음
단계 **C** = 위 FAIL/SIDE만 원인 확정 → 최소 수정. B에서 쌓인 PASS는 재수집하지 않음.

