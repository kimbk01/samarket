# 통화 중 앱 사용·축소·PiP — 전체 완료 계획 (휴대폰·태블릿·Android·iOS) 2026-10-31

- 목적: Owner 요구 「통화는 **종료 버튼·상대 종료·상대 취소 외에는 끝나지 않고**, 화면을 벗어나면 **PiP**, 통화 중에도 **앱 전체 기능 사용**」을 **모든 지원 기기**(Android 휴대폰·Android 태블릿·iPhone·iPad)에서 완성한다.
- 기준 문서: `docs/audit/call-inapp-multitask-legacy-design-2026-10-30.md` (v3 + §16·§17) · 감사 `call-inapp-multitask-pip-audit-2026-10-30.md`
- 이 문서는 **남은 일 전체**와 **완료 기준**을 한 곳에 정한다. 단계를 끝낼 때마다 §2 표를 갱신하고, 이 표에 없는 일은 하지 않는다.

---

## 0. 원칙 (변경 없음)
1. 통화 유지 = 네이티브 Runtime(Android FGS·iOS CallKit). 앱 안 이동 = 웹 내비게이션. 둘을 섞지 않는다.
2. 기존 Runtime·Agora·CallKit·PushKit·FGS·서버 세션·알림 경로는 바꾸지 않는다.
3. 네이티브 변경은 단계별 Native Change Gate 승인 후. 실기는 승인된 시나리오만. Production·스토어는 별도 승인.
4. 판정은 **기기·OS·빌드·계정·시각**을 적은 증거로만. 시험 안 한 칸은 NOT_PROVEN.
5. 한 단계 = 한 원인. 실기 FAIL 이면 그 단계에서 멈추고 고친 뒤 같은 행렬로 재검증.

## 1. 지원 기기·화면 사실 (코드 확인)
| 항목 | Android 휴대폰 | Android 태블릿 | iPhone | iPad |
|---|---|---|---|---|
| 판정 | `DibayDeviceClassClassifier` sw<600dp | sw≥600dp (`TABLET_ANDROID`) | — | `TARGETED_DEVICE_FAMILY = "1,2"` (iPad 지원) |
| 앱 화면 방향 | 세로 고정 | 회전 허용(관리자 경로만 가로) | 세로만 (`UISupportedInterfaceOrientations`) | **4방향 회전** (`~ipad`) |
| 멀티윈도 | `resizeableActivity=true` | 분할 화면 가능 | — | **Split View·Slide Over 가능** (`UIRequiresFullScreen` 없음) |
| 웹 레이아웃 | 단일 | **768px+ 메신저 좌우 분할**(목록+방) | 단일 | 768px+ 분할 |
| 통화 화면 방향 | 음성: 고정 없음(configChanges) · 영상: 세로 고정 | 같음 (Android 16+ 대화면은 OS 가 고정 요청 무시 가능) | 앱 정책 따름 | 앱 정책 따름 |
| 시스템 PiP | 음성·영상 (S2) | 같음 | 영상만 (iOS 15+ 자동, 앱 안 진입 없음) | 영상만 (같음) |
| 통화 유지 | FGS `phoneCall\|microphone[\|camera]` | 같음 | CallKit + `voip`·`audio` 백그라운드 | 같음 |

