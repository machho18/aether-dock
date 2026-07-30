const { contextBridge, ipcRenderer, webUtils } = require('electron')

// 在预加载隔离层直接读取原生 File，避免跨 Context Bridge 后丢失文件路径
function zhuanHuanTuoruWenjian(wenjian) {
  return Array.from(wenjian ?? []).flatMap((dangqianWenjian) => {
    try {
      const lujing = webUtils.getPathForFile(dangqianWenjian)
      return lujing ? [{ lujing, name: dangqianWenjian.name, type: dangqianWenjian.type, size: dangqianWenjian.size }] : []
    } catch {
      return []
    }
  })
}

let zuihouTuoruWenjian = []

// 捕获阶段先缓存外部拖放的原生文件，再由页面发起受控导入
window.addEventListener('drop', (shijian) => {
  zuihouTuoruWenjian = zhuanHuanTuoruWenjian(shijian.dataTransfer?.files)
}, true)

// 向渲染进程暴露受控接口
contextBridge.exposeInMainWorld('aetherDock', {
  getBanben: () => ipcRenderer.invoke('yingyong:get-banben'),
  getXitongZhuangtai: () => ipcRenderer.invoke('xitong:duqu-zhuangtai'),
  setLingdongChuantou: (shifouChuantou) => ipcRenderer.invoke('lingdongdao:set-chuantou', shifouChuantou),
  dingweiDaoDingbu: () => ipcRenderer.invoke('lingdongdao:dingwei-dingbu'),
  wanchengKaiJi: () => ipcRenderer.invoke('lingdongdao:kaiji-wancheng'),
  xuanzeZiliaokuGenmulu: () => ipcRenderer.invoke('ziliaoku:xuanze-genmulu'),
  duquZiliaokuPeizhi: () => ipcRenderer.invoke('ziliaoku:duqu-peizhi'),
  duquShouqiDonghua: () => ipcRenderer.invoke('shezhi:duqu-shouqi-donghua'),
  sheZhiShouqiDonghua: (donghua) => ipcRenderer.invoke('shezhi:shezhi-shouqi-donghua', donghua),
  yinruTuoruNeirong: ({ wangzhi }) => {
    const wenjian = zuihouTuoruWenjian
    zuihouTuoruWenjian = []
    return ipcRenderer.invoke('ziliaoku:yinru', {
      wenjian,
      wangzhi: Array.from(wangzhi ?? []).filter((dangqianWangzhi) => typeof dangqianWangzhi === 'string'),
    })
  },
  duquZiliaokuTiaomu: () => ipcRenderer.invoke('ziliaoku:duqu-tiaomu'),
  dakaiZiliaokuTiaomu: (tiaomuId) => ipcRenderer.invoke('ziliaoku:dakai-tiaomu', tiaomuId),
  dingweZiliaokuTiaomu: (tiaomuId) => ipcRenderer.invoke('ziliaoku:dingwei-tiaomu', tiaomuId),
  shanchuZiliaokuTiaomu: (tiaomuId) => ipcRenderer.invoke('ziliaoku:shanchu-tiaomu', tiaomuId),
})
