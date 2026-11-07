using Microsoft.UI.Xaml;

namespace DibayDesktop;

/// <summary>
/// W0: 창 1개만 연다. 프로토콜 활성화(dibay:// 로그인 복귀)는 W2, 알림(WNS)은 W3 에서 추가한다.
/// </summary>
public partial class App : Application
{
    private MainWindow? _window;

    public App()
    {
        InitializeComponent();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();
    }
}
