# P4 APK 배포 — Device B 설치 안내

**APK:** `docs/perf/dibay-p4-active-call-debug-20260618.apk` (~8.4MB)

> **WebView 로드:** Capacitor `server.url`(`.env` `CAPACITOR_SERVER_URL`)이 설정되면 APK는 **번들이 아니라 해당 HTTPS/로컬 dev 서버**를 로드합니다.  
> `/debug/call-qa` 및 P4 QA 로그는 **그 서버에 최신 코드가 배포·실행 중**이어야 동작합니다.  
> 로컬 QA: Mac에서 `npm run dev` + `CAPACITOR_SERVER_URL=http://<LAN-IP>:3000` 로 빌드한 APK 사용.

## 설치 방법 (USB 불가)

택 1:

- 카카오톡 / Telegram 파일 전송
- Google Drive 업로드 → 기기에서 다운로드
- Gmail 첨부 (25MB 이하)
- 같은 Wi‑Fi에서 Mac 로컬 HTTP 공유 (`python3 -m http.server` in `docs/perf/`)
- AirDrop (iOS는 별도)

## 설치 전 설정

1. **기존 DIBAY** — 덮어쓰기 가능 (동일 debug signing). 문제 시 삭제 후 재설치.
2. **알 수 없는 앱 설치** — Android 설정 → 보안 → 출처 unknown 허용 (기기별 메뉴 다름).
3. **배터리 최적화** — DIBAY 제외 권장 (통화 백그라운드).
4. **권한** — 알림 · 마이크 · 카메라(영상) 허용.

## 계정

| 기기 | 계정 | logcat |
|------|------|--------|
| Device A (USB) | 계정 A | `docs/perf/p4-device1-logcat.txt` |
| Device B (APK) | 계정 B | **앱 내 QA 로그** |

**같은 계정 2대 금지.**

## Device B — QA 로그 확인

1. 통화 QA 후 앱에서 **`/debug/call-qa`** 열기  
   (예: `https://<your-host>/debug/call-qa` 또는 앱 WebView URL bar)
2. **Copy all logs** → 카카오톡/메모로 Device A 측에 전송
3. 또는 Chrome DevTools remote debugging (가능 시):  
   `window.__dibayCallQaLogs.exportText()`

## QA 후 Supabase heartbeat 확인

```sql
SELECT id, status, answered_at,
       caller_last_heartbeat_at, callee_last_heartbeat_at, reconnecting_since,
       ended_at, ended_reason, updated_at
FROM community_messenger_call_sessions
WHERE id = '<callId>';
```

## stale cleanup owner

- **pg_cron** — Dashboard에서 `cron.job` 확인 (미확인 시 아래 대안)
- **대안** — `GET/POST /api/community-messenger/calls/sessions/stale-cleanup` + `CRON_SECRET`  
  Vercel Cron 등록은 pg_cron **미사용** 확인 후만 (`vercel.json` — 현재 미등록)
