# Phase 1 — Firebase · FCM · env (P0)

**목표:** Admin test push → `notification_deliveries.status = sent` (skipped/failed 없음)

코드 추가 없음. 아래만 수행.

---

## 1. Firebase Console — Android 앱

1. [Firebase Console](https://console.firebase.google.com/) → 프로젝트 선택(또는 생성)
2. **프로젝트 설정** → **내 앱** → **Android 앱 추가**
3. Android 패키지 이름: **`com.dibay.app`** (코드: `android/app/build.gradle` `applicationId`)
4. `google-services.json` **다운로드**
5. 저장 경로: **`android/app/google-services.json`**
   - gitignore 대상 (`android/.gitignore`) — repo에 커밋하지 않음

로컬 확인:

```bash
npm run verify:push-phase1-ready
```

---

## 2. Firebase Service Account (FCM HTTP v1)

1. Firebase Console → **프로젝트 설정** → **서비스 계정**
2. **새 비공개 키 생성** → JSON 다운로드
3. Vercel + 로컬 `.env.local`에 등록:

```bash
# 한 줄 JSON (따옴표 이스케이프) 또는 base64
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

PUSH_DISPATCH_ENABLED=1
```

**로컬** `npm run dev` 재시작 · **Vercel** Production/Preview env 동일 키 → **Redeploy**

---

## 3. APNS (Phase 1 Android만이면 생략 가능)

iPhone QA 전에 Apple Developer에서:

| 변수 | 내용 |
|------|------|
| `APNS_KEY_P8` | `.p8` 키 본문 (`\n` 줄바꿈) |
| `APNS_KEY_ID` | Key ID |
| `APNS_TEAM_ID` | Team ID |
| `APNS_BUNDLE_ID` | iOS bundle id (Xcode `PRODUCT_BUNDLE_IDENTIFIER`) |
| `APNS_VOIP_TOPIC` | 보통 `{bundleId}.voip` |

---

## 4. Supabase migration 적용 확인

마이그레이션: `supabase/migrations/20260915100000_user_devices_notification_deliveries.sql`

**SQL Editor**에서:

```sql
SELECT
  to_regclass('public.user_devices') AS user_devices,
  to_regclass('public.notification_deliveries') AS notification_deliveries;
```

둘 다 `user_devices` / `notification_deliveries` 이름이 나와야 함. NULL이면 migration 적용.

---

## 5. Admin test push + sent 확인

1. 스테이징/프로덕션 URL에서 **관리자** 로그인
2. 네이티브 앱(또는 Capacitor)에서 **테스트 대상 user** 로그인 → 알림 권한 허용 → push 등록
3. `/admin/push-devices` → user UUID → **테스트 푸시**
4. Supabase:

```sql
SELECT id, user_id, event_type, status, provider_response, created_at
FROM notification_deliveries
ORDER BY created_at DESC
LIMIT 3;
```

### Phase 1 PASS

| 조건 | |
|------|--|
| `status` | **`sent`** |
| `provider_response` | `fcm_not_configured` / `apns_not_configured` / `skipped` / `failed` **없음** |

---

## 6. 보고 템플릿

`docs/push-native-rollout-report.md` Phase 1 표 + delivery JSON 3건 붙여넣기.

---

## Android APK (Phase 1 sent **이후**)

```bash
npm run verify:push-phase1-ready   # sent 전 로컬 config
cd android && ./gradlew assembleDebug
# 기기: adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Phase 2 실기기 QA: `docs/push-device-qa-checklist.md`
