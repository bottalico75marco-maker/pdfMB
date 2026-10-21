using Microsoft.Win32;
using PdfMB.Desktop.Services;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        static void Check(bool success, string message) { if (!success) throw new Exception(message); }
        string directory = Path.Combine(Path.GetTempPath(), "pdfmb-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        string pdf = Path.Combine(directory, "documento con spazi.PDF");
        string other = Path.Combine(directory, "documento.txt");
        File.WriteAllText(pdf, "%PDF-1.7"); File.WriteAllText(other, "test");
        DataObject Drop(params string[] paths) { var data = new DataObject(); data.SetData(DataFormats.FileDrop, paths); return data; }
        try
        {
            Check(PdfDropFiles.GetPath(Drop(pdf)) == pdf, "PDF drop failed");
            Check(PdfDropFiles.GetPath(Drop(other)) is null, "Non-PDF accepted");
            Check(PdfDropFiles.GetPath(Drop(pdf, other)) is null, "Multiple files accepted");
            Check(PdfDropFiles.GetPath(Drop(pdf + ".pdf")) is null, "Missing file accepted");
            Check(PdfDropFiles.GetPath(new DataObject(DataFormats.Text, pdf)) is null, "Plain path text accepted");
            Console.WriteLine("Windows file drops: PDF, spaces, uppercase extension and rejection cases OK");
        }
        finally { File.Delete(pdf); File.Delete(other); Directory.Delete(directory); }

        string stampDirectory = Path.Combine(Path.GetTempPath(), "pdfmb-stamps-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            using var bitmap = new Bitmap(200, 100, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            bitmap.SetPixel(150, 50, Color.FromArgb(128, 255, 0, 0));
            using var png = new MemoryStream(); bitmap.Save(png, System.Drawing.Imaging.ImageFormat.Png);
            var library = new StampLibrary(stampDirectory);
            string id = library.Import("Timbro personale", Convert.ToBase64String(png.ToArray()));
            var reloaded = new StampLibrary(stampDirectory).List();
            var data = System.Text.Json.JsonSerializer.SerializeToElement(reloaded);
            Check(data.GetArrayLength() == 1 && data[0].GetProperty("id").GetString() == id, "Personal stamp not persisted");
            using var restoredPng = new MemoryStream(Convert.FromBase64String(data[0].GetProperty("base64").GetString()!));
            using var restored = new Bitmap(restoredPng);
            Check(restored.GetPixel(10, 10).A == 0 && restored.GetPixel(150, 50).A == 128, "Stamp alpha was lost");
            Console.WriteLine("Personal stamp library: save, reload, transparent and semitransparent pixels OK");
        }
        finally
        {
            if (Directory.Exists(stampDirectory)) { foreach (string path in Directory.GetFiles(stampDirectory)) File.Delete(path); Directory.Delete(stampDirectory); }
        }

        string registryPath = @"Software\PdfMB.Tests\" + Guid.NewGuid().ToString("N");
        try
        {
            using var root = Registry.CurrentUser.CreateSubKey(registryPath);
            string executable = @"C:\Program Files\PDF MB\PdfMB.Desktop.exe";
            PdfAssociation.Register(root, executable);
            object? Value(string key, string name = "") { using var entry = root.OpenSubKey(key); return entry?.GetValue(name); }
            Check(Equals(Value(@"Software\Classes\PdfMB.Document\shell\open\command"), $"\"{executable}\" \"%1\""), "Unquoted launch command");
            Check(Equals(Value(@"Software\PdfMB\Capabilities\FileAssociations", ".pdf"), "PdfMB.Document"), "PDF association missing");
            Check(Equals(Value(@"Software\RegisteredApplications", "PDF MB"), @"Software\PdfMB\Capabilities"), "Registered app missing");
            Check(Value(@"Software\Classes\.pdf") is null, "Default overridden");
            Check(Value(@"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice", "ProgId") is null, "UserChoice overwritten");
            Console.WriteLine("Default app registration and quoted PDF launch: OK (isolated registry only)");
        }
        finally { Registry.CurrentUser.DeleteSubKeyTree(registryPath); }
    }
}
