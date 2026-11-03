# Android 앱 업데이트 — 전체 화면 진행형(페이스북 형태) 설계안 (2026-11-03)

- 상태: **Owner 승인 (2026-11-03 「승인, 1단계 진행」 — §5 계약 충돌 3건 포함) · 1단계(웹) main 255c23a9d · 2단계(네이티브 · versionCode 33) 구현 (Owner 「2단계 진행」)**
- 디자인 시안: `docs/audit/android-update-fullscreen-progress-mockup-2026-11-03.html`
- 근거 계약: `docs/dibay-android-play-update-hard-lock.md` (D1~D3, U1~U5, 2026-10-30 강제 업데이트)
- 감사 기준 트리: 브랜치 `fix/chrome-s1-back-unify` HEAD `7acd866c2`, `android/app/build.gradle` versionCode 32 / versionName 1.2.5, Play Core `com.google.android.play:app-update:2.1.0`

## 0. Owner 지시 원문

> 페이스북의 업데이트 부분을 첨부처럼 나오는 부분이다, 디바이의 업데이트시 업데이트 모달 -> 화면 꺼짐, 등의 위 내용과 틀린 부분이 보이는 부분이다. 원하는 부분은 디바이의 업데이트 부분을 적극 감사 해서 페이스북 형태로 업데이트 진행 % 등,,,, 동일 한 형태로 구현을 원하는 부분이다 … 업데이설치 까지 모달이 아니라 정확하게 유지 되는 부분을 원하는 부분이다
>
> 디자인 시안을 만들어서 보고 해라

첨부 4장(페이스북) 순서: ① 「Facebook 앱 업데이트」 전체 화면(예상 크기 114MB · 상세 정보 보기 · 모바일 데이터 체크 · 하단 「업데이트」) → ② 「업데이트 준비 중…」 → ③ 「다운로드 중… 16% · 취소」 → ④ 「설치 중…」. **같은 전체 화면이 설치까지 유지**되고 단계 문구·진행 막대만 바뀐다.

## 1. 현재 디바이 흐름 감사 (코드 근거)

| # | 단계 | 현재 동작 | 근거 |
|---|---|---|---|
| 1 | 안내 | 가운데 **확인 모달** 「새로운 DIBAY 업데이트가 있습니다」 + 나중에/지금 업데이트 | `components/platform/AndroidPlayInAppUpdateHost.tsx` 첫 `DibayConfirmDialog` |
| 2 | 동의 | 「지금 업데이트」 → `startFlexibleUpdate` → Google Play 동의 시트 | `DibayPlayInAppUpdatePlugin.startUpdateFlow` |
| 3 | 다운로드 | Play 동의 OK 결과가 오면 **모달을 닫고 끝** (`setAvailableOpen(false)`). Host 는 `installStatus` 진행 이벤트를 **구독하지 않는다** → 화면에 아무 표시 없음 | Host `onConfirm` → `setAvailableOpen(false)`; 진행 구독은 `components/my/settings/VersionContent.tsx:435` 버전 정보 화면에만 존재 |
| 4 | 다운로드 완료 | 두 번째 **확인 모달** 「업데이트가 준비되었습니다」 + 나중에/지금 설치 | Host 두 번째 `DibayConfirmDialog`, D3 |
| 5 | 설치 | 「지금 설치」 → `completeUpdate()` → Play 설치 화면 → 앱 재시작 | `completeFlexibleUpdate` |

### 발견 결함 (페이스북 형태와 다른 점)

