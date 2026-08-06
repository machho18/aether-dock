const { contextBridge, ipcRenderer, webUtils } = require('electron')

// 沙箱预加载脚本不能引入本地模块，通道表需在隔离层内直接声明。
const ipcTongdao = Object.freeze({
  getSystemStatus: 'system:read-status',
  getAppInfo: 'app:read-info',
  checkAppUpdate: 'app:check-update',
  openAppRelease: 'app:open-release',
  appUpdateInfoChanged: 'app:update-info-changed',
  setAutoLaunch: 'app:set-auto-launch',
  setIslandPassthrough: 'island:set-passthrough',
  setFloatingMode: 'island:set-floating-mode',
  floatingWindowShown: 'floating:shown',
  moveFloatingIsland: 'island:move-floating',
  completeStartup: 'island:startup-complete',
  setHeavyTasksPaused: 'island:set-heavy-tasks-paused',
  selectLibraryRootdir: 'library:select-rootdir',
  getLibraryConfig: 'library:read-config',
  getCollapsedAnimation: 'settings:read-collapsed-animation',
  setCollapsedAnimation: 'settings:set-collapsed-animation',
  importLibraryContent: 'library:import',
  captureClipboardContent: 'library:capture-clipboard',
  tongbuDesktopApplications: 'applications:sync-desktop',
  getLibrarySummary: 'library:read-summary',
  libraryChanged: 'library:changed',
  getLibraryPage: 'library:read-page',
  searchLibrary: 'library:search',
  getApplicationIcons: 'library:read-application-icons',
  getWebsiteIcons: 'library:read-website-icons',
  getImageThumbnails: 'library:read-image-thumbnails',
  openLibraryItem: 'library:open-item',
  locateLibraryItem: 'library:locate-item',
  renameLibraryItem: 'library:rename-item',
  deleteLibraryItem: 'library:delete-item',
  shareLibraryItem: 'library:share-item',
})

// 在预加载隔离层直接读取原生 File，避免跨 Context Bridge 后丢失文件路径
function convertDragFile(file) {
  return Array.from(file ?? []).flatMap((currentFile) => {
    try {
      const path = webUtils.getPathForFile(currentFile)
      return path ? [{ path, name: currentFile.name, type: currentFile.type, size: currentFile.size }] : []
    } catch {
      return []
    }
  })
}

let lastDragFiles = []

// 捕获阶段先缓存外部拖放的原生文件，再由页面发起受控导入
window.addEventListener('drop', (event) => {
  lastDragFiles = convertDragFile(event.dataTransfer?.files)
}, true)

// 向渲染进程暴露受控接口
contextBridge.exposeInMainWorld('aetherDock', {
  getSystemStatus: () => ipcRenderer.invoke(ipcTongdao.getSystemStatus),
  getAppInfo: () => ipcRenderer.invoke(ipcTongdao.getAppInfo),
  checkAppUpdate: () => ipcRenderer.invoke(ipcTongdao.checkAppUpdate),
  openAppRelease: (url) => ipcRenderer.invoke(ipcTongdao.openAppRelease, url),
  onAppUpdateInfoChanged: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_, info) => callback(info)
    ipcRenderer.on(ipcTongdao.appUpdateInfoChanged, listener)
    return () => ipcRenderer.removeListener(ipcTongdao.appUpdateInfoChanged, listener)
  },
  setAutoLaunch: (enabled) => ipcRenderer.invoke(ipcTongdao.setAutoLaunch, enabled),
  setIslandPassthrough: (isPassthrough) => ipcRenderer.invoke(ipcTongdao.setIslandPassthrough, isPassthrough),
  setFloatingMode: (enabled) => ipcRenderer.invoke(ipcTongdao.setFloatingMode, enabled),
  onFloatingWindowShown: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = () => callback()
    ipcRenderer.on(ipcTongdao.floatingWindowShown, listener)
    return () => ipcRenderer.removeListener(ipcTongdao.floatingWindowShown, listener)
  },
  moveFloatingIsland: (position) => ipcRenderer.invoke(ipcTongdao.moveFloatingIsland, position),
  completeStartup: () => ipcRenderer.invoke(ipcTongdao.completeStartup),
  setHeavyTasksPaused: (paused) => ipcRenderer.invoke(ipcTongdao.setHeavyTasksPaused, paused),
  selectLibraryRootdir: (mode) => ipcRenderer.invoke(ipcTongdao.selectLibraryRootdir, mode),
  getLibraryConfig: () => ipcRenderer.invoke(ipcTongdao.getLibraryConfig),
  getCollapsedAnimation: () => ipcRenderer.invoke(ipcTongdao.getCollapsedAnimation),
  setCollapsedAnimation: (animation) => ipcRenderer.invoke(ipcTongdao.setCollapsedAnimation, animation),
  importDragContent: ({ url }) => {
    const file = lastDragFiles
    lastDragFiles = []
    return ipcRenderer.invoke(ipcTongdao.importLibraryContent, {
      file,
      url: Array.from(url ?? []).flatMap((resource) => {
        if (!resource || typeof resource !== 'object') return []
        const candidates = Array.from(resource.candidates ?? []).filter((candidate) => typeof candidate === 'string').slice(0, 8)
        if (!candidates.length) return []
        return [{
          sourceUrl: typeof resource.sourceUrl === 'string' ? resource.sourceUrl : candidates[0],
          referer: typeof resource.referer === 'string' ? resource.referer : '',
          candidates,
        }]
      }).slice(0, 20),
    })
  },
  captureClipboardContent: () => ipcRenderer.invoke(ipcTongdao.captureClipboardContent),
  tongbuDesktopApplications: () => ipcRenderer.invoke(ipcTongdao.tongbuDesktopApplications),
  getLibrarySummary: () => ipcRenderer.invoke(ipcTongdao.getLibrarySummary),
  onLibraryChanged: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = () => callback()
    ipcRenderer.on(ipcTongdao.libraryChanged, listener)
    return () => ipcRenderer.removeListener(ipcTongdao.libraryChanged, listener)
  },
  getLibraryPage: (options) => ipcRenderer.invoke(ipcTongdao.getLibraryPage, options),
  searchLibrary: (options) => ipcRenderer.invoke(ipcTongdao.searchLibrary, options),
  getApplicationIcons: (itemIds) => ipcRenderer.invoke(ipcTongdao.getApplicationIcons, itemIds),
  getWebsiteIcons: (itemIds) => ipcRenderer.invoke(ipcTongdao.getWebsiteIcons, itemIds),
  getImageThumbnails: (itemIds) => ipcRenderer.invoke(ipcTongdao.getImageThumbnails, itemIds),
  openLibraryItem: (itemId) => ipcRenderer.invoke(ipcTongdao.openLibraryItem, itemId),
  locateLibraryItem: (itemId) => ipcRenderer.invoke(ipcTongdao.locateLibraryItem, itemId),
  renameLibraryItem: (itemId, title) => ipcRenderer.invoke(ipcTongdao.renameLibraryItem, itemId, title),
  deleteLibraryItem: (itemId) => ipcRenderer.invoke(ipcTongdao.deleteLibraryItem, itemId),
  shareLibraryItem: (itemId) => ipcRenderer.invoke(ipcTongdao.shareLibraryItem, itemId),
})
