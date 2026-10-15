Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = Chr(34) & scriptDir & "\START_AQUAGUARD.bat" & Chr(34)
WshShell.Run batPath, 0, False
Set WshShell = Nothing
Set fso = Nothing

