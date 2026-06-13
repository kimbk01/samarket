# Google Native Auth Setup (Android)

## 목표 UX

Google 로그인 → **Chrome/Custom Tab 없음** → Google 계정 선택 → `POST /api/auth/native/exchange` → `sessionEstablished=true`

## 재구현 불필요

Kakao Native가 동작하면 exchange·세션 파이프라인은 이미 완료다.  
Google **오류 10 (DEVELOPER_ERROR)** 는 **Google Cloud OAuth 설정** 문제이지 앱 코드 재작성 문제가 아니다.

## 필수 설정 (3종)

| # | 항목 | 값 |
|---|------|-----|
| 1 | Google Cloud **Android** OAuth | 패키지 `com.dibay.app` + Logcat `google_native_app_sha1` **한 글자까지 동일** |
| 2 | **Web** Client ID (`DIBAY Google Login`) | `229866850463-llmbrm89...apps.googleusercontent.com` |
| 3 | Vercel `AUTH_GOOGLE_NATIVE_WEB_CLIENT_ID` | 2번과 **동일** |

⚠️ `GOOGLE_WEB_CLIENT_ID`(Android) ≠ Web Client ID. Android ID(`s690gak...`)를 넣으면 **무조건 오류 10**.

⚠️ 프로젝트 번호 오타: `229**866**850463` (868 아님)

## 권장: Firebase `google-services.json` (오타 방지)

1. [Firebase Console](https://console.firebase.google.com) → **기존 GCP 프로젝트 가져오기** → `DIBA-maps-prod`
2. **Android 앱 추가**
   - 패키지: `com.dibay.app`
   - SHA-1: Logcat `google_native_app_sha1=` 값
3. `google-services.json` 다운로드 → **`android/app/google-services.json`**
4. Android Studio **Rebuild → Run**

`google-services.json` 이 있으면 플러그인이 **`default_web_client_id`** 를 자동 사용한다 (`local.properties` 오타보다 우선).

## 대안: `android/local.properties` 만 사용

```properties
GOOGLE_WEB_CLIENT_ID=229866850463-llmbrm89t84hvhntbj2f1iam4chfppch.apps.googleusercontent.com
```

Android Studio **Run → Edit Configurations → Environment variables** 에 잘못된 `GOOGLE_WEB_CLIENT_ID` 가 있으면 **삭제** (env가 local.properties 보다 우선).

## Logcat 확인 (`DIBAY_Google`)

성공:
```
google_native_web_client_source=google_services_json   (또는 local_properties)
google_native_client_prefix=229866850463-llmbrm8
google_native_success
google_native_exchange_ok
```

실패:
```
google_native_intent_parse_failed 10   → Android OAuth SHA-1/패키지 또는 Web Client ID 프로젝트 불일치
google_native_web_client_prefix=229868850463-...   → 866 오타 — local.properties 수정
```

## Vercel

- 변수명: **`AUTH_GOOGLE_NATIVE_WEB_CLIENT_ID`** ( `GOOGLE_WEB_CLIENT_ID` 아님 )
- Sensitive On 이면 Edit에서 마스킹만 보임 — **재저장 금지**
- 변경 후 **Redeploy**
