using Microsoft.Win32;
using PdfMB.Desktop.Services;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        static void Check(bool success, string message) { if (!success) throw new Exception(message); }
        // Check the real native layout without showing/starting the application.
        var desktop = System.Reflection.Assembly.Load("PdfMB.Desktop");
        var mainType = desktop.GetType("PdfMB.Desktop.MainForm")!;
        var emailType = desktop.GetType("PdfMB.Desktop.Services.FormEmail")!;
        var draftMethod = emailType.GetMethod("DraftContent", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        byte[] attachment = System.Text.Encoding.ASCII.GetBytes("%PDF-1.7\ncompilato-test");
        var draft = (string)draftMethod.Invoke(null, [attachment, "test@example.com"])!;
        Check(draft.Contains("X-Unsent: 1\r\nTo: test@example.com") && draft.Contains("Content-Disposition: attachment; filename=modulo.pdf") && draft.Contains(Convert.ToBase64String(attachment)), "Email draft loses its recipient or exact PDF attachment");
        var passwordType = desktop.GetType("PdfMB.Desktop.PasswordDialog")!;
        using (var passwordDialog = (Form)Activator.CreateInstance(passwordType, [true, null])!)
        {
            Check(passwordDialog.Controls[0].Controls.OfType<TextBox>().Count(box => box.UseSystemPasswordChar) == 2, "Password confirmation is missing or unmasked");
            Check(passwordDialog.AcceptButton is not null && passwordDialog.CancelButton is not null, "Password dialog keyboard actions missing");
            passwordDialog.PerformLayout();
        }
        Console.WriteLine("Password dialog and MIME email draft: masked confirmation, recipient and exact PDF attachment OK (no mail client opened)");
        using (var window = (Form)Activator.CreateInstance(mainType, [Array.Empty<string>()])!)
        {
            Check(window.Icon is not null, "Application window icon missing");
            using (var icon = new Icon(window.Icon!, new Size(32, 32)))
            using (var image = icon.ToBitmap())
            {
                Check(image.GetPixel(0, 0).A == 0, "Application icon lost its transparent border");
                Check(Enumerable.Range(0, image.Width).Any(x => Enumerable.Range(0, image.Height).Any(y =>
                {
                    var color = image.GetPixel(x, y);
                    return color.A > 200 && color.B > 150 && color.B > color.R * 1.5 && color.G > color.R;
                })), "Window does not use the blue biscione icon");
                Directory.CreateDirectory("artifacts/test");
                image.Save("artifacts/test/app-icon-32.png", System.Drawing.Imaging.ImageFormat.Png);
                Console.WriteLine("Application icon: embedded biscione, blue artwork and transparent border OK");
            }
            window.ClientSize = new Size(960, 600);
            window.PerformLayout();
            var flags = System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic;
            var toolbar = (ToolStrip)mainType.GetField("_mainToolbar", flags)!.GetValue(window)!;
            var modules = (ToolStripButton)mainType.GetField("_forms", flags)!.GetValue(window)!;
            var protect = (ToolStripButton)mainType.GetField("_protect", flags)!.GetValue(window)!;
            toolbar.PerformLayout();
            Check(protect.Placement == ToolStripItemPlacement.Main && protect.Image is not null && protect.ToolTipText?.Contains("password") == true, "Password command is not visible in the main toolbar");
            var save = (ToolStripButton)mainType.GetField("_save", flags)!.GetValue(window)!;
            Check(toolbar.Items.IndexOf(protect) == toolbar.Items.IndexOf(save) + 1, "Main toolbar password command is not next to Save");
            var protectionMenu = (ToolStripMenuItem)mainType.GetField("_protectMenu", flags)!.GetValue(window)!;
            var readState = mainType.GetMethod("ReadEditorState", flags)!;
            var closedLock = protect.Image;
            foreach (bool passwordProtected in new[] { true, false })
            {
                var state = System.Text.Json.JsonSerializer.SerializeToElement(new
                {
                    token = "password-toggle-test", dirty = true, readOnly = false, canEdit = true, canText = true,
                    passwordProtected, textEditing = false, textMode = false, highlightMode = false,
                    canUndo = false, canRedo = false, busy = false, editorOpen = false, blockedReason = ""
                });
                readState.Invoke(window, [state, true]);
                string action = passwordProtected ? "Rimuovi password" : "Proteggi con password";
                Check(protect.AccessibleName == action && protect.ToolTipText == action && protectionMenu.AccessibleName == action,
                    "Password action does not follow the document security state");
                Check((protect.Image != closedLock) == passwordProtected && protectionMenu.Image == protect.Image,
                    "Toolbar and menu do not switch between closed and open padlocks");
            }
            Console.WriteLine("Password command: document state switches open/closed padlock, removal action, tooltip and Tools menu OK");
            Check(modules.Placement == ToolStripItemPlacement.Main && modules.Bounds.Right <= toolbar.Width,
                "Module command overflows at minimum window width");
            Check(modules.Text == "Progetta modulo" && modules.DisplayStyle == ToolStripItemDisplayStyle.Image && modules.Image is not null && modules.ToolTipText?.Contains("Progetta modulo") == true,
                "Module command has no icon, accessible name or tooltip");
            Check(toolbar.Items.Cast<ToolStripItem>().Where(item => item is ToolStripButton or ToolStripDropDownButton).All(item => item.Image is not null && item.DisplayStyle == ToolStripItemDisplayStyle.Image && !string.IsNullOrEmpty(item.AccessibleName)), "A native command has no accessible icon");
            Check(toolbar.ShowItemToolTips && toolbar.Items.Cast<ToolStripItem>().Where(item => item is ToolStripButton or ToolStripDropDownButton).All(item => !string.IsNullOrWhiteSpace(item.ToolTipText)), "An icon command has no explicit tooltip");
            var manage = (ToolStripButton)mainType.GetField("_manage", flags)!.GetValue(window)!;
            var tools = (ToolStripDropDownButton)mainType.GetField("_tools", flags)!.GetValue(window)!;
            Check(tools.DropDownItems.OfType<ToolStripMenuItem>().Any(item => Equals(item.Tag, "image") && item.Image is not null), "Static image command missing from Tools");
            Check(manage.ToolTipText?.Contains("Gestisci pagine") == true, "Page management tooltip is missing");
            var text = (ToolStripButton)mainType.GetField("_text", flags)!.GetValue(window)!;
            var highlight = (ToolStripButton)mainType.GetField("_highlight", flags)!.GetValue(window)!;
            Check(toolbar.Items.IndexOf(modules) == toolbar.Items.IndexOf(text) + 1 && toolbar.Items.IndexOf(highlight) == toolbar.Items.IndexOf(modules) + 1,
                "Module command is not between Text and Highlight");
            Check(window.MainMenuStrip is null && window.Controls.OfType<ToolStrip>().Count(strip => strip.Dock == DockStyle.Top) == 1 && toolbar.Top == 0,
                "Extra command/header rows remain above the toolbar");
            Check(!window.Controls.OfType<Panel>().Any(panel => panel.Dock == DockStyle.Top), "Document header row remains");
            Directory.CreateDirectory("artifacts/test");
            using var preview = new Bitmap(toolbar.Width, toolbar.Height);
            toolbar.DrawToBitmap(preview, new Rectangle(Point.Empty, preview.Size));
            preview.Save("artifacts/test/native-toolbar.png", System.Drawing.Imaging.ImageFormat.Png);
            Console.WriteLine("Native toolbar at 960px: one top row, Progetta modulo between Text and Highlight, all commands have accessible icons");
        }
        var blankType = desktop.GetType("PdfMB.Desktop.BlankPageDialog")!;
        using (var blank = (Form)Activator.CreateInstance(blankType, [true, 5, 2])!)
        {
            Check(Equals(blankType.GetProperty("Position")!.GetValue(blank), 3), "Blank page default position is not after the current page");
            Check(Equals(blankType.GetProperty("PaperFormat")!.GetValue(blank), "A4"), "Blank page has no A4 default");
            blank.Controls.OfType<ComboBox>().Single().SelectedIndex = 2;
            Check(Equals(blankType.GetProperty("PaperFormat")!.GetValue(blank), "A3"), "A3 selection not passed to the document");
            var actions = blank.Controls.OfType<FlowLayoutPanel>().Single().Controls.OfType<Button>().ToArray();
            Check(actions.All(button => button.Text == "" && button.Image is not null && button.Image.Height <= button.Height && !string.IsNullOrEmpty(button.AccessibleName)), "Dialog icon is missing, clipped or unnamed");
            blank.StartPosition = FormStartPosition.Manual;
            blank.Location = new Point(-10000, -10000);
            blank.Opacity = 0;
            blank.Show(); // Only this isolated, invisible dialog; never start MainForm.
            using var preview = new Bitmap(blank.Width, blank.Height);
            blank.DrawToBitmap(preview, new Rectangle(Point.Empty, preview.Size));
            preview.Save("artifacts/test/blank-page-dialog.png", System.Drawing.Imaging.ImageFormat.Png);
            Console.WriteLine("Blank page dialog: format, position and accessible icon buttons OK");
        }
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
