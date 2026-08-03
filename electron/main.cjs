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

// 持有主窗口引用，避免被垃圾回收后自动关闭
let mainWindow = null
let startupWindow = null
let lastCpuStat = null
let library = null
let yingyongSyncPromise = null
let yingyongIconCacheDir = ''
const yingyongIconPromiseMap = new Map()
const yingyongIconRenwuQueue = []
let yingyongIconHuodongRenwu = 0
let yingyongIconRenwuXuhao = 0
let tupianThumbnailCacheDir = ''
const tupianThumbnailPromiseMap = new Map()
const tupianThumbnailRenwuQueue = []
let tupianThumbnailHuodongRenwu = 0
let tupianThumbnailRenwuXuhao = 0
let isHeavyTasksPaused = false
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
  const parts = [details.target, details.args, details.cwd, details.appUserModelId, details.icon]
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

// 图标读取可能触发原生接口或 PowerShell，固定并发数避免占满主进程资源。
function xianxingZhixingYingyongIconRenwu(action, priority = 2) {
  return new Promise((resolve, reject) => {
    yingyongIconRenwuQueue.push({ action, priority, sequence: yingyongIconRenwuXuhao++, resolve, reject })
    yingyongIconRenwuQueue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)
    zhixingNextYingyongIconRenwu()
  })
}

function zhixingNextYingyongIconRenwu() {
  while (yingyongIconHuodongRenwu < 2 && yingyongIconRenwuQueue.length) {
    const task = yingyongIconRenwuQueue.shift()
    yingyongIconHuodongRenwu += 1
    Promise.resolve(task.action())
      .then(task.resolve, task.reject)
      .finally(() => {
        yingyongIconHuodongRenwu -= 1
        zhixingNextYingyongIconRenwu()
      })
  }
}

function huoquYingyongIconCacheKey(item) {
  const existingKey = item.iconCacheKey || item.shortcutFingerprint
  if (/^[a-f\d]{64}$/i.test(existingKey || '')) return existingKey.toLowerCase()
  return createHash('sha256')
    .update([item.targetPath, item.sourcePath, item.id].map((value) => String(value ?? '').toLowerCase()).join('\0'))
    .digest('hex')
}

async function tiquApplicationNativeIcon(item) {
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
      const resolvedIcon = windowsIconData ? nativeImage.createFromDataURL(windowsIconData) : nativeIcon
      if (!resolvedIcon.isEmpty()) return resolvedIcon
    } catch {}
  }
  return null
}

function chuangjianYingyongIconUrl(cacheKey) {
  return `aetherdock-icon://${cacheKey}`
}

async function shengchengYingyongIconCache(item, cacheKey) {
  const nativeIcon = await tiquApplicationNativeIcon(item)
  if (!nativeIcon) return false

  const outputPaths = [64, 128].map((size) => ({
    size,
    finalPath: path.join(yingyongIconCacheDir, `${cacheKey}-${size}.png`),
    tempPath: path.join(yingyongIconCacheDir, `${cacheKey}-${size}.${process.pid}.${Date.now()}.tmp`),
  }))
  try {
    await Promise.all(outputPaths.map(({ size, tempPath }) => {
      const png = nativeIcon.resize({ width: size, height: size, quality: 'best' }).toPNG()
      if (!png.length) throw new Error('图标编码失败')
      return fsp.writeFile(tempPath, png)
    }))
    await Promise.all(outputPaths.map(({ tempPath, finalPath }) => fsp.rename(tempPath, finalPath)))
    return true
  } catch {
    await Promise.all(outputPaths.map(({ tempPath }) => fsp.rm(tempPath, { force: true }).catch(() => {})))
    return false
  }
}

