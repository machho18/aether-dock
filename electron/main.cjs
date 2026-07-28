const { app, BrowserWindow, ipcMain, screen } = require('electron')
const os = require('node:os')
const path = require('node:path')

// 持有主窗口引用，避免被垃圾回收后自动关闭
let zhuChuangkou = null
let kaijiChuangkou = null
let shangciCpuTongji = null
const chicunChuangkou = { width: 860, height: 560 }
const chicunKaiJi = { width: 360, height: 360 }

// 根据开机阶段将透明窗口定位到屏幕中央或顶部
function dingweChuangkou(shifouJuzhong) {
  if (!zhuChuangkou || zhuChuangkou.isDestroyed()) return
  const gongzuoqu = screen.getPrimaryDisplay().workArea
  const zuobiaoX = Math.round(gongzuoqu.x + (gongzuoqu.width - chicunChuangkou.width) / 2)
  const zuobiaoY = shifouJuzhong
    ? Math.round(gongzuoqu.y + (gongzuoqu.height - chicunChuangkou.height) / 2)
    : gongzuoqu.y
  zhuChuangkou.setPosition(zuobiaoX, zuobiaoY)
}

// 根据窗口角色加载相同渲染页面，开机窗口仅展示加载动画
function jiazaiRanyechuangkou(chuangkou, shifouKaiJi) {
  if (process.env.VITE_DEV_SERVER_URL) {
    const dizhi = new URL(process.env.VITE_DEV_SERVER_URL)
    dizhi.searchParams.set('startup', shifouKaiJi ? '1' : '0')
    chuangkou.loadURL(dizhi.toString())
    return
  }
  chuangkou.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
    query: { startup: shifouKaiJi ? '1' : '0' },
  })
}

// 计算两次采样间的 CPU 使用率
function duquCpuShiyonglv() {
  const dangqianCpuTongji = os.cpus().reduce((zongji, cpu) => {
    const shijian = cpu.times
    zongji.kongxian += shijian.idle
    zongji.zongji += Object.values(shijian).reduce((zonghe, shijianzhi) => zonghe + shijianzhi, 0)
    return zongji
  }, { kongxian: 0, zongji: 0 })

  const zongjiCha = shangciCpuTongji ? dangqianCpuTongji.zongji - shangciCpuTongji.zongji : 0
  const shiyonglv = zongjiCha > 0
    ? Math.round((1 - (dangqianCpuTongji.kongxian - shangciCpuTongji.kongxian) / zongjiCha) * 100)
    : 0
  shangciCpuTongji = dangqianCpuTongji
  return Math.max(0, Math.min(100, shiyonglv))
}

// 读取供收起态展示的轻量系统状态
function duquXitongZhuangtai() {
  const zongNeicun = os.totalmem()
  return {
    cpu: duquCpuShiyonglv(),
    neicun: Math.round((1 - os.freemem() / zongNeicun) * 100),
  }
}

// 创建应用主窗口
function chuangjianZhuChuangkou() {
  zhuChuangkou = new BrowserWindow({
    width: chicunChuangkou.width,
    height: chicunChuangkou.height,
    minWidth: chicunChuangkou.width,
    minHeight: chicunChuangkou.height,
    maxWidth: chicunChuangkou.width,
    maxHeight: chicunChuangkou.height,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 主灵动岛始终预加载在桌面顶部，等待开机动画结束后再显示
  dingweChuangkou(false)
  zhuChuangkou.once('ready-to-show', () => {
    // 透明窗口就绪后再次锁定内容尺寸，避免沿用旧窗口边界
    zhuChuangkou.setContentSize(chicunChuangkou.width, chicunChuangkou.height)
    dingweChuangkou(false)
    // 保持灵动岛位于普通应用窗口之上
    zhuChuangkou.setAlwaysOnTop(true, 'screen-saver')
    // 透明安全区默认鼠标穿透，仅灵动岛本体接收交互
    zhuChuangkou.setIgnoreMouseEvents(true, { forward: true })
  })

  jiazaiRanyechuangkou(zhuChuangkou, false)
  zhuChuangkou.on('closed', () => {
    zhuChuangkou = null
  })
}

// 创建独立开机窗口，避免重定位主灵动岛造成平移与卡顿
function chuangjianKaiJiChuangkou() {
  kaijiChuangkou = new BrowserWindow({
    width: chicunKaiJi.width,
    height: chicunKaiJi.height,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    resizable: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const gongzuoqu = screen.getPrimaryDisplay().workArea
  kaijiChuangkou.setPosition(
    Math.round(gongzuoqu.x + (gongzuoqu.width - chicunKaiJi.width) / 2),
    Math.round(gongzuoqu.y + (gongzuoqu.height - chicunKaiJi.height) / 2),
  )
  kaijiChuangkou.once('ready-to-show', () => {
    kaijiChuangkou?.setAlwaysOnTop(true, 'screen-saver')
    kaijiChuangkou?.setIgnoreMouseEvents(true, { forward: true })
    kaijiChuangkou?.showInactive()
  })
  jiazaiRanyechuangkou(kaijiChuangkou, true)
  kaijiChuangkou.on('closed', () => {
    kaijiChuangkou = null
  })
}

app.whenReady().then(() => {
  // 提供最小化的应用信息接口
  ipcMain.handle('yingyong:get-banben', () => app.getVersion())
  ipcMain.handle('xitong:duqu-zhuangtai', () => duquXitongZhuangtai())
  ipcMain.handle('lingdongdao:set-chuantou', (_, shifouChuantou) => {
    if (!zhuChuangkou || zhuChuangkou.isDestroyed()) return
    zhuChuangkou.setIgnoreMouseEvents(Boolean(shifouChuantou), { forward: Boolean(shifouChuantou) })
  })
  // 开机动画结束后将灵动岛回归桌面顶部
  ipcMain.handle('lingdongdao:dingwei-dingbu', () => dingweChuangkou(false))
  // 开机窗口完成后直接显示已预加载的顶部灵动岛
  ipcMain.handle('lingdongdao:kaiji-wancheng', () => {
    if (kaijiChuangkou && !kaijiChuangkou.isDestroyed()) kaijiChuangkou.close()
    if (!zhuChuangkou || zhuChuangkou.isDestroyed()) return
    dingweChuangkou(false)
    zhuChuangkou.setIgnoreMouseEvents(true, { forward: true })
    zhuChuangkou.showInactive()
  })
  chuangjianZhuChuangkou()
  chuangjianKaiJiChuangkou()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      chuangjianZhuChuangkou()
      chuangjianKaiJiChuangkou()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
