# Gate 1 — Identity Contamination Report

**Mode:** AUDIT ONLY  
**HEAD:** `449e02771`

---

## Checklist

| 혼합 유형 | 상태 | 증거 |
|-----------|------|------|
| member_id와 store_id 혼용 | **잔존 위험** | Owner ops가 과거 `notification_events.user_id`로 기록; Slice 2-5 C 분리 계약·코드 있으나 NC에 OwnerLite(store UI)가 member NC 위에 렌더 |
| sender/recipient 반전 | 미전수 | 별도 이벤트 샘플 감사 필요 (Gate2) |
| buyer/seller 반전 | 미전수 | Trade 상태 A vs Trade chat B 분류는 계약상 분리 |
| customer/owner 반전 | **부분 오염** | Owner SO rooms: Cap App Icon에서는 제외(06bab8001), `unifiedAttention`에는 포함 → 동일 userId에 두 공식 |
| 여러 storeId 합산 | OwnerLite/FAB는 active store 의도 | NC 경로에서 OwnerLite가 뜨면 member 화면에 store 숫자(16) 노출 |
| general/trade/order 동일 room | quarantine 경로 Gate3 | identity_incomplete / quarantined 카운트 HTTP 로그에 존재 |
| push token = user authority | 금지·대체로 echo | badge_count를 권위로 쓰면 FAIL |
| 기기 badge = server authority | Cap resume cache | versioned resume 계약 있으나 dual HTTP와 충돌 가능 |

---

## Contamination that already failed product

```text
member:{user} viewing /notifications
  + store OwnerLite tabs (주문 현황 / 받은 문의) badge 16
  + member FloatingAddButton (+)
  + member Bottom Chat 3
  + A list empty
```

Identity 경계가 **UI 셸에서 붕괴**. 숫자 authority와 별개로 PRODUCT FAIL.

```text
HTTP: memberAppIcon=20  vs  unifiedAttention.appIconTotal=22
```

Store-owner room count가 두 번째 공식에만 남음 → **member/store 축 미종결**.
