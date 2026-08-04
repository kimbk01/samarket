import UIKit
import Capacitor
import KakaoSDKAuth
import KakaoSDKCommon

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if let appKey = Bundle.main.object(forInfoDictionaryKey: "KAKAO_NATIVE_APP_KEY") as? String {
            let trimmed = appKey.trimmingCharacters(in: .whitespacesAndNewlines)
            let isPlaceholder = trimmed.isEmpty || trimmed.hasPrefix("$(") || trimmed.contains("YOUR_KAKAO")
            if !isPlaceholder {
                KakaoSDK.initSDK(appKey: trimmed)
            }
        }
        VoIPPushRegistry.shared.start()
        Self.logDibayBuildFingerprint()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        DibayActiveCallSessionManager.shared.onAppBackground()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        DibayActiveCallSessionManager.shared.onAppForeground()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        DibayActiveCallSessionManager.shared.onAppForeground()
        ScreenAwakeBridge.shared.reapplyOnBecomeActive()
        CallV4SurfaceOwnerBridge.flushPending()
        // Gate 3 Step 11 — do NOT re-apply versionless Cap prefs on resume.
        // Final App Icon = versioned canonical A+B via Web → apply(appIconTotal:).
        _ = DibayAppIconDeliveryAdapter.applyFromCapBadgeCache()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // KakaoTalk custom-scheme return: kakao{NATIVE_APP_KEY}://oauth
        // AuthController.handleOpenUrl is @MainActor — must run on main.
        if AuthApi.isKakaoTalkLoginUrl(url) {
            let keys = URLComponents(url: url, resolvingAgainstBaseURL: false)?
              .queryItems?
              .map(\.name)
              .joined(separator: ",") ?? ""
            var handled = false
            let run = {
              handled = AuthController.handleOpenUrl(url: url)
            }
            if Thread.isMainThread {
              run()
            } else {
              DispatchQueue.main.sync(execute: run)
            }
            NSLog(
              "[DIBAY_Kakao] open_url isKakaoTalkLoginUrl=1 handled=%d scheme=%@ queryKeys=%@",
              handled,
              url.scheme ?? "",
              keys
            )
            return handled
        }
        if url.scheme?.hasPrefix("kakao") == true {
            var handled = false
            let run = { handled = AuthController.handleOpenUrl(url: url) }
            if Thread.isMainThread { run() } else { DispatchQueue.main.sync(execute: run) }
            NSLog("[DIBAY_Kakao] open_url kakao_scheme handled=%d", handled)
            if handled { return true }
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL,
           AuthApi.isKakaoTalkLoginUrl(url)
        {
            let handled = AuthController.handleOpenUrl(url: url)
            NSLog("[DIBAY_Kakao] continue_userActivity handled=%d", handled)
            return handled
        }
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // Capacitor PushNotifications — alert APNs token bridge (NOT VoIP/PushKit).
    // Without this forward, registerForRemoteNotifications succeeds but JS never gets `registration`.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // iOS Delivery Adapter v1 — APNS aps.badge / badgeCount → SpringBoard (echo only).
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        DibayAppIconDeliveryAdapter.applyFromPushUserInfo(userInfo)
        completionHandler(.noData)
    }

    private static func logDibayBuildFingerprint() {
        let info = Bundle.main.infoDictionary ?? [:]
        let sha = (info["DibayGitSha"] as? String) ?? "missing"
        let config = (info["DibayBuildConfiguration"] as? String) ?? "missing"
        let ts = (info["DibayBuildTimestamp"] as? String) ?? "missing"
        let dirty = (info["DibayGitDirty"] as? String) ?? "missing"
        let version = (info["CFBundleShortVersionString"] as? String) ?? "?"
        let build = (info["CFBundleVersion"] as? String) ?? "?"
        NSLog("[DIBAY_BUILD] native_fingerprint gitSha=%@ config=%@ timestamp=%@ dirty=%@ version=%@ build=%@",
              sha, config, ts, dirty, version, build)
    }

}