async function huoquApplicationIconUrl(item, priority) {
  if (item.type !== 'application') return ''
  const cacheKey = huoquYingyongIconCacheKey(item)
  const iconPath = path.join(yingyongIconCacheDir, `${cacheKey}-128.png`)
  if (fs.existsSync(iconPath)) {
    if (item.iconCacheKey !== cacheKey || item.iconStatus !== 'ready') {
      library.setApplicationIconCache(item.id, cacheKey, 'ready')
    }
    return chuangjianYingyongIconUrl(cacheKey)
  }

  library.setApplicationIconCache(item.id, cacheKey, 'pending')
  let cachePromise = yingyongIconPromiseMap.get(cacheKey)
  if (!cachePromise) {
    cachePromise = xianxingZhixingYingyongIconRenwu(
      () => shengchengYingyongIconCache(item, cacheKey),
      priority,
    ).finally(() => yingyongIconPromiseMap.delete(cacheKey))
    yingyongIconPromiseMap.set(cacheKey, cachePromise)
  }
  const generated = await cachePromise
  library.setApplicationIconCache(item.id, cacheKey, generated ? 'ready' : 'failed')
  return generated ? chuangjianYingyongIconUrl(cacheKey) : ''
}

// 可见卡按中心向外排序进入 P0/P1 队列，IPC 仅返回轻量协议地址。
async function huoquYingyongIconMap(itemIds) {
  const validIds = [...new Set(Array.isArray(itemIds) ? itemIds : [])]
    .filter((itemId) => typeof itemId === 'string')
    .slice(0, 12)
  const iconEntries = await Promise.all(validIds.map(async (itemId, index) => {
    const item = library.getItemDetail(itemId)
    if (item?.type !== 'application') return [itemId, '']
    return [itemId, await huoquApplicationIconUrl(item, index < 5 ? 0 : 1)]
  }))
  return Object.fromEntries(iconEntries)
}

// 同步仅删除已无数据库记录引用的指纹文件，未变化程序永久复用原缓存。
async function qingliYingyongIconCache(items) {
  const validKeys = new Set(items.map(({ iconCacheKey }) => iconCacheKey).filter(Boolean))
  let filenames = []
  try { filenames = await fsp.readdir(yingyongIconCacheDir) } catch { return }
  await Promise.all(filenames.map(async (filename) => {
    const match = /^([a-f\d]{64})-(?:64|128)\.png$/i.exec(filename)
    if (match && !validKeys.has(match[1].toLowerCase())) {
      await fsp.rm(path.join(yingyongIconCacheDir, filename), { force: true })
    }
  }))
}

function xianxingZhixingThumbnailRenwu(action, priority = 2) {
  return new Promise((resolve, reject) => {
    tupianThumbnailRenwuQueue.push({ action, priority, sequence: tupianThumbnailRenwuXuhao++, resolve, reject })
    tupianThumbnailRenwuQueue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)
    zhixingNextThumbnailRenwu()
  })
}

function zhixingNextThumbnailRenwu() {
  if (isHeavyTasksPaused || tupianThumbnailHuodongRenwu || !tupianThumbnailRenwuQueue.length) return
  const task = tupianThumbnailRenwuQueue.shift()
  tupianThumbnailHuodongRenwu = 1
  Promise.resolve(task.action())
    .then(task.resolve, task.reject)
    .finally(() => {
      tupianThumbnailHuodongRenwu = 0
      zhixingNextThumbnailRenwu()
    })
}

function huoquThumbnailCacheKey(item) {
  const existingKey = item.thumbnailCacheKey
  if (/^[a-f\d]{64}$/i.test(existingKey || '')) return existingKey.toLowerCase()
  return createHash('sha256')
    .update([item.id, item.byteSize, item.updatedAt, item.relativePath].map((value) => String(value ?? '')).join('\0'))
    .digest('hex')
}

