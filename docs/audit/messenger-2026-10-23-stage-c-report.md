# 단계 C REPORT — SIDE-01·03·05·06·07 원인·최소 설계 (2026-10-23)

- 계획: `docs/audit/messenger-2026-10-22-reaudit-plan.md` · 방침: `docs/audit/DIBAY_메신저_통화_기존계획_계속진행_및_별도결함관리_20261023.md`
- B 증거 SSOT: `docs/audit/messenger-2026-10-23-stage-b-report.md` (PASS 재수집 없음)
- 대장: `docs/audit/messenger-side-defect-ledger-2026-10-23.md`
- Production tip (B 기준): `0fb36c4f9` · 설치 S `1.2.4 (11)` · I `1.2 (11)`
- **본 단계 범위:** 원인 대조·최소 수정 **설계만**. **코드·네이티브·DB 수정 · main 반영 · 배포 없음.**
- **보류 유지:** SIDE-02 · SIDE-04 · E1/E2/E9/E10 · 15:14~16 희귀 수신

---

## 0. D 구현 승인 대상 요약

| SIDE | 원인 판정 | D 승인 후보 |
|---|---|---|
| **SIDE-06** | **CONFIRMED** — 클라 낙관 `unread+1` + participant RT 절대값 겹침 · merge 하향 차단 (B: UI=2 · DB `unread_count=1`) | **예** |
| SIDE-01 | **NOT_PROVEN** — mute 경로 코드 명확 · A/B/C 분기는 logcat 필수 | **아니오** (증거 수집 후 재상정) |
| SIDE-03 | **NOT_PROVEN** — cap/merge/filter 제품 가설 강함 · roomId·bootstrap 증거 부족 | **아니오** (증거 후) |
| SIDE-05 | **제품 코드 결함 NOT_PROVEN** — `aps.sound` 항상 `"default"` · iOS strip 없음 · 간헐 무음은 **OS/기기 우선** | **아니오** (OS 확인 후) |
| SIDE-07 | **제품 코드 결함 NOT_PROVEN** — 채널 생성 시 PUBLIC · 소리 O·잠금 UI X는 **OS/채널 설정 우선** | **아니오** (OS·logcat 확인 후) |

---

## SIDE-01 — Android 음성 음소거 실기기 FAIL

### 1. B 증상·코드 경로 대조
- **B:** E8 음소거 FAIL (재사용) · Owner 「Android 음소거 안 됨」 · A6 iOS 음소거 PASS와 분리.
- **코드 경로 (확정):**  
  `activity_native_voice_call.xml` mute → `NativeVoiceCallActivity.java:554-575` → `NativeVoiceCallAgoraEngine.setMicMuted` (`:136-152`) → `RtcEngine.muteLocalAudioStream`.  
  거부: `native_voice_mic_mute_rejected` (`reason=not_occupant` — engine null 포함) · 적용: `native_voice_mic_mute_applied … result=`.  
  `updateChannelMediaOptions`는 **mute 시 미사용** (join 옵션만).

### 2. 원인
| 가설 | 의미 | 판정 |
|---|---|---|
| A | not_occupant / callId·engine 불일치 | 코드로 가능 · **기기 로그 없음 → NOT_PROVEN** |
| B | Agora `result≠0` | 로그로 확정 가능 · **미수집 → NOT_PROVEN** |
| C | `result=0`인데 상대 청각 유지 | 코드만 불가 · **NOT_PROVEN** |
| D | CONNECTED 전 chrome 비활성(탭 무반응) | 코드 가능 · 증상 「음소거 실패」와 구분 필요 |

**원인 확정: NOT_PROVEN** (ledger 필수 증거 미충족: `mute_rejected`/`mute_applied` · occupant · 상대 청각).

### 3. 최소 수정 (확정 후)
- A: occupant/engine ready 후에만 mute chrome · rejected reason 분리.  
- B: join 성공 후 mute · result 로깅/재시도.  
- C: **증거 전 `updateChannelMediaOptions` 금지** (ledger HARD).  
- 파일: `NativeVoiceCallAgoraEngine.java` · `NativeVoiceCallActivity.java` (± `UiPresenter`/`Runtime`). **Android voice 단독 커밋.**

### 4. 영향
- **범위:** Android 음성만. iOS CallKit/VoIP·메신저·알림·영상 mute 경로 비대상.
- 회귀 위험: 음성 연결·unmute·재발신.

