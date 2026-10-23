# DIBAY 메신저·통화 — 별도 결함 대장 (2026-10-23)

- 기준 계획: `docs/audit/messenger-2026-10-22-reaudit-plan.md` (A~F)
- 진행 방침: `docs/audit/DIBAY_메신저_통화_기존계획_계속진행_및_별도결함관리_20261023.md`
- 규칙: 기존 §1·§2 ID와 중복이면 기존 ID에 증거만 추가. **신규만** 본 대장. 기존 A~F 완료 후 별도 처리 계획. **BLOCKING만** 현 단계에서 독립 처리.

상태: `NEW` / `EVIDENCE_NEEDED` / `CONFIRMED` / `DEFERRED` / `BLOCKING` / `APPROVED` / `FIXED` / `DEVICE_PASS` / `CLOSED`

---

## SIDE-01 — Android 음성 음소거 실기기 FAIL

| 필드 | 내용 |
|---|---|
| 발견일 | 2026-10-23 |
| 기기·빌드 | Samsung APK (보고). Android `1.2.4 (11)` 기준선 |
| 재현 증상 | 음성통화 중 음소거가 실제 작동하지 않음 (Owner) |
| 증거 | Owner 실기기 FAIL 보고. 코드상 `setMicMuted`→`muteLocalAudioStream` 존재 (WP-3 NEW-28) |
| 기존 계획 중복 | CALL-6은 **iOS chrome-only**. Android와 **별개**. 중복 아님 |
| 원인 | **NOT_PROVEN** (C REPORT). 경로 코드 확정 · A/B/C는 logcat·상대 청각 필수. `updateChannelMediaOptions` **가설만으로 적용 금지** |
| 위험도 | 중 (통화 UX). 수신 불가급 아님 |
| 현 단계 | C 설계 완료 · **D 비대상** (증거 후 재상정) |
| 보류 이유 | mute_applied/rejected 미수집 |
| 처리 예정 | 증거 수집 → 원인 확정 → Android voice 단독 |
| 상태 | `EVIDENCE_NEEDED` |

다음 증거(수정 전 필수): logcat `native_voice_mic_mute_rejected` / `native_voice_mic_mute_applied` · callId vs occupant · 버튼 chrome · iPhone 상대 청각.

---

## SIDE-02 — 음성→영상 전환 버튼 없음

| 필드 | 내용 |
|---|---|
| 발견일 | 2026-10-23 |
| 기기·빌드 | Android / iOS 음성 UI |
| 재현 증상 | 통화 중 영상 전환 없음 |
| 증거 | Android `NativeVoiceCallActivity` NEW-27: video **GONE** until WP-10. iOS voice video button **disabled** |
| 기존 계획 중복 | 단계 E / WP-10 정책과 연결 가능. 즉시 구현 대상 아님 |
| 원인 | **의도적 미배선** (제품 보류) |
| 위험도 | 낮 (기능 미제공) |
| 현 단계 차단 | 아니오 |
| 보류 이유 | Owner WP-10/E 승인 전 구현 금지 |
| 처리 예정 | 단계 E 또는 별도 승인 후 |
| 상태 | `DEFERRED` |

---

## SIDE-03 — iPhone 메신저 대화 목록에 기존 방 미표시 · 새로고침만 보임

| 필드 | 내용 |
|---|---|
| 발견일 | 2026-10-23 15:34 PHT |
| 기기·빌드 | iPhone `1.2 (11)` · `w테스트1` · tip `0fb36c4f9` |
| 재현 증상 | 대화 리스트에 이전 테스트하던 `q테스트1` 방이 안 나옴. 새로고침 UI만 계속 보임 (Owner) |
| 증거 | Owner 실기기 보고. B 단계 관찰 중 발견. (코드 원인·DB 조회는 미실시 — B에서 수정 금지) |
| 기존 계획 중복 | §2 묶음1(타임라인·목록)·메신저 홈 계열과 관련 가능. **SIDE 신규** (기존 ID 미특정) |
| 원인 | **NOT_PROVEN** (C). cap/merge/filter 제품 가설 강 · roomId·bootstrap 증거 부족 |
| 위험도 | 중 (메신저 진입·방 선택 불가) |
| 현 단계 | C 설계 · **D 비대상** |
| 보류 이유 | membership·home-sync 로그·보관/칩 미확인 |
| 처리 예정 | 증거 후 웹 bootstrap merge 최소 수정 |
| 상태 | `EVIDENCE_NEEDED` |

