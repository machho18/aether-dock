; 交互式安装模式下由卸载器清理应用配置、数据库与缓存。
!macro customUnInstall
  RMDir /r "$APPDATA\AetherDock"
!macroend