## 2. 현재 상태 (2026-10-31 16:21 PHT 기준)
| # | 항목 | 코드 | Production/설치 | 실기 | 증거 |
|---|---|---|---|---|---|
| S1 | 앱 전체 통화 바 + 방 배너 숨김 | main `436ed3a30`·`493fb2a57`·`f7532da89` | Production READY | Samsung **PASS** (6개 화면 가림 없음) | 2026-10-31 09:26~09:28 캡처 |
| D2 | 통화 중 메신저 뒤로 정상 | main `a3be8ea29` | Samsung 1.2.5 (23) | Samsung **PASS** | 16:08 캡처·task 상태 |
| D3 | 메신저 PiP 제거 | 같음 | 같음 | Samsung **PASS** (바 탭·알림 탭) | 16:08 `mode=fullscreen` |
| D1·P2 | 음성 통화 화면 PiP·줄이기·뒤로 → 앱 | 같음 | 같음 | Samsung **PASS** | 통화 `1fe57567` |
| §12.3 | 영상 줄이기·뒤로 → PiP + 앱, 앱 아이콘 → 메신저 | `a3be8ea29`·`743e2cdf0` | 같음 | Samsung **PASS** | 통화 `b3fc8e0b` |
| P3 | PiP 닫아도 통화 유지 | `a3be8ea29` | 같음 | Samsung 음성·영상 **PASS** | 로그 `pip_activity_stopped` + DB `active` |
| — | 영상 줄이기 버튼 위치 | `e64c28b1e` | 같음 | Samsung **PASS** | 통화 `04fc733d` |
| P1 | 연결 전 뒤로 = 최소화 | `a3be8ea29` | 같음 | **NOT_PROVEN** | 시험 안 함 |
| G1 | 축소 후 장시간 유지 | — | — | Samsung 음성 16분·영상 17분 **PASS** (빌드 20) · Xiaomi NOT_PROVEN | 통화 `84991401`·`cb598bb5` |
| G1-3 | 최근 앱에서 DIBAY 제거 시 | — | — | **NOT_PROVEN** | 시험 안 함 |
| Xiaomi | S2 전체 | — | 빌드 20 (Play) | **NOT_PROVEN** | 설치 안 함 |
| Android 태블릿 | S1·S2 전체 | — | — | **NOT_PROVEN** | 기기 미확인 |
| S3 iPhone | 음성 축소·영상 축소·재표시 | 브랜치 `feat/call-s3-ios-minimize` `086223153` (iOS build 19), xcodebuild **BUILD SUCCEEDED**, iOS 계약 vitest 27파일 258건 PASS | main 미반영·미설치 | **NOT_PROVEN** | 2026-10-31 실기 승인 대기 |
| iPad | S1·S3 전체 | S3 와 같은 빌드 | 미설치 | **NOT_PROVEN** | 기기 필요 |
| iOS 발신음 | 「삐-익」 대체음 원인 | 기기 없이 확인: 관리자 설정 = 업로드 mp3(음성 `016a1ce1…mp3` 371KB·영상 `ccf5a701…mp3` 444KB, 둘 다 HTTP 200) → 「삐-」는 **앱이 설정 조회(`config_fetch_fail`) 또는 음원 재생 실패로 합성음 대체**한 것. 둘 중 어느 쪽인지는 발신 중 기기 로그로만 확정 | — | **NOT_PROVEN** (실기 로그 필요) | DB `notification_sound_mappings`·`assets` |
| 회귀 | 수신·거절·벨 중 취소·busy·부재중·잠금 수신 | — | — | **NOT_PROVEN** (S2 빌드) | 시험 안 함 |
| 알림 문구 | 진행 중 통화 알림 「Native voice runtime」 영어 | 범위 밖 | — | 확인됨 | 2026-10-31 09:41 캡처 — 보고만 |

## 3. 남은 일 — 단계별 계획

### 단계 A. Android 마무리 (휴대폰 2종 + 태블릿) — 추가 코드 없음, 실기만
| 항목 | 내용 |
|---|---|
| A-1 Samsung 미시험 항목 | P1(연결 전 뒤로: 발신 벨 중·수신 벨 중), G1-3(최근 앱 제거), 회귀 6종(§5-R) |
| A-2 Xiaomi | Play 앱 삭제 → 1.2.5 (23) 설치(로컬 서명) → S1·S2 전체 + G1(10분) + 회귀. **Xiaomi 백그라운드 정책**(MIUI 자동 시작·배터리 제한)으로 축소 중 통화 끊김 여부가 핵심 |
| A-3 Android 태블릿 | 1.2.5 (23) 설치 → 세로·가로 각각, 768px+ 메신저 분할 화면에서 통화 바 위치·가림, 통화 화면 방향(영상 세로 고정이 태블릿 가로에서 어떻게 보이는지), 분할 화면(다른 앱과 반반)에서 PiP·바 |
| 변경 | 없음. FAIL 이 나오면 원인·수정안을 이 문서에 추가하고 별도 승인 |
| 필요 승인 | Xiaomi 앱 삭제(데이터 초기화) · Android 태블릿 보유 여부/설치 |

