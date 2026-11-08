# iOS 시작 화면 — 첫 문서 대기 상한(T_doc) 설계안 (2026-11-08 · Owner 승인 전 · 구현 안 함)

- 지시: Owner 「설계안 작성」 (2026-11-08, build 28 실기 보고 직후)
- 근거 계획: `docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md` §4 C7 · §13 · §14
- 하드락: `docs/dibay-app-entry-resume-hard-lock.md` (DRAFT) H1
- 상태: **설계만.** 코드·빌드·운영 변경 없음.

## 1. 결함 (실기 증거)

| 항목 | 값 |
|---|---|
| 기기·빌드 | iPhone 14 Pro Max(iPhonebk) · iOS 1.2 (28) · `com.dibay.ph` · 서버 `6193bed` |
| 조건 | Xcode 기기 조건 「Very poor network」(1Mbps · 지연 500ms · 손실 10%) |
| 시각 | 2026-11-08 19:55:34 PHT 콜드 실행 |
| 운영 계측(`[dibay-entry]`, run `6c522dc1…`) | `responseStart` **19,439ms** · `release` **20,512ms** · `failure:null` · `recovery:none` |
| 화면 | 19:55:50 캡처 = 녹색 시작 화면 유지(시험 도구 안내창이 위에 겹침). 19:56:00 캡처 = 홈 |

판정: **FAIL** — 서버 첫 응답을 기다리는 동안 녹색 로고가 20.5초 유지됐고 고장 판정이 작동하지 않았다. Owner 최초 증상(「녹색 로고에서 넘어가지 않음」)과 같은 모양이다.

## 2. 원인 (코드로 확인)

- iOS 고장 판정 타이머는 `startupFaultDocumentFinished()`(= `WKNavigationDelegate.didFinish`)에서만 시작한다 (`ios/App/App/DibayRootBridgeViewController.swift` `startupFaultDocumentFinished` → `startStartupFaultTimer`). `didStartProvisionalNavigation` 은 타이머를 **멈추기만** 한다(`startupFaultDocumentStarted` → `stopStartupFaultProbe`).
- 그래서 **문서 요청 시작 ~ 문서 완료** 구간에는 앱 상한이 없다. 이 구간은 WebKit 의 네트워크 시간 제한(요청 기본값 60초, 앱이 지정하지 않음)에만 의존한다. 완전 오프라인은 즉시 오류가 오므로(오류 코드 → `startupFaultLoadFailed` → 오류 화면) 문제없지만, **응답이 늦거나 패킷이 버려지는 망**에서는 녹색 로고가 최대 수십 초 남는다.
- Android 는 같은 구간에 **10초 문서 대기 상한**이 이미 있다(`MainActivity.WEBVIEW_LOAD_TIMEOUT_MS = 10_000`, `onWebViewMainFrameStarted` 에서 시작, 2026-06-18 `455c16102` 부터). 시간 초과 시 오류 화면(「다시 시도」)을 띄우되 **로드는 계속**하고, 문서가 나중에 도착하면(`onPageFinished`) 오류 화면을 걷는다. 실기 확인: Android 38 비행기 모드 콜드 → 2.6초 만에 연결 안내(오류 코드 경로), 「다시 시도」로 홈 진입 (Samsung `SM-M156S`·Xiaomi `24076RP19G`, 20:05~20:07 PHT).
- 즉 **두 플랫폼 계약이 다르다** — C7 설계 때 Android 의 기존 10초 상한을 iOS 대조 항목에 넣지 않았다(작업자 누락, 계획 §14 FIRST DIVERGENCE 에 없음).

## 3. 하드락 충돌 (Owner 결정 필요 · 규정 「설계·구현」 7)

- 하드락 H1-2: 「고장 판정 타이머는 **문서 완료 후** JS 미시작(T_js)·JS 시작 후 미해제(T_release) 에만 둔다」.
- 이 설계는 **문서 완료 전** 대기(T_doc)를 고장 판정에 추가한다 → H1-2 문구와 충돌한다. 단, Android 는 H1-2 작성 전부터 같은 상한(10초)을 갖고 있어 **현재 코드가 이미 H1-2 와 다르다**.
- 제안 개정(승인 시): H1-2 를 「고장 판정 타이머는 ① 문서 대기(T_doc, 문서 요청 후 문서 미도착) ② JS 미시작(T_js) ③ JS 시작 후 미해제(T_release) 세 가지만. 표시 시간 타이머 금지는 유지」로 바꾼다. T_doc 는 표시 시간 타이머가 아니다 — 정상 시작(문서가 10초 안에 도착)에서는 발동하지 않고, 발동해도 시작 화면을 「오류 화면」으로 바꿀 뿐 로드를 끊지 않는다.

