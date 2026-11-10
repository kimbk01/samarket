import Capacitor
import Contacts
import UIKit

/**
 * 메신저 연락처 동기화 — 휴대폰 연락처 읽기 (SSOT docs/design/messenger-contacts-sync-plan.md v5 §6-3).
 * 읽기 전용: 연락처 ID · 이름 · 전화번호만 돌려준다. 이름은 웹이 기기 안 화면 표시에만 쓰고 서버로 보내지 않는다.
 * iOS 18 「일부 연락처만 허용」(limited) 이면 허용된 연락처만 읽힌다. 통화·푸시·인증 코드와 연결 없음.
 */
@objc(DibayContactsPlugin)
public class DibayContactsPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayContactsPlugin"
  public let jsName = "DibayContacts"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "checkPermission", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "readPhoneContacts", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
  ]

  private let store = CNContactStore()

  private func stateString() -> String {
    let status = CNContactStore.authorizationStatus(for: .contacts)
    if status == .authorized { return "granted" }
    if status == .notDetermined { return "prompt" }
    if status == .denied || status == .restricted { return "denied" }
    // iOS 18 .limited (일부 연락처 허용)
    return "limited"
  }

  @objc func checkPermission(_ call: CAPPluginCall) {
    call.resolve(["state": stateString()])
  }

  @objc func requestPermission(_ call: CAPPluginCall) {
    store.requestAccess(for: .contacts) { [weak self] _, _ in
      call.resolve(["state": self?.stateString() ?? "denied"])
    }
  }

  @objc func readPhoneContacts(_ call: CAPPluginCall) {
    let state = stateString()
    guard state == "granted" || state == "limited" else {
      call.reject("permission_denied")
      return
    }
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self = self else { return }
      var keys: [CNKeyDescriptor] = [CNContactIdentifierKey as CNKeyDescriptor, CNContactPhoneNumbersKey as CNKeyDescriptor]
      keys.append(CNContactFormatter.descriptorForRequiredKeys(for: .fullName))
      let request = CNContactFetchRequest(keysToFetch: keys)
      var out: [[String: Any]] = []
      do {
        try self.store.enumerateContacts(with: request) { contact, _ in
          let numbers = contact.phoneNumbers.map { $0.value.stringValue }.filter { !$0.isEmpty }
          if numbers.isEmpty { return }
          let name = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
          out.append(["id": contact.identifier, "name": name, "numbers": numbers])
        }
        call.resolve(["contacts": out])
      } catch {
        call.reject("read_failed")
      }
    }
  }

  @objc func openAppSettings(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      if let url = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(url)
      }
      call.resolve()
    }
  }
}
