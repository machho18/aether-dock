const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('node:path')

// 持有主窗口引用，避免被垃圾回收后自动关闭
let zhuChuangkou = null
const chicunChuangkou = { width: 660, height: 400 }

// 创建应用主窗口
function chuangjianZhuChuangkou() {
  zhuChuangkou = new BrowserWindow({
    width: chicunChuangkou.width,
    height: chicunChuangkou.height,
    minWidth: chicunChuangkou.width,
    minHeight: chicunChuangkou.height,
    maxWidth: chicunChuangkou.width,
    maxHeight: chicunChuangkou.height,
    show: true,
    frame: false,
    transparent: true,
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

  // 启动时固定在主屏工作区域顶部居中
  const gongzuoqu = screen.getPrimaryDisplay().workArea
  zhuChuangkou.setPosition(
    Math.round(gongzuoqu.x + (gongzuoqu.width - chicunChuangkou.width) / 2),
    gongzuoqu.y,
  )
  zhuChuangkou.once('ready-to-show', () => {
    zhuChuangkou.show()
    zhuChuangkou.focus()
    // 保持灵动岛位于普通应用窗口之上
    zhuChuangkou.setAlwaysOnTop(true, 'screen-saver')
    // 透明安全区默认鼠标穿透，仅灵动岛本体接收交互
    zhuChuangkou.setIgnoreMouseEvents(true, { forward: true })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    zhuChuangkou.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    zhuChuangkou.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // 页面加载结束后再次确保窗口处于可见状态
  zhuChuangkou.webContents.once('did-finish-load', () => zhuChuangkou.show())
  zhuChuangkou.on('closed', () => {
    zhuChuangkou = null
  })
}

app.whenReady().then(() => {
  // 提供最小化的应用信息接口
  ipcMain.handle('yingyong:get-banben', () => app.getVersion())
  ipcMain.handle('lingdongdao:set-chuantou', (_, shifouChuantou) => {
    if (!zhuChuangkou || zhuChuangkou.isDestroyed()) return
    zhuChuangkou.setIgnoreMouseEvents(Boolean(shifouChuantou), { forward: Boolean(shifouChuantou) })
  })
  chuangjianZhuChuangkou()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) chuangjianZhuChuangkou()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
