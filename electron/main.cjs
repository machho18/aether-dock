const { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, screen, shell } = require('electron')
const { execFile } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')
const { promisify } = require('node:util')
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
let yingyongSyncPromise = null
const yingyongIconCache = new Map()
const zhixingFileAsync = promisify(execFile)
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

function chuangjianShortcutFingerprint(details, shortcutPath) {
  const parts = [details.target, details.args, details.cwd, details.appUserModelId]
    .map((value) => String(value ?? '').trim().toLowerCase())
  const content = parts.some(Boolean) ? parts.join('\0') : `unreadable\0${shortcutPath.toLowerCase()}`
  return createHash('sha256').update(content).digest('hex')
}

function panduanShortcutTargetStatus(targetPath) {
  if (!targetPath || !path.isAbsolute(targetPath) || fs.existsSync(targetPath)) return 'ready'
  const targetRoot = path.parse(targetPath).root
  const isOffline = targetPath.startsWith('\\\\') || (targetRoot && !fs.existsSync(targetRoot))
  return isOffline ? 'offline' : 'target_missing'
}

// 只扫描系统确认的用户与公共桌面目录，渲染层无法提交任意扫描路径。
async function saomiaoDesktopShortcuts() {
  if (process.platform !== 'win32') return { shortcuts: [], scannedScopes: [], unsupported: true }
  const publicDesktop = process.env.PUBLIC ? path.join(process.env.PUBLIC, 'Desktop') : ''
  const sources = [
    { scope: 'public-desktop', directory: publicDesktop },
    { scope: 'user-desktop', directory: app.getPath('desktop') },
  ]
  const uniqueDirectories = new Set()
  const shortcuts = []
  const scannedScopes = []

  for (const source of sources) {
    if (!source.directory) continue
    const normalizedDirectory = path.resolve(source.directory).toLowerCase()
    if (uniqueDirectories.has(normalizedDirectory)) continue
    uniqueDirectories.add(normalizedDirectory)

    let entries
    try {
      entries = await fsp.readdir(source.directory, { withFileTypes: true })
      scannedScopes.push(source.scope)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.lnk') continue
      const shortcutPath = path.join(source.directory, entry.name)
      const title = path.basename(entry.name, path.extname(entry.name))
      try {
        const details = shell.readShortcutLink(shortcutPath)
        const targetPath = String(details.target ?? '')
        shortcuts.push({
          title,
          sourcePath: shortcutPath,
          targetPath,
          launchArgs: String(details.args ?? ''),
          workingDirectory: String(details.cwd ?? ''),
          shortcutFingerprint: chuangjianShortcutFingerprint(details, shortcutPath),
          sourceScope: source.scope,
          status: panduanShortcutTargetStatus(targetPath),
        })
      } catch {
        shortcuts.push({
          title,
          sourcePath: shortcutPath,
          targetPath: '',
          launchArgs: '',
          workingDirectory: '',
          shortcutFingerprint: chuangjianShortcutFingerprint({}, shortcutPath),
          sourceScope: source.scope,
          status: 'unreadable',
        })
      }
    }
  }
  return { shortcuts, scannedScopes, unsupported: false }
}

// 使用 Windows 原生关联图标接口，补足 Electron 对部分 EXE 图标资源的解析缺失。
async function huoquWindowsShellIconData(filePath) {
  if (process.platform !== 'win32' || path.extname(filePath).toLowerCase() !== '.exe') return ''
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    '$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($env:AETHERDOCK_ICON_PATH)',
    'if ($null -eq $icon) { exit 2 }',
    '$bitmap = $icon.ToBitmap()',
    '$stream = [System.IO.MemoryStream]::new()',
    'try {',
    '  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)',
    '  [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))',
    '} finally {',
    '  $stream.Dispose(); $bitmap.Dispose(); $icon.Dispose()',
    '}',
  ].join('; ')

  try {
    const { stdout } = await zhixingFileAsync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script,
    ], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, AETHERDOCK_ICON_PATH: filePath },
    })
    const base64 = stdout.trim()
    return base64 ? `data:image/png;base64,${base64}` : ''
  } catch {
    return ''
  }
}