다음 증거(수정 전): 스크린샷 · roomId · 홈 bootstrap/API · Realtime · membership · 보관/칩 · Production SHA.

---

## SIDE-04 — Android `am force-stop` 직후 수신 실패 (①꺼짐 준비 방법)

| 필드 | 내용 |
|---|---|
| 발견일 | 2026-10-23 15:31~15:32 PHT |
| 기기·빌드 | Samsung `1.2.4 (11)` |
| 재현 증상 | Cursor가 `adb am force-stop` 한 상태에서 I→S 발신 시 Samsung 수신 안 됨. Owner가 최근 앱에서 **밀어 종료** 후 동일 경로로 수신·연결 PASS |
| 증거 | 세션 `32c3b295` cancelled(수신 전 취소로 추정) · 이후 `b81f53b7` ended_by_callee answered/connected · FCM `call_ringing` sent. Owner 보고 |
| 원인 | **미확정** — `force-stop` 은 Android에서 브로드캐스트/FCM 수신을 막는 경우가 있어, scenario **①꺼짐(=밀어 종료)** 과 **동일하지 않을 수 있음**. 제품 결함 vs 테스트 준비 오류 미분리 |
| 위험도 | 중(테스트 왜곡) / 제품 영향은 NOT_PROVEN |
| 현 단계 차단 | 아니오 |
| 보류 이유 | B에서 `force-stop` 사용 금지. ①꺼짐은 Owner 밀어 종료만. 제품 수정은 원인 확정 후 |
| 상태 | `EVIDENCE_NEEDED` |

---

## SIDE-05 — iPhone 메신저 알림음 미재생 (F1·F2)

| 필드 | 내용 |
|---|---|
| 발견일 | 2026-10-23 15:53~15:58 PHT |
| 기기·빌드 | iPhone `1.2 (11)` · `w테스트1` · tip `0fb36c4f9` |
| 재현 증상 | F1(①꺼짐): 3회 중 **2회 모달만·알림음 없음** · 탭 시 앱→커뮤니티→방. F2(②잠금): 알림 **3회 표시·알림음 0/3**. F10(①꺼짐 연속): 알림4·뱃지4·**알림음 없음** |
| 증거 | F1·F2 기존. F10: msg `V`×4 `00701fe1`~`f871f2b5` · APNs sent 4 · Owner 알림4·뱃지4·음없음. voip skipped 정상. (인앱 F3에서는 알림음 있음 → BG/terminated 경로 의심) |
| 기존 계획 중복 | 알림음·silent unlock hard-lock 계열과 관련 가능. **SIDE 신규** (B 관찰) |
| 원인 | **제품 코드 NOT_PROVEN** (C). `aps.sound` 항상 `"default"` · iOS strip 없음 · **OS/기기 1순위**. 인앱 F3≠APNs 경로 |
| 위험도 | 중 (알림 표시는 되나 소리 누락) |
| 현 단계 | C 설계 · **D 비대상** (OS 확인 선행) |
| 보류 이유 | 무음스위치·Focus·앱 소리 설정 미확인 — 정상 OS를 결함 오판 금지 |
| 처리 예정 | OS 확인 → 제품 무음이면 APNs 캡처 후 재상정 |
| 상태 | `EVIDENCE_NEEDED` |

다음 증거(수정 전): iOS 알림 소리·Focus·무음 스위치 스크린샷 · (필요 시) APNs body 캡처.

---

## SIDE-06 — iPhone 메신저 목록 안읽음 +1 과다 (F3)

| 필드 | 내용 |
|---|---|
| 발견일 | 2026-10-23 16:00~16:02 PHT |
| 기기·빌드 | iPhone `1.2 (11)` · `w테스트1` · tip `0fb36c4f9` |
| 재현 증상 | I ④켜짐(다른 방)에서 S→I 텍스트 **1회** 전송 시 목록 안읽음이 **2**로 표시. 3회 반복 동일. 인앱 배너·알림음·목록 맨 위는 정상 |
| 증거 | Owner 실기기. msg `04fb64bb`·`78d5d1be`·`965178bb`·`7ca265ab` room `c202326f`. B 관찰만 — unread 계산 코드 미추적 |
| 기존 계획 중복 | 메신저 홈 unread/Realtime 계열과 관련 가능. **SIDE 신규** |
| 원인 | **CONFIRMED** (C) — participant RT 절대값 + 메시지 낙관 `unread+1` 이중 · merge 하향 차단. B: UI=2 · DB `unread_count=1` |
| 위험도 | 중 (배지 신뢰) |
| 현 단계 | D 완료 |
| 보류 이유 | — |
| 처리 예정 | — |
| 상태 | **`DEVICE_PASS` / `CLOSED`** (2026-10-23) · main/Prod `04369b207` · F3 1→2→3·입장0·F4·무회귀 PASS |