function chuangjianCoverThumbnail(sourceImage, width, height) {
  const sourceSize = sourceImage.getSize()
  if (!sourceSize.width || !sourceSize.height) return null
  const scale = Math.max(width / sourceSize.width, height / sourceSize.height)
  const resizedWidth = Math.max(width, Math.ceil(sourceSize.width * scale))
  const resizedHeight = Math.max(height, Math.ceil(sourceSize.height * scale))
  const resizedImage = sourceImage.resize({ width: resizedWidth, height: resizedHeight, quality: 'best' })
  return resizedImage.crop({
    x: Math.floor((resizedWidth - width) / 2),
    y: Math.floor((resizedHeight - height) / 2),
    width,
    height,
  })
}

async function shengchengThumbnailCache(item, cacheKey) {
  const localPath = library.getItemLocalPath(item)
  if (!localPath) return false
  const sourceImage = nativeImage.createFromPath(localPath)
  if (sourceImage.isEmpty()) return false

  const outputPaths = [320, 640].map((width) => ({
    width,
    height: width / 2,
    finalPath: path.join(tupianThumbnailCacheDir, `${cacheKey}-${width}.png`),
    tempPath: path.join(tupianThumbnailCacheDir, `${cacheKey}-${width}.${process.pid}.${Date.now()}.tmp`),
  }))
  try {
    await Promise.all(outputPaths.map(({ width, height, tempPath }) => {
      const thumbnail = chuangjianCoverThumbnail(sourceImage, width, height)
      const png = thumbnail?.toPNG() ?? Buffer.alloc(0)
      if (!png.length) throw new Error('缩略图编码失败')
      return fsp.writeFile(tempPath, png)
    }))
    await Promise.all(outputPaths.map(({ tempPath, finalPath }) => fsp.rename(tempPath, finalPath)))
    return true
  } catch {
    await Promise.all(outputPaths.map(({ tempPath }) => fsp.rm(tempPath, { force: true }).catch(() => {})))
    return false
  }
}

async function huoquImageThumbnailKey(item, priority) {
  if (item.type !== 'image') return ''
  const cacheKey = huoquThumbnailCacheKey(item)
  const hasCache = [320, 640].every((width) => fs.existsSync(path.join(tupianThumbnailCacheDir, `${cacheKey}-${width}.png`)))
  if (hasCache) {
    if (item.thumbnailCacheKey !== cacheKey || item.thumbnailStatus !== 'ready') {
      library.setImageThumbnailCache(item.id, cacheKey, 'ready')
    }
    return cacheKey
  }

  library.setImageThumbnailCache(item.id, cacheKey, 'pending')
  let cachePromise = tupianThumbnailPromiseMap.get(cacheKey)
  if (!cachePromise) {
    cachePromise = xianxingZhixingThumbnailRenwu(
      () => shengchengThumbnailCache(item, cacheKey),
      priority,
    ).finally(() => tupianThumbnailPromiseMap.delete(cacheKey))
    tupianThumbnailPromiseMap.set(cacheKey, cachePromise)
  }
  const generated = await cachePromise
  library.setImageThumbnailCache(item.id, cacheKey, generated ? 'ready' : 'failed')
  return generated ? cacheKey : ''
}

async function huoquImageThumbnailMap(itemIds, priority = 0) {
  const validIds = [...new Set(Array.isArray(itemIds) ? itemIds : [])]
    .filter((itemId) => typeof itemId === 'string')
    .slice(0, 12)
  const entries = await Promise.all(validIds.map(async (itemId, index) => {
    const item = library.getItemDetail(itemId)
    if (item?.type !== 'image') return [itemId, '']
    return [itemId, await huoquImageThumbnailKey(item, Math.min(3, priority + (index < 5 ? 0 : 1)))]
  }))
  return Object.fromEntries(entries)
}

