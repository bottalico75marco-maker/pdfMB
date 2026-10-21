namespace PdfMB.Desktop;

internal static class AppIcon
{
    public static void Apply(Form window)
    {
        using var stream = typeof(AppIcon).Assembly.GetManifestResourceStream("PdfMB.Desktop.AppIcon.ico")
            ?? throw new InvalidOperationException("Icona dell'applicazione mancante.");
        using var source = new Icon(stream);
        var icon = (Icon)source.Clone();
        window.Icon = icon;
        window.Disposed += (_, _) => icon.Dispose();
    }
}