### 단계 B. iPhone 발신음 원인 (먼저 — 승인 불필요, 읽기만)
| 항목 | 내용 |
|---|---|
| 현재 구조 | 발신 시 `/api/app/messenger-call-sound-config`(로그인 필요)에서 음원 정책을 받아 `custom` 이면 URL 음원, 실패·없음이면 합성음(`startDefaultSynthetic`, 「삐-」) |
| 조사 | ① iPhone 발신 1회 중 `idevicesyslog` 로 `ringback` 로그(정책 모드·URL·실패 사유) 수집 ② 운영 DB 관리자 통화음 설정값 ③ Vercel 로그 해당 API 응답 코드 |
| 판정 | 정책 미설정 / API 인증 실패(쿠키) / 음원 URL 실패 / 의도된 기본음 — 증거로 하나를 확정 |
| 수정 | 원인이 확정된 뒤 별도 계획·승인 (통화 변경 규정) |

### 단계 C. S3 — iPhone 네이티브 (설계 §6·§13 그대로)
| 변경 | 파일 |
|---|---|
| 음성 통화 화면에 줄이기 버튼 → 화면만 내림(통화 유지) → 앱 + 통화 바 | `NativeVoiceCallViewController.swift`, `NativeVoiceCallUiHost.swift` |
| 축소한 통화는 자동 재표시 안 함(표식), 통화 바·종료 때만 해제 | `NativeVoiceCallUiHost.swift`, `Plugins/NativeCallServicePlugin.swift` |
| 영상 줄이기 버튼 → 앱 안에서 시스템 PiP(지원 시), 미지원·실패 시 화면만 내림 | `NativeVideoCallViewController.swift`, `NativeVideoCallUiHost.swift` |
| 다시 열 때 통화 시간 이어짐 | 두 VC + UiHost |
| 우선순위 | 종료 > 사용자 복귀 > 사용자 축소 > 자동 표시 > 시스템 자동 PiP (§13.2) |
| 빌드 | iOS `CURRENT_PROJECT_VERSION` 4곳 +1 (19) · 신규 Swift 파일 없음 |
| OS 제약 (보고만) | iPhone 음성 **시스템 PiP 는 iOS 공식 API 가 영상 전용** → 음성은 「앱 안 축소 + 통화 바 + 시스템 초록 통화 표시」로 한다. 앱 강제 종료(위로 밀기)는 OS 가 통화를 끝냄 — 막을 수 없음 |
| 필요 승인 | **A3 Native Change Gate (iOS)** · TestFlight/설치 방법 |

### 단계 D. iPad (S3 와 같은 빌드, 태블릿 전용 확인·보정)
| 확인 항목 | 이유 |
|---|---|
| 세로·가로 회전 중 통화 화면(음성·영상) 배치 | iPad 는 4방향 회전 — 통화 VC 가 가로에서 깨지지 않는지 |
| Split View·Slide Over 에서 통화 화면·축소·통화 바 | iPad 는 앱이 화면 일부만 차지할 수 있음 — modal 통화 화면이 창 크기에 맞는지 |
| 영상 PiP (앱 안 축소·홈 자동) | iPad PiP 동작 |
| 768px+ 메신저 분할 화면에서 통화 바 | 웹 바 위치·가림 |
| 보정 | FAIL 시 원인·수정안을 추가하고 별도 승인 (같은 S3 범위 안 레이아웃 보정은 A3 승인 범위로 처리) |

