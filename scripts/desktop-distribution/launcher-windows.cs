using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
class Launcher {
  [STAThread] static int Main() {
    try {
      string root = AppDomain.CurrentDomain.BaseDirectory;
      string node = Path.Combine(root, "runtime", "resources", "runtime", "primary-runtime", "dependencies", "node", "bin", "node.exe");
      var start = new ProcessStartInfo(node, "\"" + Path.Combine(root, "bootstrap.mjs") + "\"");
      start.WorkingDirectory = root;
      start.UseShellExecute = false;
      start.CreateNoWindow = true;
      using (var process = Process.Start(start)) { process.WaitForExit(); return process.ExitCode; }
    } catch (Exception error) { MessageBox.Show(error.Message, "DSH-X", MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
  }
}