- **F1 「모달 → 화면 꺼짐」 (코드로 확인)**: 동의 직후 모달이 닫히고 다운로드 동안 화면에 진행 표시가 0이다. 사용자는 업데이트가 사라진 것으로 본다. Owner 증상과 일치하는 코드 경로. 실기기 재현 로그는 **NOT_PROVEN**.
- **F2 진행 % 없음**: % 표시는 「내정보 → 버전 정보」 상태 한 줄에만 있다 (`VersionContent.tsx:106-119`). 전역 업데이트 흐름에는 없다.
- **F3 단계가 모달 2개로 끊김**: 안내 모달 → (빈 화면) → 설치 모달. 「설치까지 같은 화면 유지」 불충족.
- **F4 다운로드 중 앱 재진입 시 진행 끊김**: 네이티브 진행 리스너는 `startUpdateFlow` 안에서만 등록된다 (`registerInstallListener`). 다운로드 중 앱이 종료·재시작되면 리스너가 없어 진행 이벤트가 오지 않는다.
- **F5 다운로드 중 재안내 위험 (코드 경로 · 실기기 NOT_PROVEN)**: 정책 `decideAndroidPlayUpdateFlow` 는 `installStatus` 가 `DOWNLOADING`/`PENDING` 이어도 availability 가 `UPDATE_AVAILABLE`/`DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS` 면 `flexible` 을 고른다 → 복귀 시 안내 모달이 **다시** 뜰 수 있다. 또 네이티브 `onResumeAppUpdateInfo` 는 `DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS` + IMMEDIATE 허용이면 **Flexible 다운로드 중이어도 Google IMMEDIATE 전체 화면을 띄운다**(어떤 흐름을 시작했는지 구분 없음). Play 가 Flexible 다운로드 중 이 값을 주는지는 실기기 **NOT_PROVEN**.
- **F6 예상 크기 미표시**: 네이티브 `toUpdateInfoObject` 가 `AppUpdateInfo.totalBytesToDownload()` 를 넘기지 않는다.
- **F7 강제 업데이트 화면이 다른 모양**: 강제(IMMEDIATE)는 Google 의 Play 전용 전체 화면을 쓴다 (디자인 변경 불가). 일반 업데이트와 다른 화면이 된다.

## 2. 페이스북과 똑같이 할 수 없는 부분 (사실 · 먼저 적음)

| 페이스북 요소 | 디바이 | 이유 |
|---|---|---|
| 자체 다운로드·설치 (Play 시트 없음) | **불가** — Play 동의 시트 1회가 반드시 끼어든다 | Google Play 정책(기기 및 네트워크 악용): Play 배포 앱은 Play 업데이트 방식 외로 스스로 업데이트할 수 없다. 페이스북 화면은 자체 업데이터(제조사 사전 설치 경로)다. 디바이는 Play Core In-App Update 만 쓴다 (HARD LOCK 「세 영역 분리」). |
| 다운로드 「취소」 (다운로드 중단) | **실제 중단 불가** | Play Core `AppUpdateManager` 에 진행 중 다운로드 취소 API 가 없다. 「취소」라고 쓰고 다운로드가 계속되면 가짜 CTA(HARD LOCK 금지). → **「닫기」**(다운로드는 계속, 끝나면 이 화면이 다시 열림)로 정함. |
| 「Wi-Fi 없으면 모바일 데이터 사용」 체크 | **넣지 않음** | Play Core 에 데이터 망 선택 옵션이 없다. 체크해도 동작이 바뀌지 않는 가짜 설정이 된다. |
| 설치 마지막 화면 | 「설치 중…」은 디바이 화면, 그 뒤 Play 가 잠깐 자체 설치 화면을 덮고 앱이 재시작 | `completeUpdate()` 의 Play 동작(앱 재시작은 Play 가 수행). |

나머지(전체 화면 유지 · 로고 · 제목/설명 · 예상 크기 · 상세 정보 보기 · 하단 「업데이트」 · 단계 문구 · 진행 막대 · % )는 **동일 형태로 구현 가능**. 로고·색은 디바이 것(앱 아이콘, `--sam-primary`)을 쓴다 — 페이스북 로고·파란색은 쓰지 않는다.

## 3. 목표 흐름 (같은 전체 화면 1개, 단계만 전환)

화면 이름: **업데이트 화면** (`AndroidPlayUpdateScreen`). 모달(`DibayConfirmDialog`) 2개를 이 화면 1개로 교체한다. 시안 화면 번호와 같다.

