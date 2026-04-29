# SAMarket 차단형 확인 팝업 — 재사용 프롬프트

거래 글쓰기·임시저장 복구·나가기 확인 등 **반드시 두 버튼 중 하나를 선택해야 하는** 화면에 동일한 UI·동작을 적용할 때 사용한다.

## 한 줄 요약

**강제 선택 다이얼로그**는 화면 **상하좌우 중앙** 카드로 띄우고, **배경 탭·Escape·헤더 X로 닫지 않는다.** 닫힘은 **제공된 버튼 핸들러만** 허용한다.

---

## 에이전트 / 코드 생성용 프롬프트 (복사용)

아래 블록을 그대로 요청에 붙여 넣는다.

```
[SAMarket 차단형 확인 팝업 규칙]

- 목적: 사용자가 실수로 나가거나 상태가 꼬이지 않도록, 확인/취소·이어쓰기/새로 작성 등 "두 선택지 중 하나"만 허용한다.

- 레이아웃:
  - fixed inset-0 + flex items-center justify-center + 좌우 패딩(p-4)
  - 카드: max-w-md, rounded-2xl, bg-sam-surface, 중앙 정렬 타이틀·설명
  - 배경 dim: bg-black/50 — 단, 클릭으로 닫히지 않게 한다 (pointer-events 없는 div 또는 버튼 미사용)

- 금지:
  - 배경(딤) 탭으로 닫기
  - Escape 키로 닫기
  - 모달 카드에 X 버튼 또는 "강제 닫기" 단독 컨트롤
  - 바텀시트 손잡이 바 + 하단 슬라이드 업만 쓰는 패턴(차단형이 아닐 때만 허용)

- 허용되는 종료: 각 액션 버튼의 onClick만 (예: onCancel/onConfirm, onPrimary/onSecondary)

- 구현:
  - 새 컴포넌트를 만들지 말고 기존 `MobileConfirmBottomSheet` 또는 `MobileDualActionBottomSheet`를 사용한다.
  - 반드시 `interactionMode="blocking"` 을 넘긴다.
  - standard 모드용으로 연결돼 있던 `onClose`(듀얼 시트)는 blocking에서는 호출되지 않도록 하거나, 빈 함수/no-op으로 두어 배경 탭이 의도치 않은 동작을 하지 않게 한다.

- 스타일 토큰: Sam 버튼 조합 (`Sam.btn.primaryCombo`, `Sam.btn.secondaryCombo`, `Sam.btn.dangerCombo`), 텍스트는 text-sam-fg / text-sam-muted

- 접근성: role="dialog", aria-modal, 적절한 aria-label
```

---

## 언제 `blocking` vs `standard`

| 모드 | 용도 |
|------|------|
| **`blocking`** | 임시저장 복구, 나가기 확인, 삭제·위험 확인 등 **상태를 바꾸기 전에 명시적 선택이 필요**할 때 |
| **`standard`** | 정보성·부가 동작, 배경 탭으로 나가도 무방한 경량 확인 (기본 하단 시트) |

---

## 코드에서의 단일 진실

| 컴포넌트 | 파일 | 차단 모드 prop |
|----------|------|----------------|
| `MobileConfirmBottomSheet` | `components/ui/MobileConfirmBottomSheet.tsx` | `interactionMode="blocking"` |
| `MobileDualActionBottomSheet` | 동일 | `interactionMode="blocking"` |

타입: `MobileSheetInteractionMode = "standard" | "blocking"`.

---

## 검수 체크리스트 (PR 전)

- [ ] `interactionMode="blocking"` 사용 여부
- [ ] 배경이 **버튼이 아닌** 딤만 있는지 (클릭해도 닫히지 않음)
- [ ] Escape로 닫히지 않음 (`blocking` 분기에서 키 리스너 없음)
- [ ] 카드에 **닫기 X 없음** (필요 시 부모 화면만 별도 규칙)
- [ ] `MobileDualActionBottomSheet`의 `onClose`가 **blocking에서 의도치 않게 상태 변경을 일으키지 않는지**

---

## 관련 제품 맥락

- 거래 글쓰기·시트 이탈: `TradeWriteForm`, `WriteSheetFlowInner`, `TradeWriteSheetContext`, `TradeWriteBottomSheet` 등에서 이미 `blocking` 패턴 적용 사례 참고.

이 문서는 **UI 일관성**과 **에이전트/리뷰어 공유용**이다. 새 화면에 “강제 선택” 팝업을 추가할 때 위 프롬프트 블록을 요청에 포함하면 동일 규칙으로 구현할 수 있다.
