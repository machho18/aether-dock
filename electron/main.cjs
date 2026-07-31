const { app, BrowserWindow, dialog, ipcMain, protocol, screen, shell } = require('electron')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')
const { createLibrary } = require('./ziliaoku.cjs')
const { ipcTongdao } = require('./ipc.cjs')

// 图片扩展名到 MIME 的映射，用于无 mimeType 时的回退推断
const imageMime = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml', '.avif': 'image/avif',
}

// 持有主窗口引用，避免被垃圾回收后自动关闭
let mainWindow = null
let startupWindow = null
let lastCpuStat = null
let library = null
const mainWindowSize = { width: 860, height: 560 }
const startupWindowSize = { width: 360, height: 360 }

// 两类透明窗口共享安全的浏览器配置，仅尺寸与生命周期不同。
function createWindowOptions(size) {
  return {
    ...size,
    minWidth: size.width,
    minHeight: size.height,
    maxWidth: size.width,
    maxHeight: size.height,
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
  }
}

// 主灵动岛固定在主屏幕工作区顶部中央。
function positionMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const workArea = screen.getPrimaryDisplay().workArea
  const coordX = Math.round(workArea.x + (workArea.width - mainWindowSize.width) / 2)
  mainWindow.setPosition(coordX, workArea.y)
}

// 根据窗口角色加载相同渲染页面，开机窗口仅展示加载动画
function loadRendererWindow(win, isStartup) {
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL)
    url.searchParams.set('startup', isStartup ? '1' : '0')
    win.loadURL(url.toString())
    return
  }
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
    query: { startup: isStartup ? '1' : '0' },
  })
}

// 计算两次采样间的 CPU 使用率
function getCpuUsage() {
  const currentCpuStat = os.cpus().reduce((total, cpu) => {
    const times = cpu.times
    total.idle += times.idle
    total.total += Object.values(times).reduce((sum, value) => sum + value, 0)
    return total
  }, { idle: 0, total: 0 })

  const totalDelta = lastCpuStat ? currentCpuStat.total - lastCpuStat.total : 0
  const usage = totalDelta > 0
    ? Math.round((1 - (currentCpuStat.idle - lastCpuStat.idle) / totalDelta) * 100)
    : 0
  lastCpuStat = currentCpuStat
  return Math.max(0, Math.min(100, usage))
}

// 读取供收起态展示的轻量系统状态
function getSystemStatus() {
  const totalMem = os.totalmem()
  return {
    cpu: getCpuUsage(),
    neicun: Math.round((1 - os.freemem() / totalMem) * 100),
  }
}