### 단계 E. 배포·출시 정리
| 항목 | 내용 |
|---|---|
| Android 빌드 번호 순서 | 통화 S2 = 21·22·23 사용. 할로윈 아이콘 되돌림(11/1 이후)은 **24** |
| Android 출시 | 단계 A 실기 PASS 후 AAB → Play **내부 테스트** → 단계적 출시. 스토어 출시는 Owner 승인 |
| iOS 출시 | 단계 C·D 실기 PASS 후 TestFlight → App Store. 출시는 Owner 승인 |
| 구 바이너리 | 웹 S1 은 이미 반영 — 구 앱은 바 안 뜸·배너 숨김(빈 화면 없음) |
| 문서 | 설계·감사·이 문서 커밋 여부는 Owner 지시 (현재 커밋 안 함) · 잠금 문서(iOS I6·lifecycle)는 단계 C 후 현행 코드로 갱신 |

## 4. 순서
```text
B (iPhone 발신음 조사, 승인 불필요)
→ A-1 (Samsung 미시험 + 회귀)
→ A-2 (Xiaomi, 승인: 앱 삭제)
→ A-3 (Android 태블릿, 기기 필요)
→ C (iPhone S3, 승인: A3)
→ D (iPad, 기기 필요)
→ E (출시, 승인)
```
각 단계 끝에 §2 표 갱신 + 짧은 보고 1회.

## 5. 실기 행렬 (단계별로 해당 기기만)

### 5-F 기능 (S1·S2·S3)
| 코드 | 시나리오 | Android 폰 | Android 태블릿 | iPhone | iPad |
|---|---|---|---|---|---|
| F1 | 음성 연결 → 줄이기/뒤로 → 앱 + 통화 바 (+Android PiP) | ● | ● | ● | ● |
| F2 | 영상 연결 → 줄이기/뒤로 → 영상 PiP + 앱 | ● | ● | ● | ● |
| F3 | 통화 중 앱 화면 이동(채팅·커뮤니티·거래·배달·내정보), 메시지 양방향 | ● | ● | ● | ● |
| F4 | 통화 바 탭 → 같은 통화 화면(새 세션 0건) | ● | ● | ● | ● |
| F5 | 홈 → 앱 아이콘 → 메신저 + PiP/바 유지 | ● | ● | ● | ● |
| F6 | PiP 닫기 → 통화 유지 → 바로 복귀 | ● | ● | ● (영상) | ● (영상) |
| F7 | 연결 전 뒤로 = 최소화(취소 아님) | ● | ● | — | — |
| F8 | 축소 상태에서 상대 종료 → 바·PiP 사라짐 | ● | ● | ● | ● |
| F9 | 종료 직후 재발신 | ● | ● | ● | ● |
| F10 | 회전(세로↔가로) 중 통화 화면·바 | — | ● | — | ● |
| F11 | 분할 화면/Split View 에서 통화 화면·바 | — | ● | — | ● |
| F12 | 10분 유지(G1) | ● | ● | ● | ● |

### 5-R 회귀 (통화 변경 규정 5)
Android↔iPhone 음성·영상: 발신·수신 · 거절 · 벨 중 취소(재울림 없음) · busy · 무응답 30초 · 잠금 화면 수신 · 알림 탭 복귀 · 마이크·스피커·카메라.

각 칸 기록: 기기·OS·`app_version`·계정·시작 시각(PHT)·callId·결과·증거(캡처·DB·로그).

## 6. 필요한 승인·준비 (Owner)
| # | 항목 | 단계 |
|---|---|---|
| 1 | Xiaomi DIBAY 삭제 후 1.2.5 (23) 설치 (데이터·로그인 초기화) | A-2 |
| 2 | Android 태블릿 보유 여부 · USB 연결 | A-3 |
| 3 | **A3 Native Change Gate — iOS S3** | C |
| 4 | iPad 보유 여부 · 연결 / iPhone·iPad 설치 방법(Xcode 직접 vs TestFlight) | C·D |
| 5 | Play 내부 테스트 업로드·단계적 출시, TestFlight·App Store 출시 | E |

## 7. 완료 기준
- §5-F 의 ● 칸 전부 PASS + §5-R 전부 PASS, 각 칸 증거 기록.
- 허용 종료(종료 버튼·상대 종료·취소·거절·부재중·busy·네트워크 정리) 외 **비정상 종료 0건** (운영 DB `ended_reason` + 기기 로그 `activity_destroyed_while_live` 0건).
- 통화 종료 후 바·PiP 잔류 0건.
- OS 제약으로 불가한 항목(iPhone 음성 시스템 PiP, iOS 앱 강제 종료)은 FAIL 이 아니라 「OS 제약」으로 근거와 함께 따로 표기.

