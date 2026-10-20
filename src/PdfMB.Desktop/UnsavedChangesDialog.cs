namespace PdfMB.Desktop;

internal static class UnsavedChangesDialog
{
    public static DialogResult Show(IWin32Window owner, string fileName)
    {
        using var dialog = new Form
        {
            Text = "Modifiche non salvate", StartPosition = FormStartPosition.CenterParent,
            FormBorderStyle = FormBorderStyle.FixedDialog, MinimizeBox = false, MaximizeBox = false,
            ShowInTaskbar = false, ClientSize = new Size(500, 155), Font = new Font("Segoe UI", 10)
        };
        var message = new Label
        {
            Text = $"Salvare le modifiche a «{fileName}» prima di continuare?",
            AutoEllipsis = true, Location = new Point(20, 20), Size = new Size(460, 65)
        };
        var save = new Button { Text = "Salva", DialogResult = DialogResult.Yes, Size = new Size(100, 34) };
        var discard = new Button { Text = "Non salvare", DialogResult = DialogResult.No, Size = new Size(120, 34) };
        var cancel = new Button { Text = "Annulla", DialogResult = DialogResult.Cancel, Size = new Size(100, 34) };
        var buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft, Location = new Point(15, 100), Size = new Size(470, 45)
        };
        buttons.Controls.AddRange([cancel, discard, save]);
        dialog.Controls.AddRange([message, buttons]);
        dialog.AcceptButton = save;
        dialog.CancelButton = cancel;
        return dialog.ShowDialog(owner);
    }
}
