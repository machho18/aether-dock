const { contextBridge, ipcRenderer } = require('electron')

// 向渲染进程暴露受控接口
contextBridge.exposeInMainWorld('aetherDock', {
  getBanben: () => ipcRenderer.invoke('yingyong:get-banben'),
  getXitongZhuangtai: () => ipcRenderer.invoke('xitong:duqu-zhuangtai'),
  setLingdongChuantou: (shifouChuantou) => ipcRenderer.invoke('lingdongdao:set-chuantou', shifouChuantou),
  dingweiDaoDingbu: () => ipcRenderer.invoke('lingdongdao:dingwei-dingbu'),
  wanchengKaiJi: () => ipcRenderer.invoke('lingdongdao:kaiji-wancheng'),
})
