import Capacitor
import Foundation
import StoreKit

/**
 * Apple 인앱 결제 (StoreKit 2 · Point 소모성 상품) — 웹 계약 `lib/apple-iap/native-storekit-bridge.ts`.
 *
 * 거래를 닫는(finish) 시점은 웹이 서버 지급 완료·검토 기록을 확인한 뒤 `finishTransaction` 을 부를 때뿐이다.
 * 닫히지 않은 거래는 StoreKit 이 보관하므로 앱 종료·재시작·지급 지연 뒤에도 `getUnfinishedTransactions` 로
 * 다시 넘겨 서버가 재처리한다 (서버는 거래 번호 기준으로 한 번만 지급).
 * 서명 검증은 서버가 한다 — 여기서는 Apple 이 준 서명 원문(JWS)을 그대로 넘긴다.
 *
 * CAPBridgedPlugin — registered natively in DibayRootBridgeViewController.makeAppTargetPlugins().
 */
@objc(DibayStoreKitPlugin)
public class DibayStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "DibayStoreKitPlugin"
  public let jsName = "DibayStoreKit"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getUnfinishedTransactions", returnType: CAPPluginReturnPromise),
  ]

  private let purchaseGate = DibayStoreKitPurchaseGate()
  private var updatesTask: Task<Void, Never>?

  override public func load() {
    // StoreKit requires a Transaction.updates listener from launch (Ask to Buy approvals, interrupted
    // purchases). Nothing is finished here — those transactions stay unfinished until the server credits them.
    updatesTask = Task.detached(priority: .background) {
      for await _ in Transaction.updates {}
    }
  }

  deinit {
    updatesTask?.cancel()
  }

  @objc func getProducts(_ call: CAPPluginCall) {
    let ids = (call.getArray("productIds", String.self) ?? [])
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    if ids.isEmpty {
      call.resolve(["products": []])
      return
    }
    Task {
      do {
        let products = try await Product.products(for: ids)
        call.resolve([
          "products": products.map { ["productId": $0.id, "displayPrice": $0.displayPrice] },
        ])
      } catch {
        call.reject("products_unavailable", nil, error)
      }
    }
  }

  @objc func purchase(_ call: CAPPluginCall) {
    let productId = (call.getString("productId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !productId.isEmpty,
          let token = UUID(uuidString: call.getString("appAccountToken") ?? "")
    else {
      call.reject("invalid_arguments")
      return
    }
    Task {
      guard await purchaseGate.begin() else {
        call.reject("purchase_in_progress")
        return
      }
      do {
        guard let product = try await Product.products(for: [productId]).first else {
          await purchaseGate.end()
          call.reject("product_unavailable")
          return
        }
        let result = try await product.purchase(options: [.appAccountToken(token)])
        await purchaseGate.end()
        switch result {
        case let .success(verification):
          call.resolve([
            "result": "success",
            "transactionId": String(verification.unsafePayloadValue.id),
            "signedTransaction": verification.jwsRepresentation,
          ])
        case .userCancelled:
          call.resolve(["result": "userCancelled"])
        case .pending:
          call.resolve(["result": "pending"])
        @unknown default:
          call.reject("purchase_unknown_result")
        }
      } catch {
        await purchaseGate.end()
        call.reject("purchase_failed", nil, error)
      }
    }
  }

  /** 서버 지급 확인 뒤에만 호출된다. 이미 닫힌·없는 거래는 그대로 성공 (중복 호출 안전). */
  @objc func finishTransaction(_ call: CAPPluginCall) {
    guard let id = UInt64((call.getString("transactionId") ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    else {
      call.reject("invalid_arguments")
      return
    }
    Task {
      for await result in Transaction.unfinished {
        let transaction = result.unsafePayloadValue
        if transaction.id == id {
          await transaction.finish()
          call.resolve(["finished": true])
          return
        }
      }
      call.resolve(["finished": false])
    }
  }

  @objc func getUnfinishedTransactions(_ call: CAPPluginCall) {
    Task {
      var transactions: [[String: String]] = []
      for await result in Transaction.unfinished {
        let transaction = result.unsafePayloadValue
        guard transaction.productType == .consumable else { continue }
        transactions.append([
          "transactionId": String(transaction.id),
          "signedTransaction": result.jwsRepresentation,
        ])
      }
      call.resolve(["transactions": transactions])
    }
  }
}

/** 동시에 두 결제 창이 뜨지 않게 (중복 탭·중복 호출) */
private actor DibayStoreKitPurchaseGate {
  private var busy = false

  func begin() -> Bool {
    if busy { return false }
    busy = true
    return true
  }

  func end() {
    busy = false
  }
}