다음 증거: —.

---

## SIDE-07 — Samsung 잠금 화면 메신저 알림 미표시 (F6)

| 필드 | 내용 |
|---|---|
| 발견일 | 2026-10-23 16:07 PHT |
| 기기·빌드 | Samsung `1.2.4 (11)` · `q테스트1` · tip `0fb36c4f9` |
| 재현 증상 | S ②잠금에서 I→S 텍스트 시 **알림음은 울림** · **잠금 화면에는 알림이 안 보임**. Owner: 기기 설정 의심 |
| 증거 | Owner 실기기. msg `60e01697` · FCM `chat_message` sent `d1d4c2a4`. F5(①꺼짐)에서는 알림·소리·탭 진입 PASS → 전달 자체는 동작 |
| 기존 계획 중복 | Android 알림 채널·잠금 표시 정책과 관련 가능. **SIDE 신규** |
| 원인 | **제품 NOT_PROVEN** (C). 전달·소리 OK · 채널 생성 PUBLIC · **Samsung OS/채널 잠금 표시 1순위** — 오판 금지 |
| 위험도 | 중 (소리는 나고 잠금 UI만 없음) |
| 현 단계 | C 설계 · **D 비대상** (OS·logcat 선행) |
| 보류 이유 | 잠금/채널 설정·`DIBAY_FCM` logcat 미확인 |
| 처리 예정 | OS면 CLOSE · 제품이면 채널 id 마이그레이션 |
| 상태 | `EVIDENCE_NEEDED` |

다음 증거(수정 전): 잠금 알림·채널 설정 스크린샷 · logcat `native_notification_posted` vs `foreground_skip`.

---

## SIDE-08 — 통화 인앱 안내 UI 난립 · 위치/형태 · 기기별 불일치

| 항목 | 내용 |
|---|---|
| 발견 | 2026-10-23 E-C1 caller_busy 실기기 + Owner 확인 |
| 기기·빌드 | Android APK · iOS (비교 대상) |
| 재현 증상 | (1) E-C1 안내는 **상단 녹색 배너**로 뜸 — Owner 요청은 **화면 정중앙 팝업**. (2) 체감상 **예전에 하단이던 「통화 이상」류 팝업**이 녹색·상단으로 올라간 형태로 보임(배너 계약 재사용). (3) 통화 관련 알림·배너·팝업·네이티브 화면이 **종류가 많음** → 기기별 동일성 정리 필요. (4) APK에서 상단 안내 bounds가 헤더「채팅」과 **Y겹침** |
| 증거 | `tmp/ec1-notice-2026-10-23/caller-notice-1.xml` — 안내 `[208,126][883,244]` · 헤더 `[160,157][247,219]` 겹침. Owner: 중앙 팝업·기기 통일 **향후** |
| 기존 계획 중복 | **E-C3**(중앙 공통 팝업) · 배너 계약과 맞닿음. E-C1 busy **문구/기록**과 분리. SIDE에서 표시·채널 정리로 묶고 E-C3 착수 시 통합 가능 |
| 원인 | **NOT_PROVEN** (레이어·컴포넌트 분기 미감사) |
| 위험도 | 중 |
| **상태** | **CLOSED (웹)** — E-C3에 통합 · 5 확정 이벤트 → `DibayInfoDialog` CENTER · 상단 배너 헤더 겹침 해소. **네이티브 Activity/VC overlay 상단 안내는 미변경**(웹·WebView 완료 판정만). |

웹 구현: `stage-e-c3-central-notice-design.md` · contract `presentation: CENTER` · `CallInAppNoticeCenterDialog`.

---

## (예약) 추가 결함

발생 시 본 파일에 SIDE-0N 행 추가. 기존 계획 ID 대조 후 등록.
