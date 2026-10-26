namespace PdfMB.Desktop;

internal static class UnsavedChangesDialog
{
    private const int TextWidth = 440;

    public static DialogResult Show(IWin32Window owner, string fileName)
    {
        using var bold = new Font("Segoe UI", 10, FontStyle.Bold);
        using var dialog = new Form
        {
            Text = "Modifiche non salvate", StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog, MinimizeBox = false, MaximizeBox = false,
            ShowInTaskbar = false, Font = new Font("Segoe UI", 10),
            AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink
        };
        AppIcon.Apply(dialog);
        int width = dialog.LogicalToDeviceUnits(TextWidth);
        // The layout grows with the text and the DPI, so the name never pushes the buttons out of view.
        var layout = new TableLayoutPanel
        {
            AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, ColumnCount = 1, Padding = new Padding(18, 16, 18, 12)
        };
        var message = new Label
        {
            Text = "Salvare le modifiche prima di continuare?", AutoSize = true,
            MaximumSize = new Size(width, 0), Margin = new Padding(0, 0, 0, 6)
        };
        var name = new Label
        {
            Text = $"«{DialogText.FitFileName(fileName, bold, width - dialog.LogicalToDeviceUnits(20))}»", UseMnemonic = false,
            AutoSize = true, MaximumSize = new Size(width, 0), Font = bold, Margin = new Padding(0, 0, 0, 14)
        };
        var tips = new ToolTip();
        tips.SetToolTip(name, fileName);
        dialog.Disposed += (_, _) => tips.Dispose();
        var save = new Button { Text = "Salva", DialogResult = DialogResult.Yes };
        var discard = new Button { Text = "Non salvare", DialogResult = DialogResult.No };
        var cancel = new Button { Text = "Annulla", DialogResult = DialogResult.Cancel };
        var buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Anchor = AnchorStyles.Right, Margin = Padding.Empty, WrapContents = false
        };
        buttons.Controls.AddRange([cancel, discard, save]);
        layout.Controls.Add(message);
        layout.Controls.Add(name);
        layout.Controls.Add(buttons);
        layout.Controls.Add(new Panel { Size = new Size(width, 0), Margin = Padding.Empty });
        dialog.Controls.Add(layout);
        dialog.AcceptButton = save;
        dialog.CancelButton = cancel;
        CommandIcons.ConfigureDialog(dialog);
        return dialog.ShowDialog(owner);
    }
}
