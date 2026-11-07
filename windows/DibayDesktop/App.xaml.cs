using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using Windows.ApplicationModel.Activation;

namespace DibayDesktop;

/// <summary>
/// W0: 창 1개. W2: 프로토콜 활성화(dibay://auth/callback 로그인 복귀)를 창에 넘긴다.
/// 알림(WNS)은 W3 에서 추가한다.
/// </summary>
public partial class App : Application
{
    private static MainWindow? _window;
    private static DispatcherQueue? _uiQueue;

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
    {
        _uiQueue = DispatcherQueue.GetForCurrentThread();
        _window = new MainWindow();
        _window.Activate();
        // 앱이 꺼진 상태에서 dibay:// 로 켜진 경우(콜드 스타트)
        HandleActivation(AppInstance.GetCurrent().GetActivatedEventArgs());
    }

    /// <summary>Program.cs — 두 번째 실행이 넘겨 준 활성화(백그라운드 스레드에서 호출됨).</summary>
    public static void OnRedirectedActivation(object? sender, AppActivationArguments args)
    {
        _uiQueue?.TryEnqueue(() =>
        {
            HandleActivation(args);
            _window?.BringToFront();
        });
    }

    private static void HandleActivation(AppActivationArguments args)
    {
        if (args.Kind != ExtendedActivationKind.Protocol) return;
        if (args.Data is not IProtocolActivatedEventArgs protocolArgs) return;
        var uri = protocolArgs.Uri;
        if (uri is null || !AppConfig.IsAuthReturnUri(uri)) return;
        _window?.ReceiveAuthReturn(uri.OriginalString);
    }
}
