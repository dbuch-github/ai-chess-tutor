!macro customInstall
  ; Reuse the Windows setup entry point. It downloads Microsoft's signed runtime
  ; directly only if needed, verifies its pinned hash and handles UAC itself.
  ; Use native PowerShell so registry and executable paths are consistent on x64.
  ${DisableX64FSRedirection}
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\windows-runtime\setup-windows.ps1" -RuntimeOnly'
  Pop $0
  ${EnableX64FSRedirection}
  ${If} $0 == 3010
    SetRebootFlag true
  ${ElseIf} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Microsoft Visual C++ Runtime installation failed. Maia requires this component. Check your internet connection and allow the Windows administrator prompt, then rerun Setup." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
!macroend
