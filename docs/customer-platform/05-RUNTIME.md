# 05 — Runtime Contract

Architecture LOCK #6.

Runtime은 “마지막 검증 Slice”만이 아니라 **전 Domain이 따르는 계약**이다.  
Cold Start부터 Deep Link까지 Member / Owner / Admin / Guest / System / Service가 동일 규칙을 쓴다.

## Runtime events

| Event | Contract (LOCK 시 확정) | Applies to |
|-------|-------------------------|------------|
| Cold Start | boot 순서 · consent · session hydrate | all clients |
| Resume | foreground refresh 범위 · badge/notif | Member/Owner/Admin |
| Background | pause realtime · flush | |
| Offline | queue / read-only / banner | |
| Network Retry | backoff · idempotency | APIs |
| Logout | session clear · cache · nav replace | Member/Owner/Admin |
| Account Switch | Facts cache isolation | |
| Permission Change | camera/mic/notif/location | |
| Token Refresh | single-flight · fail → reauth | |
| Deep Link | route allowlist · auth gate | |

## Domain × Runtime

각 Domain([02](./02-DOMAIN-CONTRACT.md))은 위 이벤트별 **허용 동작**을 명시한다.  
예: Guest는 Logout/Account Switch 무관 · Admin은 Audit Scope에 Logout 기록.

## Slice 배치

- **계약 작성:** Architecture LOCK (#6)  
- **강제 구현:** Slice 2 Authority + 플랫폼 boot 코드  
- **전수 실측:** Slice 9–11 Runtime / PRODUCT PASS