### 5. 검증 기준
- **수정 전:** Samsung 음성 연결 중 mute ON/OFF ×3 · logcat `DIBAY_NATIVE_VOICE` · iPhone 상대 청각 기록 → A/B/C 확정.
- **수정 후:** 동일 행렬 + Android↔iPhone 음성 무회귀 1회.

### 6. 복구
- 해당 Android voice 커밋만 `git revert` · `native:prepare` 후 재설치 (버전 bump는 빌드 시 규정 따름).

---

## SIDE-03 — iPhone 메신저 대화 목록 미표시 · 새로고침만 보임

### 1. B 증상·코드 경로 대조
- **B (C1 부수, 15:34 PHT):** `w테스트1` 목록에 `q테스트1` 방 없음 · 새로고침 UI만 · 이후 통화/메시지는 방으로 진입 가능(경로 우회).
- **코드:**  
  bootstrap `fetchMyRoomsPayload` critical **20** / full **30** (`home-sync-room-caps.ts`) ·  
  `shouldSkipHomeSyncPayload` / warm cache ·  
  PTR=`clearBootstrapCache`+`refresh(false)` (`run-messenger-home-pull-refresh.ts`) ·  
  필터 `communityMessengerRoomIsVisibleInMainChatInbox` (보관·차단·삭제 제외) ·  
  missing room: `scheduleHomeMissingRoomSummaryMerge`.

### 2. 원인
| 가설 | 판정 |
|---|---|
| Capped bootstrap + silent home-sync skip → 행 미승격 · PTR만 full | **제품 가설 강** · roomId·`[home-sync]` 로그 없음 → **NOT_PROVEN** |
| 보관함/칩 필터 | 설정·UI 미확인 → **NOT_PROVEN** |
| membership 없음 | B에서 DB 미조회 → **NOT_PROVEN** |

**원인 확정: NOT_PROVEN.**

### 3. 최소 수정 (확정 후 후보)
- 목록에 없는 roomId가 payload에 있으면 `shouldSkipHomeSyncPayload` 금지 · critical 후 full 실패 재시도 · missing-room-summary 재시도.  
- 파일: `lite-merge-gate.ts` · `use-community-messenger-home-bootstrap.ts` · (± `use-community-messenger-home-realtime-bootstrap-list.ts`). **웹 단독 · 네이티브 불요.**

### 4. 영향
- 메신저 홈 목록 merge만. CallKit/VoIP/통화/알림 페이로드 비대상. 과다 merge 시 목록 깜빡임 가능.

### 5. 검증 기준
- **수정 전 필수:** 빠진 `roomId` · 보관/칩 · `participants` membership · WebInspector home-sync 로그 · 방 수>20 여부.
- **수정 후:** 콜드 스타트 → 대상 방 표시(PTR 없이) · PTR 무회귀 · 안읽음 배지(SIDE-06과 분리 확인).

### 6. 복구
- 해당 웹 커밋 revert · main 푸시(Vercel) · 앱 재시작.

---

## SIDE-05 — iPhone 메신저 알림음 미재생 (F1·F2·F10)

### 1. B 증상·코드 경로 대조
- **B:** F1 3중 2회 무음 · F2 잠금 0/3 무음 · F10 알림4·뱃지4·무음 · **F3 인앱 배너+알림음 PASS** · APNs `chat_message` sent(http 200)와 표시 일치.
- **서버 APNs:** `buildApnsAlertBody` (`apns-sender-impl.ts:222-225`) — **`aps.sound` 항상 `"default"`** (조건부 생략 없음). chat에 `content-available` 없음.  
  SSOT `ios_sound_name` → data `sound`만 · **`aps.sound` 미반영**(커스텀음 미적용 gap — 완전 무음 설명력 약함).
- **인앱 F3:** Realtime → `ingestMessengerMessageSound` (Web Audio) — **APNs와 별 경로**.
- **iOS 네이티브:** chat alert sound strip / willPresent 무음 처리 **없음**.

