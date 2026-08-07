; 自动更新保留用户数据；手动卸载由用户明确选择是否清理应用数据。
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 "是否同时清除 AetherDock 的应用设置、索引数据库与缓存？$\r$\n$\r$\n资料库文件和原始资料不会被删除。" IDYES qingliYonghuShuju IDNO baoliuYonghuShuju
    qingliYonghuShuju:
      RMDir /r "$APPDATA\aether-dock"
    baoliuYonghuShuju:
  ${endIf}
!macroend
