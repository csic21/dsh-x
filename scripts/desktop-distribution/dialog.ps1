param([Parameter(Mandatory=$true)][string]$Message)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show($Message, 'DSH-X', 'OK', 'Information') | Out-Null