## 8. 위험
| 위험 | 대응 |
|---|---|
| Xiaomi(MIUI) 배터리 정책이 축소 중 통화 프로세스를 정리 | A-2 에서 10분 유지로 확인, FAIL 이면 원인(설정·코드) 분리 보고 |
| Android 태블릿 가로에서 영상 통화 화면 세로 고정 | A-3 에서 확인, 필요 시 별도 보정안 |
| iPad Split View 에서 modal 통화 화면·PiP 원본 크기 | D 에서 확인 |
| iOS 축소 상태 + 백그라운드에서 영상 자동 PiP 원본 없음 | C 에서 확인 — 결과 그대로 보고 |
| 로컬 서명 설치 기기는 Play 업데이트 불가 | 출시 후 해당 기기 재설치 안내 |


## 9. 실기 승인 요청 (2026-10-31, 실기 직전 중단 지점)

### 9-1 설치 (승인 시 실행)
| 기기 | 빌드 | 방법 |
|---|---|---|
| Samsung | Android 1.2.5 (23) | 이미 설치됨 |
| Xiaomi | Android 1.2.5 (23) | Play 앱 삭제 → APK 설치 (데이터·로그인 초기화, 다시 로그인 필요) |
| iPhone | iOS 1.2 (19) = S3 | S3 를 main 에 반영 → `native:prepare -- --ios-only` → 기본 체크아웃 Xcode Run (기존 앱 위에 설치, 데이터 유지) |
| Android 태블릿·iPad | 위와 같음 | 보유·연결 시 |

### 9-2 시나리오 (§5 행렬에서 이번 실기 범위)
| 순서 | 기기 | 시나리오 |
|---|---|---|
| 1 | iPhone 발신 → Samsung | **B 발신음**: 발신 중 iPhone 기기 로그로 `config_fetch_ok/fail`·`source=custom_url` 확인 (원인 확정) |
| 2 | Samsung | A-1: P1 연결 전 뒤로(발신 벨 중·수신 벨 중) · G1-3 최근 앱 제거 · 회귀 6종 |
| 3 | iPhone ↔ Samsung | C: F1 음성 줄이기 → 앱 + 통화 바 → 바 탭 복귀(시간 이어짐) · F2 영상 줄이기 → 앱 위 PiP → 바 복귀 · F5 홈 → 앱 · F6 영상 PiP 닫기 → 통화 유지 · F8 축소 중 상대 종료 → 잔류 없음 · F9 재발신 · F12 10분 |
| 4 | Xiaomi ↔ iPhone | A-2: F1~F9 · F12 10분 (MIUI 배터리 정책) |
| 5 | (보유 시) Android 태블릿·iPad | A-3·D: F1~F11 (회전·분할 화면 포함) |

각 항목 기록: 기기·OS·`app_version`·계정·시각(PHT)·callId·결과·증거.

## 10. 실기 결과 (2026-11-01 PHT · Production main `f35009171`)