## 4. 설계 (iOS 만 · Android 무변경)

### 4.1 동작
| 사건 | 지금 | 바뀐 뒤 |
|---|---|---|
| `didStartProvisionalNavigation` (시작 화면이 떠 있을 때) | 관찰 정지만 | 관찰 정지 + **T_doc 관찰 시작** (앱 활성 시간만 셈) |
| T_doc(10초) 안에 `didFinish` | 고장 판정(T_js·T_release) 시작 | 같음 (T_doc 관찰 종료) — **정상 시작은 무변화** |
| T_doc(10초) 경과, 문서 미도착 | (없음 — 녹색 로고 유지) | 오류 화면 `.network`(「서버에 연결할 수 없습니다 · 다시 시도」) 표시, 시작 화면 해제, **로드는 계속** |
| 오류 화면 표시 후 문서 도착(`didFinish`) | — | 오류 화면 걷기 → 웹 화면 그대로 표시(웹이 이어서 그림). Android `onPageFinished → hideWebViewLoadErrorOverlay` 와 같은 규칙 |
| 오류 코드로 실패(`didFailProvisionalNavigation`) | 즉시 오류 화면 | 같음 (T_doc 관찰 종료) |
| 「다시 시도」 | 시작 화면 덮고 재로드 | 같음 + 새 요청에 T_doc 관찰 다시 시작 |
| 앱 비활성(백그라운드) | — | T_doc 시간 정지·복귀 시 재개 (D5 와 같은 방식) |
| **통화 경로 문서**(경로에 call) | 고장 판정 제외(D4) | **T_doc 도 제외** — 통화 화면 동작은 지금과 같음 |
| 시작 화면이 이미 해제된 뒤의 이동(앱 안 페이지 이동) | — | **T_doc 미적용** — 시작 화면이 떠 있을 때만 관찰 |

### 4.2 값
- **T_doc = 10초** — Android 기존 값과 같게(하드락 H1 「판정 규칙·값은 두 플랫폼 같다」). 실측 근거(iOS 28, 같은 기기): 정상 망 `responseStart` 74·140·172ms(3회), 매우 나쁜 망 4,209·11,350·19,439ms(3회). 10초는 정상 3회·나쁜 망 1회(4.2초)보다 크고 나쁜 망 2회보다 작다.
- 표본이 작다(iOS 6회). 값은 C8 운영 계측 `responseStart` 분포로 재확인한다 — 2026-11-09 16:45 PHT 예약 측정에 iOS `responseStart` p95·p99 항목 추가.

### 4.3 바뀌는 파일·함수
| 파일 | 변경 |
|---|---|
| `ios/App/App/DibayRootBridgeViewController.swift` | `startupFaultDocWaitTimeoutMs = 10_000` 추가 · `startupFaultDocumentStarted()` 에서 시작 화면이 있고 통화 경로가 아니면 T_doc 타이머 시작 · `startupFaultDocumentFinished()` 에서 T_doc 종료 + 오류 화면이 T_doc 사유로 떠 있으면 걷기 · `startupFaultLoadFailed()`·`stopStartupFaultProbe()` 에서 T_doc 종료 · 비활성 정지/재개는 기존 `pauseStartupFaultProbe` 구조 재사용 · 오류 화면에 사유 표시자(`docWait`) 추가 |
| `lib/startup/__tests__/r17-os-native-visual.test.ts` | iOS 계약 검사 추가: T_doc 값 10초 = Android `WEBVIEW_LOAD_TIMEOUT_MS`, 통화 경로 제외, 문서 도착 시 오류 화면 걷기 |
| `docs/dibay-app-entry-resume-hard-lock.md` | H1-2 개정(§3, 승인 시) |
| `docs/audit/app-entry-resume-stabilization-plan-2026-11-08.md` | §13·§14 iOS 행 갱신 |

