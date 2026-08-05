; 卸载前明确保留用户资料库文件，避免用户误以为原始资料会被删除。
!macro customUnInstall
  MessageBox MB_ICONINFORMATION|MB_OK "AetherDock 即将卸载。$\r$\n$\r$\n资料库中的文件和原始资料不会被删除。$\r$\n$\r$\n应用设置、索引数据库与缓存将被清理。"
  RMDir /r "$APPDATA\AetherDock"
!macroend