### 2. 원인 (층 분리 — Owner 지시)
| 층 | 판정 |
|---|---|
| **앱 코드 (iOS/Web BG)** | chat APNs 소리를 끄는 코드 **없음** → **제품 strip 가설 기각** |
| **APNs payload** | 코드상 항상 `sound:"default"` · wire JSON은 deliveries에 미저장 → wire 일치 **NOT_PROVEN**(유닛 `aps.sound==="default"`로 코드 계약은 PASS) |
| **iOS 알림/OS** | 무음 스위치·Focus·앱「소리」OFF · 간헐 패턴과 정합 → **1순위 후보 · 기기 확인 전 NOT_PROVEN** |

**제품 결함으로 D 구현할 원인: NOT_PROVEN.** (OS 정상일 수 있음 — 오판 금지)

### 3. 최소 수정
- **지금:** 코드 수정 **금지**. Owner/작업자: 설정→DIBAY→알림→**소리** · 무음 스위치 · Focus 고정 후 F2 재관찰 1회.
- OS 정상인데도 무음이면 그때: staging에서 `buildApnsAlertBody` JSON 캡처 · (선택) `aps.sound`에 SSOT 파일명 반영은 **별 과제**(무음 root cause와 분리).

### 4. 영향
- 현 설계 단계 변경 없음. 향후 APNs sound 변경 시 iOS 알림·뱃지·CallKit/VoIP 경로와 분리 유지 필수.

### 5. 검증 기준
- OS 설정 스크린샷 + 동일 조건 F2×3 (소리 유무) · DB delivery sent 유지.
- 제품 수정 시에만: aps 캡처 · F1/F2/F10 재실행 · F3 인앱 무회귀 · 통화 VoIP 무회귀.

### 6. 복구
- 해당 웹 push 커밋 revert (구현 시). OS 설정 원복은 기기 쪽.

---

## SIDE-06 — iPhone 목록 안읽음 +1 과다 (F3) — **D 승인 후보**

### 1. B 증상·코드 경로 대조
- **B:** I ④다른 방 · S→I 1건 전송 시 목록 안읽음 **2** (3회 동일) · 배너·알림음·맨위 OK.  
  같은 세션 직후 DB 조회: iPhone participant **`unread_count=1`** (UI 2와 불일치) — B 증거.
- **코드:**  
  - DB append: recipient `unread_count + 1` 1회 (`dibay_append_room_message_atomic` 등).  
  - 클라: participant RT → 절대값 적용 **후** 메시지 INSERT 경로 `bumpRoomUnreadIfNeeded` / `boostUnreadCount: true`로 **또 +1**  
    (`patch-bootstrap-room-list-from-realtime-message.ts:123-139` — 주석은 「unread 건드리지 않는다」인데 **실제 +1**).  
  - `shouldBlockStalePositiveUnreadDecreaseClobber` (`merge-critical-home-sync-room-summary.ts:202-223`)가 서버 1로의 **하향 보정 차단** 가능 → UI 2 고착.

### 2. 원인 — **CONFIRMED**
**클라이언트 이중 반영:** participant RT(절대 unread=1) + 메시지 낙관 `+1` → 표시 2 · 서버/DB는 1.  
B의 UI=2 vs DB=1이 이 가설과 일치. DB 이중 append 가설은 B 증거와 불일치 → 기각.

### 3. 최소 수정 범위·파일
1. **1순위:** 메시지 INSERT/home projection에서 목록 `unreadCount` 낙관 **제거** (`boostUnreadCount: false` / `boostUnread: false`) — unread는 participant RT·`summary_patch`만. 주석과 구현 일치.  
2. **2순위(방어):** participant/home-sync 절대값이 로컬보다 작을 때 stale-decrease clobber 예외 허용.  
- 파일:  
  - `lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message.ts`  
  - `lib/community-messenger/home/project-room-activity-to-home-list.ts`  
  - `lib/community-messenger/home/use-community-messenger-home-realtime-bootstrap-list.ts`  
  - `lib/community-messenger/stores/messenger-realtime-store.ts`  
  - (±) `components/messenger/DomainRoomStateRealtimeHost.tsx`  
  - (±) `lib/community-messenger/merge-critical-home-sync-room-summary.ts`  
  - vitest: 해당 home unread 계약 테스트 추가  
- **웹만 · 네이티브/DB 마이그레이션 없음.** 통화 커밋과 묶지 않음.

### 4. 영향
- 메신저 **홈 목록 unread**만. 방 안 타임라인·발송·CallKit/VoIP/FCM·APNs 비대상.  
- 위험: 낙관 제거 후 RT 지연 시 배지 잠깐 0/지연 → participant RT 지연 시나리오 실기기 확인.