Android·웹·서버·DB **무변경**.

### 4.4 영향 받는 경로 전부
| 경로 | 영향 |
|---|---|
| 정상 콜드 시작(문서 10초 안) | 없음 — 타이머가 발동 전에 끝난다 |
| 오프라인 콜드 | 없음 — 지금처럼 오류 코드로 즉시 오류 화면 |
| 느린 망(10초 넘김) | 녹색 로고 대신 10초에 「서버에 연결할 수 없습니다 · 다시 시도」. 늦게 도착하면 자동으로 홈 |
| 장시간 복귀 · 새 버전 다시 불러오기(`update_reload`) | 시작 화면이 없는 상태의 재로드라 T_doc 미적용 — 지금과 같음 |
| WebContent 종료 후 재로드 | 시작 화면을 다시 덮으므로 T_doc 적용 → 무응답이면 10초에 오류 화면(지금은 녹색 무기한) |
| 푸시 콜드 진입 | 정상 콜드와 같음 |
| **통화**(수신·수락·CallKit·통화 경로 문서) | 통화 경로 문서 제외 + 네이티브 통화 화면 파일 무수정 → 변화 없음. 통화 규정 1~3 대상: 바꾸는 파일은 통화 파일이 아니지만 같은 VC 의 통화 경로 분기를 건드리므로 실기 행렬에 통화 수신·수락 포함 |
| 설치된 구 바이너리(iOS 27 이하, 28) | 재설치 전까지 지금 동작. 웹 배포와 독립 |

### 4.5 깨질 수 있는 것 · 같은 단계 처리
1. **오탐(느리지만 정상인 망에서 오류 화면)** — 발생해도 로드를 끊지 않고 문서 도착 시 자동으로 걷으므로 최종 화면은 홈. 사용자가 그 사이 「다시 시도」를 누르면 재요청(서버 부하 1회). Android 와 같은 동작.
2. **오류 화면과 웹 해제 신호 경합** — 문서 도착 → 오류 화면 걷기 → 웹이 그린 화면이 보인다. 시작 화면은 이미 해제돼 있으므로 웹의 `dismissSplash` 는 할 일이 없어야 한다. 해제 후 신호를 현재 코드가 무시하는지는 **확인 못 함** — 구현 단계에서 코드 확인 후 검사로 고정.
3. **Capacitor 가 navigationDelegate 를 다시 설정** — 기존 C7 프록시 위험과 같음(변화 없음).

### 4.6 검증 (구현 승인 후)
- 코드: `xcodebuild`(시뮬레이터) BUILD SUCCEEDED · `vitest r17-os-native-visual` · typecheck.
- 실기(iOS 새 빌드 29, 같은 기기): ① 정상 콜드(해제 시각 무변화) ② Very poor network 콜드 → 10초 ± 1초에 오류 화면 → 문서 도착 시 홈 자동 표시 ③ 비행기 모드 콜드(무변화, 수동) ④ 30분 복귀(무변화) ⑤ 통화 수신·수락(무변화). 판정은 운영 계측 + 기기 화면 캡처 + 기기 로그(`startup_doc_wait_fault`).
- 롤백: 이 커밋 revert 후 재빌드. 웹 무관.

## 5. 이번 설계에 넣지 않은 것 (별도 보고)
- **새 버전 다시 불러오기 중 흰 화면 약 3초** (iOS 28, 20:30:00 PHT 캡처, `update_reload` 직후) — 원인 미확인. 시작 화면이 없는 상태의 재로드라 이 설계와 다른 경로. 원인 확인 후 별도 설계.
- **CI Gradle 다운로드 단일 경로**(오늘 3회 실패) — 범위 밖, 보고만.
- ② 오프라인 iOS 실기는 시험 도구로 완전 차단이 안 돼 NOT_PROVEN — 비행기 모드 수동 1회 필요.

## 6. Owner 결정 항목
1. 하드락 H1-2 개정(T_doc 추가) 승인 여부.
2. 구현·iOS 빌드 29·실기 승인 여부 (네이티브 · 통화 경로 분기 포함 → 통화 단독 커밋 규정은 해당 없음(통화 파일 무수정) — 단 실기 행렬에 통화 포함).
