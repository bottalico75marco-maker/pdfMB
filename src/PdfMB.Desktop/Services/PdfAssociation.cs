using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace PdfMB.Desktop.Services;

internal static class PdfAssociation
{
    private const string AppName = "PDF MB";
    private const string ProgId = "PdfMB.Document";
    private const string CapabilitiesPath = @"Software\PdfMB\Capabilities";

    public static void Register()
    {
        Register(Registry.CurrentUser, Path.Combine(AppContext.BaseDirectory, "PdfMB.Desktop.exe"));
        SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
    }

    internal static void Register(RegistryKey root, string executable)
    {
        string path = Path.GetFullPath(executable);
        string command = $"\"{path}\" \"%1\"";
        string icon = $"\"{path}\",0";
        void Set(string key, string name, string value)
        {
            using var entry = root.CreateSubKey(key);
            entry.SetValue(name, value, RegistryValueKind.String);
        }
        Set($@"Software\Classes\{ProgId}", "", "Documento PDF");
        Set($@"Software\Classes\{ProgId}\DefaultIcon", "", icon);
        Set($@"Software\Classes\{ProgId}\shell\open\command", "", command);
        Set($@"Software\Classes\{ProgId}\Application", "ApplicationName", AppName);
        Set(@"Software\Classes\.pdf\OpenWithProgids", ProgId, "");
        string application = $@"Software\Classes\Applications\{Path.GetFileName(path)}";
        Set(application, "FriendlyAppName", AppName);
        Set(application + @"\SupportedTypes", ".pdf", "");
        Set(application + @"\shell\open\command", "", command);
        Set(CapabilitiesPath, "ApplicationName", AppName);
        Set(CapabilitiesPath, "ApplicationDescription", "Leggi e modifica documenti PDF con PDF MB.");
        Set(CapabilitiesPath, "ApplicationIcon", icon);
        Set(CapabilitiesPath + @"\FileAssociations", ".pdf", ProgId);
        Set(@"Software\RegisteredApplications", AppName, CapabilitiesPath);
    }

    public static void OpenDefaultSettings()
    {
        Register();
        // https://learn.microsoft.com/windows/uwp/launch-resume/launch-default-apps-settings
        Process.Start(new ProcessStartInfo("ms-settings:defaultapps?registeredAppUser=" + Uri.EscapeDataString(AppName))
        { UseShellExecute = true });
    }

    [DllImport("shell32.dll")]
    private static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2);
}
