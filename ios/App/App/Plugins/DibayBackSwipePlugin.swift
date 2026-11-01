import Capacitor
import Foundation
import UIKit

/**
 * iOS 화면 가장자리 스와이프 뒤로가기 — 웹 화면이 켤 때만 (Owner 승인 2026-11-02 · 커뮤니티 글쓰기).
 *
 * 기본은 꺼져 있다(앱 전체 동작 그대로 · 통화·메신저 화면 무변경). 글쓰기 작성기가 열려 있는 동안만 켜서
 * 스와이프 = 브라우저 뒤로가기(popstate) → 작성 중 이탈 가드가 나가기 시트를 띄운다.
 * 새 문서를 읽기 시작하면 DibayRootBridgeViewController 가 다시 끈다(재로드·크래시 뒤 남지 않게).
 *
 * CAPBridgedPlugin — registered natively in DibayRootBridgeViewController.makeAppTargetPlugins().
 */
@objc(DibayBackSwipePlugin)
public class DibayBackSwipePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayBackSwipePlugin"
  public let jsName = "DibayBackSwipe"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise),
  ]

  @objc func setEnabled(_ call: CAPPluginCall) {
    let enabled = call.getBool("enabled") ?? false
    DispatchQueue.main.async { [weak self] in
      guard let root = self?.bridge?.viewController as? DibayRootBridgeViewController else {
        call.reject("root_view_controller_unavailable")
        return
      }
      root.setBackSwipeEnabled(enabled)
      call.resolve(["enabled": root.backSwipeEnabled])
    }
  }
}