// 创建应用主窗口
function createMainWindow() {
  mainWindow = new BrowserWindow(createWindowOptions(mainWindowSize))

  // 主灵动岛始终预加载在桌面顶部，等待开机动画结束后再显示
  positionMainWindow()
  mainWindow.once('ready-to-show', () => {
    // 透明窗口就绪后再次锁定内容尺寸，避免沿用旧窗口边界
    mainWindow.setContentSize(mainWindowSize.width, mainWindowSize.height)
    positionMainWindow()
    // 保持灵动岛位于普通应用窗口之上
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    // 透明安全区默认鼠标穿透，仅灵动岛本体接收交互
    mainWindow.setIgnoreMouseEvents(true, { forward: true })
  })

  loadRendererWindow(mainWindow, false)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 创建独立开机窗口，避免重定位主灵动岛造成平移与卡顿
function createStartupWindow() {
  startupWindow = new BrowserWindow(createWindowOptions(startupWindowSize))

  const workArea = screen.getPrimaryDisplay().workArea
  startupWindow.setPosition(
    Math.round(workArea.x + (workArea.width - startupWindowSize.width) / 2),
    Math.round(workArea.y + (workArea.height - startupWindowSize.height) / 2),
  )
  startupWindow.once('ready-to-show', () => {
    startupWindow?.setAlwaysOnTop(true, 'screen-saver')
    startupWindow?.setIgnoreMouseEvents(true, { forward: true })
    startupWindow?.showInactive()
  })
  loadRendererWindow(startupWindow, true)
  startupWindow.on('closed', () => {
    startupWindow = null
  })
}

app.whenReady().then(() => {
  // 初始化资料库索引，数据库与用户可管理的资料目录保持分离
  library = createLibrary(path.join(app.getPath('userData'), 'aether-dock.db'))
  // 以条目 ID 为键安全返回图片字节，路径仍由资料库层校验，不开放任意文件访问
  protocol.handle('aetherdock-img', async (request) => {
    try {
      const id = new URL(request.url).hostname
      if (!id) return new Response('missing id', { status: 400 })
      const item = library.getItemDetail(id)
      if (!item || item.type !== 'image') return new Response('not found', { status: 404 })
      const localPath = library.getItemLocalPath(item)
      if (!localPath) return new Response('not found', { status: 404 })
      const buffer = await fsp.readFile(localPath)
      const mime = item.mimeType || imageMime[path.extname(localPath).toLowerCase()] || 'image/png'
      return new Response(buffer, { headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' } })
    } catch {
      return new Response('error', { status: 500 })
    }
  })
  ipcMain.handle(ipcTongdao.getSystemStatus, () => getSystemStatus())
  ipcMain.handle(ipcTongdao.setIslandPassthrough, (_, isPassthrough) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setIgnoreMouseEvents(Boolean(isPassthrough), { forward: Boolean(isPassthrough) })
  })
  // 开机窗口完成后直接显示已预加载的顶部灵动岛
  ipcMain.handle(ipcTongdao.completeStartup, () => {
    if (startupWindow && !startupWindow.isDestroyed()) startupWindow.close()
    if (!mainWindow || mainWindow.isDestroyed()) return
    positionMainWindow()
    mainWindow.setIgnoreMouseEvents(true, { forward: true })
    mainWindow.showInactive()
  })
  // 选择资料库根目录，并创建必要的目录标记
  ipcMain.handle(ipcTongdao.selectLibraryRootdir, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 AetherDock 资料库目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return { quxiao: true }
    return { quxiao: false, config: await library.setRootdir(result.filePaths[0]) }
  })
  ipcMain.handle(ipcTongdao.getLibraryConfig, () => library.getConfig())
  ipcMain.handle(ipcTongdao.getCollapsedAnimation, () => library.getCollapsedAnimation())
  ipcMain.handle(ipcTongdao.setCollapsedAnimation, (_, animation) => library.setCollapsedAnimation(animation))
  ipcMain.handle(ipcTongdao.importLibraryContent, async (_, payload) => library.importContent(payload))
  ipcMain.handle(ipcTongdao.getLibraryItems, () => library.getItemList())
  ipcMain.handle(ipcTongdao.openLibraryItem, async (_, itemId) => {
    try {
      const item = library.getItemDetail(itemId)
      if (!item) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
      if (item?.storageMode === 'bookmark' && item.sourceUrl) {
        await shell.openExternal(item.sourceUrl)
        return { chenggong: true }
      }
      const localPath = library.getItemLocalPath(item)
      if (localPath) {
        const error = await shell.openPath(localPath)
        return error ? { chenggong: false, xiaoxi: error } : { chenggong: true }
      }
      return { chenggong: false, xiaoxi: '条目缺少可打开的来源' }
    } catch {
      return { chenggong: false, xiaoxi: '系统未能打开该条目' }
    }
  })
  ipcMain.handle(ipcTongdao.locateLibraryItem, (_, itemId) => {
    const item = library.getItemDetail(itemId)
    const localPath = library.getItemLocalPath(item)
    if (localPath) shell.showItemInFolder(localPath)
  })
  ipcMain.handle(ipcTongdao.deleteLibraryItem, async (_, itemId) => {
    // 删除确认由渲染层自定义弹窗完成，主进程仅负责执行删除与文件清理
    try {
      return await library.deleteItem(itemId)
    } catch {
      return { chenggong: false, xiaoxi: '删除失败' }
    }
  })
  createMainWindow()
  createStartupWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
      createStartupWindow()
    }
  })
})

app.on('window-all-closed', () => {
  library?.close()
  if (process.platform !== 'darwin') app.quit()
})
