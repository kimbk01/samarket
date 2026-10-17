# DIBAY Android Play 업데이트 HARD LOCK

**ACTIVE.** Cursor: `.cursor/rules/dibay-android-play-update-hard-lock.mdc`

## FINAL AUTHORITY

Android 버전·자동 업데이트 운영 계약. HARD LOCK은 **출시 안전 규칙과 정상 동작을 보호**하며, 정상적인 `versionCode` 증가·AAB·Play 출시를 막지 않는다.

## 세 영역 분리 (혼동 금지)

| 구분 | 담당 | 동작 |
|---|---|---|
| Google Play 자동 업데이트 | Google Play | Play 설정·기기 조건에 따라 자동 설치 |
| 앱 내부 업데이트 | Native Play Core + 웹 UI | 새 버전 조회·사용자 안내·설치 |
| 웹 기능 업데이트 | Vercel Production (`git push origin main`) | 원격 웹 코드 반영 |

불변:

1. 웹 배포만으로 Android `versionCode`가 증가하지 않는다.
2. AAB 제작만으로 Google Play 출시가 완료되지 않는다.
3. Google Play 출시만으로 모든 기기의 즉시 자동 설치가 보장되지 않는다.
4. 앱 내부 업데이트는 **Play에서 정상 획득한 설치본** 기준으로 검증한다.
5. ADB Debug 설치본에서 `ERROR_APP_NOT_OWNED(-10)` 등이 나오는 것을 일반 사용자 결함으로 오판하지 않는다.

## 확정 원인 (재추정 금지)

이전 Samsung 실패 경로의 확정 원인:

- ADB 디버그 앱 ↔ Play 설치본 **서명 불일치**
- Play Core `ERROR_APP_NOT_OWNED(-10)`

이것을 다시 **웹 버그** 또는 **Native Plugin 미등록**으로 추정하지 않는다.

## 내정보 → 버전 정보 CTA

- 버전·최신 여부·업데이트 가능 여부를 **하드코딩하지 않는다**.
- 설치 버전 = Native 설치본, Play 최신 = Play API 결과.
- Play가 주지 않는 versionName을 추측하지 않는다.
- 조회 실패를 「최신 버전입니다」로 위장하지 않는다.
- UI만 활성화하고 Native 설치가 진행되지 않는 가짜 CTA 금지.
- 상태별 CTA: `lib/platform/android-play-version-screen-cta.ts` + `components/my/settings/VersionContent.tsx`
- 버튼 시각: `resolveVersionScreenCtaVisual` + `.version-update-cta[data-cta-visual]`
  - latest/unavailable disabled = solid `#D1D5DB` / `#6B7280` (faded primary 금지)
  - active/busy = `--sam-primary` / press `--sam-primary-active`
  - retry = primary-soft 재시도 토큰
  - 중복 팝업·비활성 실행·가짜 색상 인터랙션 금지

## 향후 AAB 출시 규칙

1. Cursor에서 릴리스 대상 코드 확정
2. `versionCode` 증가 (네이티브 변경 시 CI `native-version-bump`)
3. 공식 AAB 빌드 파이프라인 사용
4. Capacitor Production URL 확인
5. package ID·서명·Native Plugin·Play Core 검증
6. localhost·누락 config 차단
7. AAB SHA256·산출물 기록
8. Owner 승인 후 Google Play 업로드·출시
9. Play 설치본에서 업데이트 검증

기존 검증 파이프라인 재사용. 중복 시스템 금지.

## NOT_PROVEN (PASS로 바꾸지 않음)

- Play 백그라운드 자동 설치
- V4 → V5 실제 In-App 다운로드·설치 E2E
- 로그인 후 푸시 토큰 재등록

## Change gate

Play In-App Update / 버전 정보 화면 / AAB 검증 파이프라인 변경은 **regression-only**.  
재오픈: Owner PRODUCT FAIL + 새 first-divergence 증거.

통화·메신저·알림·로그인·결제·배달 계약은 본 HARD LOCK 범위 밖이며 건드리지 않는다.
