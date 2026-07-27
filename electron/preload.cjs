const { contextBridge, ipcRenderer } = require('electron')

// 向渲染进程暴露受控接口
contextBridge.exposeInMainWorld('aetherDock', {
  getBanben: () => ipcRenderer.invoke('yingyong:get-banben'),
  setLingdongChuantou: (shifouChuantou) => ipcRenderer.invoke('lingdongdao:set-chuantou', shifouChuantou),
})