| 시안 | Play 상태 (`installStatus`) | 화면 문구 | 진행 막대 | 버튼 |
|---|---|---|---|---|
| ① 안내 | `UPDATE_AVAILABLE` · 미시작 | 제목 「DIBAY 앱 업데이트」 / 설명 「DIBAY 앱을 사용하기 전에 최신 버전으로 업데이트해주세요.」 / 「예상 크기: N MB」(Play 값 있을 때만) / 「상세 정보 보기」 / 현재 버전 `이름 (빌드)` · 새 빌드 번호 (D2 유지) | 없음 | 하단 꽉 찬 「업데이트」 · 일반 업데이트만 상단 「나중에」(D1 24시간 억제 유지) |
| ② Play 동의 | (Play 시트) | ① 화면 위에 Google 시트가 뜬다. 뒤 화면은 ③ 「업데이트 준비 중…」으로 바뀌어 대기 | 무한 막대 | (Play 시트 버튼) |
| ③ 준비 | `PENDING` 또는 동의 직후 | 「업데이트 준비 중…」 | 무한 막대 | 「닫기」 |
| ④ 다운로드 | `DOWNLOADING` | 「다운로드 중…」 + 오른쪽 `N%` | 확정 막대 `bytesDownloaded/totalBytesToDownload` | 「닫기」 |
| ⑤ 설치 | `DOWNLOADED` → 자동 `completeUpdate()` → `INSTALLING` | 「설치 중…」 | 무한 막대 | 없음 |
| ⑥ 실패 | `FAILED` · 시작 실패 · 설치 시작 실패 | 「업데이트하지 못했습니다」 + 기존 오류 문구(U3/U4) | 없음 | 「다시 시도」 · 「닫기」 |

전환 규칙
- ① 「업데이트」 → `startFlexibleUpdate`. 동의 **취소** = ① 로 돌아가고 U2(같은 빌드 24시간 억제) 그대로. 동의 **OK** = ③.
- ③→④→⑤ 는 화면을 **닫지 않고** 같은 DOM 에서 단계만 바꾼다 (Owner 「설치까지 유지」).
- ④ 100% 후 `DOWNLOADED` 가 오면 **화면이 열려 있는 경우 자동 설치**(페이스북과 동일 · 두 번째 확인 없음). 통화 중이면 ⑤ 대신 「통화가 끝나면 설치됩니다」로 대기하고 통화 종료 후 진행 (네이티브 `call_in_progress` 거부 유지).
- 「닫기」(③④) 또는 Android 뒤로 = 화면만 숨김. 다운로드는 Play 가 계속. 다운로드가 끝나면(`flexibleUpdateDownloaded`) U1 안전 시점에 이 화면을 **⑤ 직전 상태(「업데이트 준비 완료 · 설치」 버튼 1개)** 로 다시 연다. 이 경우만 사용자가 「설치」를 누른다 (사용자가 화면을 떠났으므로 갑작스런 재시작 방지).
- 다운로드 중 앱 복귀 시: 안내 ① 이 아니라 **④ 진행 화면**을 연다 (F5 해소).
- 강제 업데이트(`android_immediate_update` 켜짐 / `android_min_version_code` 미만): **같은 화면**, 「나중에」·「닫기」 없음, 뒤로 무시. Flexible 로 받고 ⑤ 자동 설치. Play 가 Flexible 을 허용하지 않을 때만 기존 Google IMMEDIATE 로 대체 (F7 해소). U1 안전 시점 게이트는 그대로.
- 버전 정보 화면 「업데이트」/「지금 설치」 버튼도 이 화면을 연다 (같은 흐름 1개). 버전 정보 화면의 상태 줄 %는 유지.

## 4. 변경 범위

### 4-1 웹 (1단계 · 현재 설치본 빌드 32 에서도 동작)

현재 네이티브는 Flexible 시작 시 진행 리스너를 등록하고 `installStatus`(bytes 포함) 이벤트를 이미 보낸다 → **진행 %·단계 전환·자동 설치는 웹만으로 구 바이너리에서도 가능**.

