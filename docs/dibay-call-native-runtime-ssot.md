# DIBAY Call Native Runtime SSOT

이 문서는 DIBAY Call 개발의 최상위 SSOT다. 기존 구현 방향, 성능 패치, V4/Web 보완 방향보다 우선한다.

## 변경 금지 목표

통화는 DIBAY 앱 WebView를 거치지 않는다. Voice와 Video 모두 동일하다.

최종 통화 성립 경로:

```text
FCM -> Native Runtime -> Accept -> Native Token -> Native Agora SDK -> Connected -> End -> Cleanup
```

`WebView`, `CallV4Screen`, Agora JS, `/calls-v4` route는 통화 성립 조건이 아니다.

## 구현 순서

1. Native Voice Runtime
2. Native Video Runtime
3. Android COMPLETE
4. iOS
5. Windows

## Legacy V4/Web Quarantine

기존 V4/Web Runtime은 지금 삭제하지 않는다. 다만 Native Runtime 구현 중에는 승인 없이 사용, 참조, import, 호출, 복구하지 않는다.

Quarantine 대상:

- `CallV4Provider`
- `CallV4Screen`
- `/calls-v4`
- JS Agora
- `call-v4-agora*`
- `call-v4-video*`
- `call-v4-presenter*`
- Web token prefetch
- `MainActivity` Web handoff
- pending route replay
- Web accept hydration
- remote attach pipeline

## Native Runtime Import 금지

Native Runtime에서 아래 import/참조는 금지한다.

- `call-v4*`
- `CallV4*`
- `community-messenger/call-v4/*`
- Agora JS

## LOCK 보호

승인 없이 아래는 수정하지 않는다.

- Native Voice Runtime
- 기존 Voice LOCK
- Native Voice 문서
- 기존 QA 문서
- 기존 LOCK 로그

## 삭제 순서

Legacy 삭제는 Native Runtime PASS, QA PASS, LOCK, Legacy 미사용 확인 후 진행한다.

## 최종 기준

Android 통화는 사용자가 보기에 Telegram처럼 앱을 거치지 않고 즉시 수신, 즉시 연결, 즉시 통화가 되어야 한다.