### 5. 검증 기준
- **더블체크:** 단위 — 「participant unread=1 적용 후 message insert 시 목록이 2가 되지 않음」 · merge가 서버 1로 수렴.  
- **실기기 (I):** 다른 방 연 채 S→I 텍스트 1건 ×3 → 목록 안읽음 **1** · 방 입장 후 0 · F4 같은방 알림 없음 무회귀 · F3 배너 무회귀.

### 6. 복구
- 해당 웹 커밋만 revert → push main → 앱 재시작.

---

## SIDE-07 — Samsung 잠금 화면 메신저 알림 미표시 (F6)

### 1. B 증상·코드 경로 대조
- **B:** 알림음 **울림** · 잠금 **UI 없음** · F5(①꺼짐) 알림·소리·탭 PASS · FCM `chat_message` sent.
- **코드:**  
  - FCM **data-only** → `DibayFirebaseMessagingService.showMessageNotification` · `PRIORITY_HIGH` · `VISIBILITY_PUBLIC`.  
  - 채널 `DibayNotificationChannelRegistry` — 생성 시 `IMPORTANCE_HIGH` + `setLockscreenVisibility(PUBLIC)` · **이미 존재하면 early return(재설정 불가)**.  
  - 포그라운드 `appVisible`이면 tray skip (잠금이면 보통 onStop→false).

### 2. 원인 (OS 우선 — Owner 지시)
| 층 | 판정 |
|---|---|
| **전달** | FCM sent + 소리 O → 전달 실패 **아님** |
| **앱 채널 기본값** | 신규 생성 PUBLIC — 레거시 SECRET 잔존 **가능** |
| **Samsung OS** | 「잠금 화면 알림」숨김/내용 숨기기 — **1순위 · 확인 전 제품 결함 단정 금지** |
| **foreground skip 오판** | logcat 없으면 **NOT_PROVEN** |

**제품 결함으로 D 구현할 원인: NOT_PROVEN.**

### 3. 최소 수정
- **지금:** Owner — 설정→앱→DIBAY→알림→채팅 채널 **잠금 화면** · 설정→잠금화면→알림. logcat `DIBAY_FCM` (`native_notification_posted` vs `foreground_skip`).  
- OS/채널이 SECRET·숨김이면 **제품 수정 없이** 설정 안내로 CLOSE 가능.  
- 제품 확정 시에만: 새 channel id(`…_v2`) PUBLIC 고정 + FCM 매핑 · 또는 이벤트 채널 lockscreen PUBLIC 고정.

### 4. 영향
- 채널 id 변경 시 사용자 알림 설정 초기화. 통화 FCM/VoIP 채널과 분리 유지.

### 5. 검증 기준
- 설정 스크린샷 + F6 재현 1회 · 잠금 UI 유무 · 소리 · 알림판 잔존.  
- 제품 수정 시: 신규 설치/채널 재생성 기기에서 F5·F6·F7 무회귀.

### 6. 복구
- 채널 매핑 커밋 revert · (필요 시) 앱 재설치로 채널 재생성.

---

## D 단계 제안 (승인 대기)

### D에 올릴 것 (원인 CONFIRMED)
1. **SIDE-06만** — 위 §최소 수정 · 웹 단독 커밋 · 실기기 F3 재검증.

### D에 올리지 말 것 (미확정 / OS 확인 선행)
| ID | 선행 조건 |
|---|---|
| SIDE-01 | Samsung logcat mute_applied/rejected + 상대 청각 → 원인 A/B/C 확정 후 Android 단독 |
| SIDE-03 | roomId·membership·home-sync 로그·보관/칩 확인 후 |
| SIDE-05 | iOS 알림 소리·무음스위치·Focus 확인 · 제품 무음이면 그때 APNs 캡처 |
| SIDE-07 | Samsung 잠금/채널 설정·logcat 확인 · OS면 CLOSE · 제품이면 채널 마이그레이션 |

### 명시적 비대상
SIDE-02 · SIDE-04 · E1/E2/E9/E10 · 희귀 수신 · 알림 탭 다단 진입(앱→커뮤니티→방) 관찰 · 전체 메신저 재감사.

---

## 변경 없음 선언
본 C REPORT 작성으로 **코드·네이티브·DB·main·Production 변경 없음.**
