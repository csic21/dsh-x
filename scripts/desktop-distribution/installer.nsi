Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
Name "DSH-X"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\DSH-X"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "DSH-X requires Windows x64."
    Abort
  ${EndIf}
FunctionEnd

Function .onVerifyInstDir
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "DSH-X"
    Abort
  ${EndIf}
FunctionEnd

Section "DSH-X"
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "DSH-X"
    MessageBox MB_ICONSTOP "The installation directory must end with DSH-X."
    Abort
  ${EndIf}
  IfFileExists "$INSTDIR\*.*" 0 empty
  IfFileExists "$INSTDIR\.dsh-x-install-root" empty 0
  MessageBox MB_ICONSTOP "This directory contains other files. Choose a new DSH-X directory."
  Abort
empty:
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "${SOURCE}\check-running.ps1"
  nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\check-running.ps1" -InstallRoot "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != "0"
    MessageBox MB_ICONSTOP "Please fully quit DSH-X before installing. No process was stopped."
    Abort
  ${EndIf}
  SetOutPath "$INSTDIR"
  File /r "${SOURCE}\*"
  FileOpen $0 "$INSTDIR\.dsh-x-install-root" w
  FileWrite $0 "DSH-X"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\DSH-X"
  CreateShortcut "$SMPROGRAMS\DSH-X\DSH-X.lnk" "$INSTDIR\DSH-X.exe"
  CreateShortcut "$DESKTOP\DSH-X.lnk" "$INSTDIR\DSH-X.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DSH-X" "DisplayName" "DSH-X"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DSH-X" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DSH-X" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DSH-X" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DSH-X" "NoRepair" 1
SectionEnd

Function .onInstSuccess
  IfSilent done
  Exec '"$INSTDIR\DSH-X.exe"'
done:
FunctionEnd

Section "Uninstall"
  IfFileExists "$INSTDIR\.dsh-x-install-root" 0 refuse
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "${SOURCE}\check-running.ps1"
  nsExec::ExecToStack 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\check-running.ps1" -InstallRoot "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != "0"
    MessageBox MB_ICONSTOP "Please fully quit DSH-X before uninstalling."
    Abort
  ${EndIf}
  RMDir /r "$INSTDIR\runtime"
  RMDir /r "$INSTDIR\packs"
  Delete "$INSTDIR\DSH-X.exe"
  Delete "$INSTDIR\bootstrap.mjs"
  Delete "$INSTDIR\distribution.json"
  Delete "$INSTDIR\dialog.ps1"
  Delete "$INSTDIR\check-running.ps1"
  Delete "$INSTDIR\INSTALL.txt"
  Delete "$INSTDIR\.dsh-x-install-root"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$DESKTOP\DSH-X.lnk"
  Delete "$SMPROGRAMS\DSH-X\DSH-X.lnk"
  RMDir "$SMPROGRAMS\DSH-X"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DSH-X"
  SetOutPath "$TEMP"
  RMDir "$INSTDIR"
  Goto done
refuse:
  MessageBox MB_ICONSTOP "Installation ownership marker is missing. Refusing removal."
done:
SectionEnd
