using System.Reflection;

internal static class UpdateDialogChecks
{
    public static void Run(Assembly desktop, Type mainType, Form owner)
    {
        var flags = BindingFlags.Instance | BindingFlags.NonPublic;
        mainType.GetField("_hostBusy", flags)!.SetValue(owner, false);
        var stateType = desktop.GetType("PdfMB.Desktop.Services.UpdateState")!;
        var resultType = desktop.GetType("PdfMB.Desktop.Services.UpdateResult")!;
        var result = Activator.CreateInstance(resultType, [Enum.Parse(stateType, "Available"),
            "È disponibile PDF MB 0.13.0 (versione installata: 0.12.1).", new Version(0, 13, 0),
            new Uri("https://github.com/bottalico75marco-maker/pdfMB/releases/tag/v0.13.0"),
            new Uri("https://github.com/bottalico75marco-maker/pdfMB/releases/download/v0.13.0/PDF-MB-0.13.0-win-x64.zip"),
            "# Novità\n\n- Correzioni e nuove funzioni.\n- Note di rilascio consultabili prima del download."])!;
        bool captured = false;
        using var timer = new System.Windows.Forms.Timer { Interval = 150 };
        timer.Tick += (_, _) =>
        {
            var dialog = Application.OpenForms.Cast<Form>().FirstOrDefault(form => form.Text == "Aggiornamento PDF MB");
            if (dialog is null) return;
            timer.Stop();
            try
            {
                var notes = dialog.Controls[0].Controls.OfType<TextBox>().Single();
                if (!notes.ReadOnly || !notes.Text.Contains("Novità")) throw new Exception("Update notes missing or editable");
                var buttons = dialog.Controls[0].Controls.OfType<FlowLayoutPanel>().Single().Controls.OfType<Button>().ToArray();
                if (buttons.Length != 3 || buttons.Any(button => button.Right > button.Parent!.ClientSize.Width))
                    throw new Exception("Update dialog actions are missing or clipped");
                using var preview = new Bitmap(dialog.Width, dialog.Height);
                dialog.DrawToBitmap(preview, new Rectangle(Point.Empty, preview.Size));
                preview.Save("artifacts/test/update-dialog.png", System.Drawing.Imaging.ImageFormat.Png);
                captured = true;
            }
            finally { dialog.Close(); }
        };
        timer.Start();
        mainType.GetMethod("ShowUpdate", flags)!.Invoke(owner, [result]);
        if (!captured) throw new Exception("Update dialog was not shown");
        Console.WriteLine("Update dialog: native version notice, read-only notes and download/release/later actions OK (no browser opened)");
    }
}