| 파일 | 변경 |
|---|---|
| `components/platform/AndroidPlayUpdateScreen.tsx` (신규) | 전체 화면 레이어(포털, `fixed inset-0`, 안전 영역, `bg-sam-surface`), 단계별 문구·막대·버튼, `role="dialog" aria-modal`, 진행 `role="progressbar" aria-valuenow`. 토큰: `--sam-primary` 막대·버튼, `rounded-ui-rect` 버튼 |
| `lib/platform/android-play-update-screen-model.ts` (신규·순수) | Play 상태+이벤트 → 화면 단계(①~⑥)·% 계산 단일 정의. 테스트 대상 |
| `components/platform/AndroidPlayInAppUpdateHost.tsx` | 모달 2개 제거 → 업데이트 화면 1개. `addAndroidPlayInstallStatusListener` 구독 추가. 「닫기」·재오픈·강제 모드 |
| `lib/platform/android-play-in-app-update-orchestrator.ts` | `DOWNLOADING`/`PENDING` 이면 안내 대신 진행 화면 알림. 화면이 열린 상태의 `DOWNLOADED` → `confirmComplete` 자동 실행 경로. 강제 = Flexible 우선 |
| `lib/platform/android-play-in-app-update-policy.ts` | `installStatus` `DOWNLOADING`/`PENDING`/`INSTALLING` → `in_progress` 선택지 추가 (새 다운로드 시작 금지) |
| `lib/platform/android-play-update-prompt-gate.ts` | 열린 화면 양보 규칙: ①·⑥ 은 기존처럼 양보, ③④⑤ 진행 중에는 통화 수신 배너에만 양보(화면 숨김, 다운로드 계속) |
| `components/my/settings/VersionContent.tsx` | 「업데이트」/「지금 설치」 → 업데이트 화면 열기 |
| `lib/i18n/catalog/*` | 문구 키 추가 (ko/en) |
| 테스트 | `components/platform/__tests__/android-play-in-app-update-host.test.tsx`, `lib/platform/__tests__/android-play-in-app-update-orchestrator*.test.ts`, 신규 화면 모델 테스트 |

### 4-2 네이티브 (2단계 · 새 빌드 필요 · versionCode 33)

| 파일 | 변경 | 해소 |
|---|---|---|
| `DibayPlayInAppUpdatePlugin.java` `toUpdateInfoObject` | `totalBytesToDownload`·`bytesDownloaded` 포함 | F6 예상 크기·복귀 직후 % |
| 같은 파일 `load()`/`handleOnResume` | 진행 리스너를 상시 등록(중복 방지), `INSTALLED/FAILED/CANCELED` 후에도 다음 흐름에 재등록 | F4 |
| 같은 파일 `onResumeAppUpdateInfo` | IMMEDIATE 자동 재개는 **IMMEDIATE 로 시작한 흐름일 때만** (`installStatus` 가 Flexible 다운로드 중이면 재개 금지) | F5 |

구 바이너리(빌드 ≤32) 호환: 예상 크기는 값이 없으면 줄을 숨김, 복귀 시 %는 다음 진행 이벤트가 올 때까지 무한 막대. 웹 1단계가 구 바이너리에서 깨지지 않는다.

## 5. 계약 충돌 (Owner 확인 필요 · 임의 선택 안 함)

| 기존 계약 | Owner 새 지시 | 설계안 처리 |
|---|---|---|
| D3 「Flexible 설치 완료는 사용자 명시 확인 필요」 (설치 준비 모달 + 「지금 설치」) | 페이스북처럼 설치까지 같은 화면 유지 | 화면이 열려 있으면 자동 설치, 화면을 닫았던 경우만 「설치」 1회 — **D3 변경 승인 필요** |
| 2026-10-30 강제 업데이트 = Google IMMEDIATE 화면 | 같은 형태 | 강제도 같은 화면(Flexible) · IMMEDIATE 는 대체 경로 — **승인 필요** |
| HARD LOCK Change gate 「regression-only」 | 형태 변경 지시 | 이 지시를 재오픈 승인으로 볼지 — **승인 필요** |

## 6. 영향·회귀 위험