| 항목 | 기기·버전·계정 | 시각(PHT)·callId | 판정 | 증거 |
|---|---|---|---|---|
| B 발신음 「삐-익」 | iPhone 1.2 (19) w테스트1 | 00:40~00:47 · d042 외 9건 | 재현 안 됨 | Owner 청취 「삐소리 안 나고 정상 발신음」 + 기기 로그 `config_fetch_ok mode=custom`·`source=custom_url` (합성음 0건) |
| B 음성 발신음 | 〃 | 〃 | 정상(수화부) | 귀에서 떼면 안 들림(음성 = 수화부 계약) · 귀에 대면 들림 |
| B 영상 발신음 | 〃 | 00:47:08 · d127680f | 정상 | `route=speaker`·`custom_url` + Owner 청취 |
| B 남은 위험 | — | — | 보고만 | 음성 발신 로컬 취소 시 발신음 `stop` 호출 없음 · 일부 발신 재생 로그 없음(로그 누락 또는 매 발신 mp3 재다운로드) |
| P1 발신 벨 중 뒤로 | Samsung 1.2.5 (23) q테스트1 | 00:49:47 · 4a1234c0 | PASS | 뒤로 후 MainActivity · DB `ringing` 유지 → 00:50:17 `missed`(30초) · 종료 후 서비스·알림 잔류 0 |
| P1 수신 벨 중 뒤로 | 〃 | 00:51:29 · cf2183ce | PASS | 00:51:36 뒤로 → MainActivity · DB 발신자 취소 00:51:50 `cancelled`(거절 아님) |
| G1-3a 최근 앱에서 메인 카드 제거 | 〃 | 00:53:29 · d6b2988b | PASS | DB `active` 유지 · 통화 서비스·프로세스 유지 |
| **G1-3b 최근 앱에서 통화 화면 카드 제거** | 〃 | 00:53:51 · d6b2988b | **FAIL** | DB `ended`·`ended_by_callee` · logcat `activity_destroyed_while_live` → `end_tapped source=activity_destroyed` |

### 10-1 G1-3b FAIL 원인 (코드·로그 확인)
- 통화 화면이 앞에 있을 때 최근 앱을 열면 `excludeFromRecents` 여도 현재 작업으로 카드가 보인다(캡처 `g13-recents.png`).
- 카드를 지우면 Activity 가 파괴되고 `onDestroy` → `endLiveSessionIfSurfaceDestroyed()` 가 연결된 통화를 `end(activity_destroyed)` 한다. PiP 에서 닫을 때만(`stoppedInPip`) 유지하도록 S2 에서 예외를 넣었고, 최근 앱 제거는 예외에 없었다.
- 이 종료 가드는 2026-09-21 `45a3cfa6d`(연결 중 Activity 파괴 시 FGS·오디오 좀비 방지)에서 들어왔다.

### 10-2 수정안 — **폐기** (한 경로만 막는 땜빵. 전수 감사·단일 설계로 대체: `call-termination-authority-audit-2026-11-01.md`)
| 파일 | 변경 |
|---|---|
| `NativeVoiceCallActivity.onDestroy` | `stoppedInPip && isLiveConnectedSession()` → `isLiveConnectedSession()` (연결된 통화는 화면이 어떻게 파괴되든 유지) |
| `NativeVideoCallActivity.onDestroy` | 같은 변경 |
| 변경 없음 | Runtime·Service·Agora·서버·웹·iOS · 연결 전(발신 대기·수신 벨) 파괴 시 동작(기존 좀비 가드 유지) |

- 유지된 통화로 돌아가는 길: 진행 중 통화 알림(FGS) · 앱 상단 통화 바(S1) — P3(PiP 닫기)에서 같은 경로 PASS.
- 정상 종료와 충돌 없음: 종료 버튼은 상태가 `ENDING`, 상대 종료·정리는 세션 제거 후 `finish` → `isLiveConnectedSession()` false → 기존 경로.
- 좀비 위험: 연결된 통화만 유지하므로 09-21 좀비(연결 중 단계)는 기존 가드 그대로. 연결된 통화는 heartbeat·상대 종료 감시가 계속 돈다.
- **설계 충돌 보고**: Owner 요구(종료 버튼·상대 종료·취소 외 종료 금지)와 09-21 가드가 연결 전 단계(최근 앱에서 발신 대기·수신 벨 화면 제거 → 취소/거절)에서 여전히 충돌한다. 이번 수정 범위에서 제외하고 Owner 결정을 받는다.
- 실기: Samsung 음성·영상 각각 연결 → 최근 앱에서 통화 카드 제거 → DB `active` 유지 · 알림/바로 복귀 · 종료 버튼 정상 종료 · 상대 종료 시 잔류 0.
- 롤백: 두 줄 원복 + versionCode 25.
- 할로윈 아이콘 되돌림 빌드 번호는 24 → 다음 번호로 밀린다.
