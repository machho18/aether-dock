const { contextBridge, ipcRenderer, webUtils } = require('electron')

// 沙箱预加载脚本不能引入本地模块，通道表需在隔离层内直接声明。
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
  setIslandPassthrough: (isPassthrough) => ipcRenderer.invoke(ipcTongdao.setIslandPassthrough, isPassthrough),
  completeStartup: () => ipcRenderer.invoke(ipcTongdao.completeStartup),
  selectLibraryRootdir: () => ipcRenderer.invoke(ipcTongdao.selectLibraryRootdir),
  getLibraryConfig: () => ipcRenderer.invoke(ipcTongdao.getLibraryConfig),
  getCollapsedAnimation: () => ipcRenderer.invoke(ipcTongdao.getCollapsedAnimation),
  setCollapsedAnimation: (animation) => ipcRenderer.invoke(ipcTongdao.setCollapsedAnimation, animation),
  importDragContent: ({ url }) => {
    const file = lastDragFiles
    lastDragFiles = []
    return ipcRenderer.invoke(ipcTongdao.importLibraryContent, {
      file,
      url: Array.from(url ?? []).filter((dangqianWangzhi) => typeof dangqianWangzhi === 'string'),
    })
  },
  tongbuDesktopApplications: () => ipcRenderer.invoke(ipcTongdao.tongbuDesktopApplications),
  getLibraryItems: () => ipcRenderer.invoke(ipcTongdao.getLibraryItems),
  getApplicationIcons: (itemIds) => ipcRenderer.invoke(ipcTongdao.getApplicationIcons, itemIds),
  openLibraryItem: (itemId) => ipcRenderer.invoke(ipcTongdao.openLibraryItem, itemId),
  locateLibraryItem: (itemId) => ipcRenderer.invoke(ipcTongdao.locateLibraryItem, itemId),
  deleteLibraryItem: (itemId) => ipcRenderer.invoke(ipcTongdao.deleteLibraryItem, itemId),
})