function panduanMaybeGenericIcon(nativeIcon, iconData) {
  const size = nativeIcon.getSize()
  return size.width <= 32 && size.height <= 32 && iconData.length <= 1000
}

async function huoquApplicationIconData(item) {
  if (item.type !== 'application') return ''
  const cacheKey = `${item.id}:${item.updatedAt}:${item.status}`
  if (yingyongIconCache.has(cacheKey)) return yingyongIconCache.get(cacheKey)

  const iconSources = []
  if (item.sourcePath && fs.existsSync(item.sourcePath)) {
    try {
      const shortcutDetails = shell.readShortcutLink(item.sourcePath)
      iconSources.push(shortcutDetails.icon, shortcutDetails.target)
    } catch {}
  }
  iconSources.push(item.targetPath, item.sourcePath)

  // 优先读取快捷方式显式图标和目标程序，最后才使用 Windows 的通用 .lnk 图标。
  const uniqueIconSources = [...new Set(iconSources.filter((source) => source && fs.existsSync(source)))]
  for (const iconSource of uniqueIconSources) {
    try {
      const nativeIcon = path.extname(iconSource).toLowerCase() === '.ico'
        ? nativeImage.createFromPath(iconSource)
        : await app.getFileIcon(iconSource, { size: 'large' })
      if (nativeIcon.isEmpty()) continue
      const iconData = nativeIcon.toDataURL()
      if (!iconData) continue

      // Electron 会把无法解析的 EXE 返回为小尺寸通用图标，此时改由 Windows 原生接口提取。
      const windowsIconData = panduanMaybeGenericIcon(nativeIcon, iconData)
        ? await huoquWindowsShellIconData(iconSource)
        : ''
      const resolvedIconData = windowsIconData || iconData
      yingyongIconCache.set(cacheKey, resolvedIconData)
      return resolvedIconData
    } catch {}
  }
  yingyongIconCache.set(cacheKey, '')
  return ''
}

function huoquLibraryItems() {
  return library.getItemList()
}

// 仅在应用卡进入可视范围后提取图标，避免列表读取因大量系统图标阻塞首帧。
async function huoquYingyongIconMap(itemIds) {
  const validIds = [...new Set(Array.isArray(itemIds) ? itemIds : [])]
    .filter((itemId) => typeof itemId === 'string')
    .slice(0, 12)
  const iconEntries = await Promise.all(validIds.map(async (itemId) => {
    const item = library.getItemDetail(itemId)
    if (item?.type !== 'application') return [itemId, '']
    return [itemId, await huoquApplicationIconData(item)]
  }))
  return Object.fromEntries(iconEntries)
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
  ipcMain.handle(ipcTongdao.tongbuDesktopApplications, async () => {
    if (!yingyongSyncPromise) {
      yingyongSyncPromise = (async () => {
        const saomiaoResult = await saomiaoDesktopShortcuts()
        if (saomiaoResult.unsupported) return { chenggong: false, xiaoxi: '桌面程序导入目前仅支持 Windows' }
        if (!saomiaoResult.scannedScopes.length) return { chenggong: false, xiaoxi: '无法读取 Windows 桌面目录' }
        const tongbuResult = library.tongbuDesktopShortcuts({
          shortcuts: saomiaoResult.shortcuts,
          scannedScopes: saomiaoResult.scannedScopes,
          scannedAt: Date.now(),
        })
        yingyongIconCache.clear()
        return {
          chenggong: true,
          ...tongbuResult,
          scanned: saomiaoResult.shortcuts.length,
          items: huoquLibraryItems(),
        }
      })().finally(() => { yingyongSyncPromise = null })
    }
    return yingyongSyncPromise
  })
  ipcMain.handle(ipcTongdao.getLibraryItems, () => huoquLibraryItems())
  ipcMain.handle(ipcTongdao.getApplicationIcons, (_, itemIds) => huoquYingyongIconMap(itemIds))
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
