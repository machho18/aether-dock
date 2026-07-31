const { contextBridge, ipcRenderer, webUtils } = require('electron')

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
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getSystemStatus: () => ipcRenderer.invoke('system:read-status'),
  setIslandPassthrough: (isPassthrough) => ipcRenderer.invoke('island:set-passthrough', isPassthrough),
  locateToTop: () => ipcRenderer.invoke('island:locate-top'),
  completeStartup: () => ipcRenderer.invoke('island:startup-complete'),
  selectLibraryRootdir: () => ipcRenderer.invoke('library:select-rootdir'),
  getLibraryConfig: () => ipcRenderer.invoke('library:read-config'),
  getCollapsedAnimation: () => ipcRenderer.invoke('settings:read-collapsed-animation'),
  setCollapsedAnimation: (animation) => ipcRenderer.invoke('settings:set-collapsed-animation', animation),
  importDragContent: ({ url }) => {
    const file = lastDragFiles
    lastDragFiles = []
    return ipcRenderer.invoke('library:import', {
      file,
      url: Array.from(url ?? []).filter((dangqianWangzhi) => typeof dangqianWangzhi === 'string'),
    })
  },
  getLibraryItems: () => ipcRenderer.invoke('library:read-items'),
  openLibraryItem: (itemId) => ipcRenderer.invoke('library:open-item', itemId),
  locateLibraryItem: (itemId) => ipcRenderer.invoke('library:locate-item', itemId),
  deleteLibraryItem: (itemId) => ipcRenderer.invoke('library:delete-item', itemId),
})
