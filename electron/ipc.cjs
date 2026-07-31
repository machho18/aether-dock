// 主进程与预加载层共享 IPC 通道，避免字符串分散后发生拼写漂移。
const ipcTongdao = Object.freeze({
  getSystemStatus: 'system:read-status',
  setIslandPassthrough: 'island:set-passthrough',
  completeStartup: 'island:startup-complete',
  selectLibraryRootdir: 'library:select-rootdir',
  getLibraryConfig: 'library:read-config',
  getCollapsedAnimation: 'settings:read-collapsed-animation',
  setCollapsedAnimation: 'settings:set-collapsed-animation',
  importLibraryContent: 'library:import',
  tongbuDesktopApplications: 'applications:sync-desktop',
  getLibraryItems: 'library:read-items',
  getApplicationIcons: 'library:read-application-icons',
  openLibraryItem: 'library:open-item',
  locateLibraryItem: 'library:locate-item',
  deleteLibraryItem: 'library:delete-item',
})

module.exports = { ipcTongdao }