async function shanchuThumbnailCache(cacheKey) {
  if (!/^[a-f\d]{64}$/i.test(cacheKey || '')) return
  await tupianThumbnailPromiseMap.get(cacheKey.toLowerCase())?.catch(() => {})
  await Promise.all([320, 640].map((width) => (
    fsp.rm(path.join(tupianThumbnailCacheDir, `${cacheKey.toLowerCase()}-${width}.png`), { force: true })
  )))
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

app.whenReady().then(async () => {
  // 初始化资料库索引，数据库与用户可管理的资料目录保持分离
  library = createLibrary(path.join(app.getPath('userData'), 'aether-dock.db'))
  yingyongIconCacheDir = path.join(app.getPath('userData'), 'application-icons')
  tupianThumbnailCacheDir = path.join(app.getPath('userData'), 'image-thumbnails')
  await fsp.mkdir(yingyongIconCacheDir, { recursive: true })
  await fsp.mkdir(tupianThumbnailCacheDir, { recursive: true })
  protocol.handle('aetherdock-icon', async (request) => {
    try {
      const cacheKey = new URL(request.url).hostname.toLowerCase()
      if (!/^[a-f\d]{64}$/.test(cacheKey)) return new Response('invalid key', { status: 400 })
      const buffer = await fsp.readFile(path.join(yingyongIconCacheDir, `${cacheKey}-128.png`))
      return new Response(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch (error) {
      return new Response('not found', { status: error?.code === 'ENOENT' ? 404 : 500 })
    }
  })
  protocol.handle('aetherdock-thumb', async (request) => {
    try {
      const url = new URL(request.url)
      const cacheKey = url.hostname.toLowerCase()
      const width = url.pathname === '/320' ? 320 : url.pathname === '/640' ? 640 : 0
      if (!/^[a-f\d]{64}$/.test(cacheKey) || !width) return new Response('invalid thumbnail', { status: 400 })
      const buffer = await fsp.readFile(path.join(tupianThumbnailCacheDir, `${cacheKey}-${width}.png`))
      return new Response(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch (error) {
      return new Response('not found', { status: error?.code === 'ENOENT' ? 404 : 500 })
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
  ipcMain.handle(ipcTongdao.importLibraryContent, async (_, payload) => {
    const result = await library.importContent(payload)
    const imageIds = result.added.filter(({ type }) => type === 'image').map(({ id }) => id)
    if (imageIds.length) {
      setTimeout(() => {
        for (const itemId of imageIds) {
          const item = library.getItemDetail(itemId)
          if (item) void huoquImageThumbnailKey(item, 2).catch(() => {})
        }
      }, 500)
    }
    return result
  })
  ipcMain.handle(ipcTongdao.setHeavyTasksPaused, (_, paused) => {
    isHeavyTasksPaused = Boolean(paused)
    if (!isHeavyTasksPaused) zhixingNextThumbnailRenwu()
  })
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
        const items = library.getApplicationCacheItems()
        await qingliYingyongIconCache(items)
        return {
          chenggong: true,
          ...tongbuResult,
          scanned: saomiaoResult.shortcuts.length,
        }
      })().finally(() => { yingyongSyncPromise = null })
    }
    return yingyongSyncPromise
  })
  ipcMain.handle(ipcTongdao.getLibrarySummary, () => library.getLibrarySummary())
  ipcMain.handle(ipcTongdao.getLibraryPage, (_, options) => library.getLibraryPage(options))
  ipcMain.handle(ipcTongdao.searchLibrary, (_, options) => library.searchLibrary(options))
  ipcMain.handle(ipcTongdao.getApplicationIcons, (_, itemIds) => huoquYingyongIconMap(itemIds))
  ipcMain.handle(ipcTongdao.getImageThumbnails, (_, itemIds) => huoquImageThumbnailMap(itemIds))
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
      const item = library.getItemDetail(itemId)
      const thumbnailCacheKey = item?.type === 'image' ? huoquThumbnailCacheKey(item) : ''
      const result = await library.deleteItem(itemId)
      if (result.chenggong && thumbnailCacheKey) await shanchuThumbnailCache(thumbnailCacheKey)
      return result
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
