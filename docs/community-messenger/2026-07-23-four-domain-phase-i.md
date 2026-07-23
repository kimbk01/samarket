# Phase I — chrome 1단 cutover (fake shell 제거)

**상태:** cutover 적용 (2026-07-23)

## 확인된 문제
May~Jul 패치로 `ShellChromeFrame`(뒤로가기 없는 seed 헤더)가 overlay/layout/Gate/Pass0에 중첩 → 2단 진입. 3개월 전(2026-04)에는 해당 파일 없음.

## 제품 변경
| 제거/비활성 | 대체 |
|-------------|------|
| layout z-0 LayoutInline ShellChromeFrame | 호스트 제거 |
| OpeningOverlay ShellChromeFrame | `return null` (store만) |
| Stable/RouteEntry ShellChromeFrame | `EntryEmpty` (bg only) |
| Phase2 Pass0 + Pass1 Stable | Phase2Body 직행 |
| RoomClient Inner loading RouteEntry | `null` |

첫 보이는 방 UI = `Phase2Body`(실제 헤더·뒤로가기·타임라인).  
Pass0/RouteEntry/StableEntry/Pass1Stable **파일 삭제** — Phase J slice-2.

## 비대상
Hub/Bell/AppIcon · Native Call · Domain header/dock not_wired