- 통화: 통화 코드는 바꾸지 않는다. `completeUpdate` 는 네이티브 통화 차단(`isCallBlockingUpdateUi`) 유지, 웹도 ⑤ 진입 전 통화 확인. 진행 화면은 수신 배너·통화 화면 아래로 양보.
- 전체 화면이 앱 사용을 막는 시간 증가(일반 업데이트) → 「닫기」로 즉시 해제 가능.
- 다운로드 중 「닫기」 후 재오픈 시점은 U1 게이트 사용 — 채팅방·주문서·글쓰기 중엔 보류.
- Play 가 아닌 설치본(ADB Debug)은 기존처럼 `ERROR_APP_NOT_OWNED(-10)` — 결함 아님 (HARD LOCK).

## 7. 검증 계획

- 코드: `typecheck:build`, 관련 vitest(화면 모델 단계표 전수·Host·오케스트레이터), 변경 파일 eslint.
- 실기기 (Play 설치본, Samsung): 내부 테스트 트랙에 빌드 N+1 올려 N 설치본에서 — ① 표시 → 동의 → ③ → ④ % 증가 → ⑤ 자동 설치 → 새 빌드로 재시작(`user_devices.app_version` 대조); ④ 중 「닫기」→ 완료 후 재오픈; ④ 중 앱 종료→재실행 → ④ 복귀; 동의 취소; 통화 중 다운로드 완료; 강제 모드; 비행기 모드 실패 → ⑥. 각 항목 PHT 시각·화면 캡처.
- 현재 실기기 증거 0 — 전 항목 **NOT_PROVEN**.

## 8. 배포 구분

- 1단계: **웹** (main 반영 후 앱 재시작). 2단계: **네이티브** (Android versionCode 증가 · AAB · Play 출시는 Owner 승인).
- 실제 단계 ③~⑤ 를 실기기에서 보려면 **Play 에 현재 설치본보다 높은 빌드가 올라가 있어야** 한다 (업데이트 대상이 없으면 화면이 나오지 않음).

## 9. 1단계 구현 메모 (2026-11-03)

- 구현 파일: `components/platform/AndroidPlayUpdateScreen.tsx`(화면) · `components/platform/AndroidPlayInAppUpdateHost.tsx`(상태·흐름) · `lib/platform/android-play-update-screen-model.ts`(단계 단일 정의) · 정책 `in_progress`·강제 FLEXIBLE · 오케스트레이터 `requestAndroidPlayUpdateScreen` · 게이트 `progress` 보류·`resolveUpdateStartOutcome` · 버전 정보 화면 버튼.
- 구 바이너리(빌드 ≤32) 보완: 진행 단계가 열려 있는 동안 3초마다 Play 상태를 읽어 **전진 상태만**(`PENDING`·`DOWNLOADING`·`INSTALLING`·`DOWNLOADED`) 반영한다 — 앱 재시작 뒤 네이티브 리스너가 없어도 다운로드 완료 → 자동 설치가 진행된다. % 는 바이트 이벤트가 올 때만 표시(재시작 뒤에는 무한 막대).
- 1단계에서 남는 것(2단계): 예상 크기 줄 미표시 · 다운로드 중 앱이 재시작되면 진행 화면이 자동으로 열리지 않음(완료 시 「설치」 화면으로 열림) · 네이티브 IMMEDIATE 자동 재개(F5 네이티브 부분).
- 「상세 정보 보기」는 일반 업데이트에서만 표시(강제 화면에서 이동해도 화면이 다시 덮기 때문) — 시안 ①′ 와 다름.

## 10. 2단계 구현 메모 (2026-11-03)

- 네이티브: §4-2 세 항목 그대로 (리스너 상시 등록 · 바이트 수 · IMMEDIATE 재개 조건 = 마지막 흐름 IMMEDIATE, `SharedPreferences`).
- 웹: 「예상 크기: N MB」(`formatUpdateDownloadSizeMb`, 10MB 미만 소수 1자리) · 보류된 진행 화면 재오픈·상태 읽기에 바이트 수 반영.
- 그대로인 것: 다운로드 중 앱이 재시작되면 진행 화면이 **자동으로 열리지는 않는다**(사용자가 닫았을 수 있음) — 완료 시 「설치」 화면으로 열림. 강제 업데이트도 동일.
- Play 가 다운로드 시작 **전**에 `totalBytesToDownload` 를 주는지는 실기기 **NOT_PROVEN** — 0 이면 줄을 숨긴다.
