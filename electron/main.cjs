const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, net: electronNet, protocol, screen, session, shell, Tray } = require('electron')
const { execFile, spawn } = require('node:child_process')
const { createHash, randomUUID } = require('node:crypto')
const dns = require('node:dns/promises')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const nodeNet = require('node:net')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')
const { promisify } = require('node:util')
const { autoUpdater } = require('electron-updater')
const { createLibrary } = require('./ziliaoku.cjs')
const { createHuihuaStore } = require('./huihua.cjs')
const { shengchengDocxBuffer } = require('./docx-generator.cjs')
const { shengchengMarkdownBuffer } = require('./markdown-generator.cjs')
const { shengchengPdfBuffer } = require('./pdf-generator.cjs')
const { shengchengXlsxBuffer } = require('./xlsx-generator.cjs')
const { ipcTongdao } = require('./ipc.cjs')
const piJicheng = require('./pi.cjs')

// 持有主窗口引用，避免被垃圾回收后自动关闭
let mainWindow = null
let isMainWindowReady = false
let startupWindow = null
let startupWindowFallbackTimer = null
let isStartupCompleted = false
let xuanfuqiuWindow = null
let isXuanfuqiuWindowReady = false
let tuopan = null
let lastCpuStat = null
let library = null
let huihuaStore = null
const piZiliaokuShouquanMap = new Map()
// 仅在本次应用启动期间保留同类写操作授权，不写入任何持久化配置。
const piChixuZiliaokuShouquanSet = new Set()
let yingyongSyncPromise = null
let managedReconcilePromise = null
let managedReconcileKey = ''
let managedReconcileTimer = null
let isManagedReconcilePending = false
let libraryRootMigrationPromise = null
let yingyongIconCacheDir = ''
let yingyongIconCleanupPromise = null
let yingyongIconCleanupTimer = null
let isYingyongIconCleanupPending = false
const yingyongIconPromiseMap = new Map()
const yingyongIconRenwuQueue = []
const mediaCacheYanzhengVersionMap = new Map()
const mediaCacheYanzhengMaxSize = 4096
let yingyongIconHuodongRenwu = 0
let yingyongIconRenwuXuhao = 0
let tupianThumbnailCacheDir = ''
const tupianThumbnailPromiseMap = new Map()
const tupianThumbnailRenwuQueue = []
let tupianThumbnailHuodongRenwu = 0
let tupianThumbnailRenwuXuhao = 0
let isHeavyTasksPaused = false
let isXuanfuqiuMoshi = false
let isGengxinDialogShowing = false
let isAutoUpdaterInitialized = false
let jiantiebanWindowsClipboardHelper = null
let piPrewarmTimer = null
let zhengzaiGithubGengxinJianchaPromise = null
let gengxinJianchaStateReadyPromise = null
let qidongJieduan = '等待应用就绪'
let appGengxinInfo = {
  hasUpdate: false,
  latestVersion: '',
  isChecking: false,
  isChecked: false,
  isDownloading: false,
  downloadPercent: 0,
  isDownloaded: false,
  errorMessage: '',
}
const zhixingFileAsync = promisify(execFile)
const mainWindowSize = { width: 860, height: 560 }
// 主窗口透明画布内的可见区域尺寸，需与 App.vue 的灵动岛布局保持一致。
const mainIslandSize = { width: 760, height: 460 }
const mainIslandCharmSize = { width: 104, height: 116 }
const mainIslandDropSize = { width: 160, height: 214 }
const mainIslandCharmEdgeOffset = 28
const mainIslandChushiScreenMargin = 88
// 裁剪边距覆盖主体阴影与拖动回弹的完整视觉范围，防止靠边时被窗口形状截断。
const mainIslandCharmShapeMargin = { horizontal: 14, top: 16, bottom: 18 }
// 收起态指标与拖动磁场共用完整外沿，避免透明窗口在标签旁产生硬裁剪边界。
const mainIslandCixiShapeMargin = { horizontal: 28, top: 30, bottom: 28 }
// 拖动边界只约束宠物本体，允许外围磁场自然延伸至屏幕之外。
const mainIslandCharmBoundaryMargin = { horizontal: 6, top: 4, bottom: 6 }
let mainIslandAnchor = { horizontal: 'right', vertical: 'bottom' }
let mainIslandMoveTimer = null
let mainIslandMoveContext = null
let isMainIslandShapeReady = false
let mainIslandShapeCacheKey = ''
const startupWindowSize = { width: 360, height: 360 }
const shouqikouWindowSize = { width: 226, height: 64 }
const shouqikouMargin = 24
const maxRemoteFileBytes = 100 * 1024 * 1024
const githubReleaseApiUrl = 'https://api.github.com/repos/machho18/aether-dock/releases/latest'
const githubReleasePageUrl = 'https://github.com/machho18/aether-dock/releases/latest'
const gengxinZidongJianchaJiangeMs = 6 * 60 * 60 * 1000
const gengxinXianliuBaodiDengdaiMs = 60 * 1000
const qidongRizhiFilename = 'startup.log'
const gengxinJianchaState = { lastSuccessAt: 0, retryAt: 0 }
const isKaifaHuanjing = !app.isPackaged
const kaifaUserDataDir = path.join(app.getPath('appData'), 'aether-dock-dev')
const ziliaokuDbFilename = isKaifaHuanjing ? 'aether-dock.dev.db' : 'aether-dock.db'
const remoteImageExts = new Set(['.avif', '.bmp', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.webp'])
const jiantiebanImageExts = new Set([...remoteImageExts, '.svg'])
const remoteDocumentExts = new Set(['.csv', '.doc', '.docx', '.md', '.odp', '.ods', '.odt', '.pdf', '.ppt', '.pptx', '.rtf', '.txt', '.xls', '.xlsx'])
const textPreviewExts = new Set(['.txt', '.md', '.csv'])
const websiteIconMimeTypes = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/x-icon', 'image/vnd.microsoft.icon',
  'image/svg+xml', 'image/webp', 'image/gif',
  'application/xml', 'text/xml', 'text/plain', 'application/octet-stream',
])
const websiteDataIconMimeTypes = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/x-icon', 'image/vnd.microsoft.icon',
  'image/svg+xml', 'image/webp', 'image/gif',
])
const websiteBrowserIconExtensions = ['svg', 'webp', 'gif']
const yingyongIconCacheSizes = [64, 128, 256]
// 图标缓存版本：升级时让异常图标重新生成
const yingyongIconCacheVersion = 'v3'
const windowsIconResourceExts = new Set(['.dll', '.exe', '.ico'])
const websiteIconMaxCandidates = 10
const websiteIconTotalTimeoutMs = 15000
const websiteIconPageTimeoutMs = 7000
const websiteIconCandidateTimeoutMs = 4000
const websiteSvgIconMaxBytes = 256 * 1024
const websiteBrowserIconMaxBytes = 1024 * 1024
const websiteSvgAllowedElements = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask',
  'symbol', 'use', 'title', 'desc', 'text', 'tspan',
])
const remoteMimeExtensions = new Map([
  ['image/avif', '.avif'], ['image/bmp', '.bmp'], ['image/gif', '.gif'],
  ['image/heic', '.heic'], ['image/jpeg', '.jpg'], ['image/png', '.png'],
  ['image/webp', '.webp'], ['application/pdf', '.pdf'],
  ['application/msword', '.doc'], ['application/rtf', '.rtf'], ['text/csv', '.csv'],
  ['text/markdown', '.md'], ['text/plain', '.txt'],
  ['application/vnd.ms-excel', '.xls'], ['application/vnd.ms-powerpoint', '.ppt'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx'],
  ['application/vnd.oasis.opendocument.text', '.odt'],
  ['application/vnd.oasis.opendocument.spreadsheet', '.ods'],
  ['application/vnd.oasis.opendocument.presentation', '.odp'],
])

// 开发版使用独立数据目录，避免卸载生产版时误删调试数据库与缓存。
if (isKaifaHuanjing) {
  app.setPath('userData', kaifaUserDataDir)
}

// 启动与渲染异常落盘，便于区分进程崩溃、渲染异常和初始化卡顿。
function jiluQidongWenti(leixing, error) {
  const detail = error instanceof Error ? error.stack || error.message : String(error ?? '')
  const content = `[${new Date().toISOString()}] ${leixing}\n${detail}\n\n`
  console.error(`[AetherDock] ${leixing}`, detail)
  void fsp.appendFile(path.join(app.getPath('userData'), qidongRizhiFilename), content, 'utf8').catch(() => {})
}

// 所有应用窗口统一记录加载失败与渲染进程退出，避免问题只表现为窗口消失或未响应。
function jiantingWindowYichang(win, mingcheng) {
  win.on('unresponsive', () => jiluQidongWenti(`${mingcheng}无响应`, '渲染进程未在预期时间内响应'))
  win.webContents.on('render-process-gone', (_, details) => {
    jiluQidongWenti(`${mingcheng}渲染进程已退出`, `原因：${details.reason}，退出码：${details.exitCode}`)
  })
  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame) return
    jiluQidongWenti(`${mingcheng}加载失败`, `错误码：${errorCode}，原因：${errorDescription}，地址：${validatedUrl}`)
  })
}

// 通过 Windows 原生剪贴板写入文件拖放列表，让聊天软件和资源管理器接收真实文件。
async function fuzhiWenjianZiyuan(localPath) {
  if (process.platform !== 'win32') throw new Error('当前系统不支持文件资源分享')
  const fuzhiScript = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$fileList = New-Object System.Collections.Specialized.StringCollection',
    '$fileList.Add($env:AETHERDOCK_SHARE_PATH)',
    '[System.Windows.Forms.Clipboard]::SetFileDropList($fileList)',
  ].join('; ')
  await zhixingFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', fuzhiScript], {
    windowsHide: true,
    timeout: 5000,
    env: { ...process.env, AETHERDOCK_SHARE_PATH: localPath },
  })
}

// 按像素行计算圆角停靠坞轮廓，让透明窗口的交互范围贴合可见区域。
function huoquShouqikouWindowShape() {
  const { width, height } = shouqikouWindowSize
  const radius = Math.min(24, Math.floor(height / 2))
  const rects = []
  for (let y = 0; y < height; y += 1) {
    const distanceY = y < radius ? radius - y - .5 : y >= height - radius ? y - (height - radius) + .5 : 0
    const inset = distanceY ? Math.ceil(radius - Math.sqrt(Math.max(0, radius ** 2 - distanceY ** 2))) : 0
    rects.push({ x: inset, y, width: width - inset * 2, height: 1 })
  }
  return rects
}

// 两类透明窗口共享安全的浏览器配置，仅尺寸与生命周期不同。
function createWindowOptions(size) {
  return {
    ...size,
    // 统一窗口、任务栏和安装包的品牌图标。
    icon: path.join(__dirname, 'assets', 'aetherdock-icon-brand.ico'),
    minWidth: size.width,
    minHeight: size.height,
    maxWidth: size.width,
    maxHeight: size.height,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    resizable: false,
    skipTaskbar: true,
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

// 首次出现按宠物可见区域留出屏幕边距，透明画布不参与视觉定位。
function positionMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const workArea = screen.getPrimaryDisplay().workArea
  const { charmOriginX, charmOriginY } = huoquMainIslandLayout()
  const coordX = Math.round(
    workArea.x + workArea.width - mainIslandChushiScreenMargin - charmOriginX - mainIslandCharmSize.width,
  )
  const coordY = Math.round(
    workArea.y + workArea.height - mainIslandChushiScreenMargin - charmOriginY - mainIslandCharmSize.height,
  )
  mainWindow.setPosition(coordX, coordY)
}

// 计算挂件锚点与投放区域在透明主窗口中的位置，渲染层使用相同锚点规则。
function huoquMainIslandLayout(anchor = mainIslandAnchor) {
  const islandOriginX = mainWindowSize.width - mainIslandSize.width
  const islandOriginY = Math.round((mainWindowSize.height - mainIslandSize.height) / 2)
  const charmOffsetX = anchor.horizontal === 'left'
    ? mainIslandCharmEdgeOffset
    : anchor.horizontal === 'center'
      ? Math.round((mainIslandSize.width - mainIslandCharmSize.width) / 2)
      : mainIslandSize.width - mainIslandCharmSize.width - mainIslandCharmEdgeOffset
  const charmOffsetY = anchor.vertical === 'top'
    ? mainIslandCharmEdgeOffset
    : anchor.vertical === 'bottom'
      ? mainIslandSize.height - mainIslandCharmSize.height - mainIslandCharmEdgeOffset
      : Math.round((mainIslandSize.height - mainIslandCharmSize.height) / 2)
  const dropOffsetX = charmOffsetX + Math.round((mainIslandCharmSize.width - mainIslandDropSize.width) / 2)
  const dropOffsetY = anchor.vertical === 'top'
    ? charmOffsetY
    : charmOffsetY - (mainIslandDropSize.height - mainIslandCharmSize.height)

  return {
    islandOriginX,
    islandOriginY,
    charmOriginX: islandOriginX + charmOffsetX,
    charmOriginY: islandOriginY + charmOffsetY,
    dropOriginX: islandOriginX + dropOffsetX,
    dropOriginY: islandOriginY + dropOffsetY,
  }
}

function huoquMainIslandStateRect(state, anchor = mainIslandAnchor) {
  const { islandOriginX, islandOriginY, charmOriginX, charmOriginY, dropOriginX, dropOriginY } = huoquMainIslandLayout(anchor)
  const stateRects = {
    collapsed: [{
      x: charmOriginX - mainIslandCixiShapeMargin.horizontal,
      y: charmOriginY - mainIslandCixiShapeMargin.top,
      width: mainIslandCharmSize.width + mainIslandCixiShapeMargin.horizontal * 2,
      height: mainIslandCharmSize.height + mainIslandCixiShapeMargin.top + mainIslandCixiShapeMargin.bottom,
    }],
    moving: [{
      x: charmOriginX - mainIslandCixiShapeMargin.horizontal,
      y: charmOriginY - mainIslandCixiShapeMargin.top,
      width: mainIslandCharmSize.width + mainIslandCixiShapeMargin.horizontal * 2,
      height: mainIslandCharmSize.height + mainIslandCixiShapeMargin.top + mainIslandCixiShapeMargin.bottom,
    }],
    expanded: [{ x: islandOriginX, y: islandOriginY, ...mainIslandSize }],
    drop: [{ x: dropOriginX, y: dropOriginY, ...mainIslandDropSize }],
  }
  return stateRects[state]?.[0] ?? stateRects.collapsed[0]
}

// 窗口形状与当前交互状态保持一致，收起态仅保留宠物本体的可点击区域。
function tongbuMainIslandWindowShape(state, anchor = mainIslandAnchor) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!['win32', 'linux'].includes(process.platform)) {
    isMainIslandShapeReady = true
    return
  }

  const rect = huoquMainIslandStateRect(state, anchor)
  const shapeKey = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`
  if (shapeKey === mainIslandShapeCacheKey) return
  mainWindow.setShape([rect])
  mainIslandShapeCacheKey = shapeKey
  isMainIslandShapeReady = true
}

function huoquMainIslandBoundaryRect(state, anchor = mainIslandAnchor) {
  if (!['collapsed', 'moving'].includes(state)) return huoquMainIslandStateRect(state, anchor)

  const { charmOriginX, charmOriginY } = huoquMainIslandLayout(anchor)
  return {
    x: charmOriginX - mainIslandCharmBoundaryMargin.horizontal,
    y: charmOriginY - mainIslandCharmBoundaryMargin.top,
    width: mainIslandCharmSize.width + mainIslandCharmBoundaryMargin.horizontal * 2,
    height: mainIslandCharmSize.height + mainIslandCharmBoundaryMargin.top + mainIslandCharmBoundaryMargin.bottom,
  }
}

// 收起与拖动按宠物本体约束，展开和投放仍确保完整可见。
function yueshuMainIslandWindowPosition(position, state = 'collapsed', anchor = mainIslandAnchor) {
  const rect = huoquMainIslandBoundaryRect(state, anchor)
  const rectCenter = {
    x: position.x + rect.x + rect.width / 2,
    y: position.y + rect.y + rect.height / 2,
  }
  const workArea = screen.getDisplayNearestPoint(rectCenter).workArea
  const minX = workArea.x - rect.x
  const maxX = workArea.x + workArea.width - rect.x - rect.width
  const minY = workArea.y - rect.y
  const maxY = workArea.y + workArea.height - rect.y - rect.height
  return {
    x: Math.round(maxX >= minX ? Math.min(Math.max(position.x, minX), maxX) : workArea.x + (workArea.width - mainWindowSize.width) / 2),
    y: Math.round(maxY >= minY ? Math.min(Math.max(position.y, minY), maxY) : workArea.y + (workArea.height - mainWindowSize.height) / 2),
  }
}

// 展开前选择裁切最少的锚点，空间相同时保留当前方向以避免窗口无意义重排。
function huoquMainIslandAnchorAxis(guajianCenter, workArea, panelSize, guajianSize, axis, currentAnchor) {
  const workStart = axis === 'horizontal' ? workArea.x : workArea.y
  const workSize = axis === 'horizontal' ? workArea.width : workArea.height
  const safeMargin = 6
  const startAnchor = axis === 'horizontal' ? 'left' : 'top'
  const endAnchor = axis === 'horizontal' ? 'right' : 'bottom'
  const anchorOffsets = {
    center: panelSize / 2,
    [startAnchor]: mainIslandCharmEdgeOffset + guajianSize / 2,
    [endAnchor]: panelSize - mainIslandCharmEdgeOffset - guajianSize / 2,
  }
  const anchorValues = [currentAnchor, 'center', startAnchor, endAnchor]
    .filter((value, index, values) => anchorOffsets[value] !== undefined && values.indexOf(value) === index)
  const anchorOptions = anchorValues.map((value) => ({ value, guajianOffset: anchorOffsets[value] }))
  const safeStart = workStart + safeMargin
  const safeEnd = workStart + workSize - safeMargin
  let bestOption = anchorOptions[0]
  let minOverflow = Number.POSITIVE_INFINITY

  for (const option of anchorOptions) {
    const panelStart = guajianCenter - option.guajianOffset
    const panelEnd = panelStart + panelSize
    const overflow = Math.max(safeStart - panelStart, 0) + Math.max(panelEnd - safeEnd, 0)
    if (overflow < minOverflow) {
      bestOption = option
      minOverflow = overflow
    }
  }

  return bestOption.value
}

// 仅在窗口展开前调整透明画布内的锚点，挂件在屏幕上的位置保持不变。
function youhuaMainIslandAnchor(position) {
  const currentLayout = huoquMainIslandLayout()
  const charmScreenOrigin = {
    x: position.x + currentLayout.charmOriginX,
    y: position.y + currentLayout.charmOriginY,
  }
  const charmCenter = {
    x: charmScreenOrigin.x + mainIslandCharmSize.width / 2,
    y: charmScreenOrigin.y + mainIslandCharmSize.height / 2,
  }
  const workArea = screen.getDisplayNearestPoint(charmCenter).workArea
  const nextAnchor = {
    horizontal: huoquMainIslandAnchorAxis(
      charmCenter.x,
      workArea,
      mainIslandSize.width,
      mainIslandCharmSize.width,
      'horizontal',
      mainIslandAnchor.horizontal,
    ),
    vertical: huoquMainIslandAnchorAxis(
      charmCenter.y,
      workArea,
      mainIslandSize.height,
      mainIslandCharmSize.height,
      'vertical',
      mainIslandAnchor.vertical,
    ),
  }
  const nextLayout = huoquMainIslandLayout(nextAnchor)
  mainIslandAnchor = nextAnchor
  return {
    x: charmScreenOrigin.x - nextLayout.charmOriginX,
    y: charmScreenOrigin.y - nextLayout.charmOriginY,
  }
}

// 状态切换同步位置、锚点和可点击区域，透明画布不会再吞掉宠物的首次点击。
function shezhiMainIslandWindowShape(state = 'collapsed', options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return null

  const targetState = ['collapsed', 'moving', 'expanded', 'drop'].includes(state) ? state : 'collapsed'
  mainWindow.setIgnoreMouseEvents(false)
  const [currentX, currentY] = mainWindow.getPosition()
  const optimizedPosition = options?.optimizeAnchor
    ? youhuaMainIslandAnchor({ x: currentX, y: currentY })
    : { x: currentX, y: currentY }
  const targetPosition = yueshuMainIslandWindowPosition(optimizedPosition, targetState)
  if (targetPosition.x !== currentX || targetPosition.y !== currentY) {
    mainWindow.setPosition(targetPosition.x, targetPosition.y)
  }

  tongbuMainIslandWindowShape(targetState)
  return { anchor: { ...mainIslandAnchor } }
}

// 主进程直接采样系统鼠标坐标，避免渲染进程、IPC 与窗口移动形成追赶回路。
function gengxinMainIslandWindowMove() {
  if (!mainIslandMoveContext || !mainWindow || mainWindow.isDestroyed()) {
    jieshuMainIslandWindowMove()
    return
  }

  const cursorPosition = screen.getCursorScreenPoint()
  const requestedPosition = {
    x: cursorPosition.x - mainIslandMoveContext.offsetX,
    y: cursorPosition.y - mainIslandMoveContext.offsetY,
  }
  const targetPosition = yueshuMainIslandWindowPosition(requestedPosition, 'moving')

  // 到达屏幕边缘后重设抓取偏移，鼠标回移一像素时窗口即可立即跟随。
  if (targetPosition.x !== requestedPosition.x) mainIslandMoveContext.offsetX = cursorPosition.x - targetPosition.x
  if (targetPosition.y !== requestedPosition.y) mainIslandMoveContext.offsetY = cursorPosition.y - targetPosition.y

  if (mainIslandMoveContext.windowX === targetPosition.x && mainIslandMoveContext.windowY === targetPosition.y) return
  mainIslandMoveContext.windowX = targetPosition.x
  mainIslandMoveContext.windowY = targetPosition.y
  mainWindow.setPosition(targetPosition.x, targetPosition.y, false)
}

function kaishiMainIslandWindowMove() {
  if (!mainWindow || mainWindow.isDestroyed() || isXuanfuqiuMoshi) return null
  jieshuMainIslandWindowMove()

  const layout = shezhiMainIslandWindowShape('moving')
  const cursorPosition = screen.getCursorScreenPoint()
  const [windowX, windowY] = mainWindow.getPosition()
  mainIslandMoveContext = {
    offsetX: cursorPosition.x - windowX,
    offsetY: cursorPosition.y - windowY,
    windowX,
    windowY,
  }
  const displayFrequency = screen.getDisplayNearestPoint(cursorPosition).displayFrequency || 60
  const moveInterval = Math.min(16, Math.max(7, Math.round(1000 / displayFrequency)))
  mainIslandMoveTimer = setInterval(gengxinMainIslandWindowMove, moveInterval)
  mainIslandMoveTimer.unref?.()
  return layout
}

function jieshuMainIslandWindowMove() {
  if (mainIslandMoveTimer) clearInterval(mainIslandMoveTimer)
  mainIslandMoveTimer = null
  mainIslandMoveContext = null
}

// 独立收起坞固定在左下角，模式切换时无需移动主灵动岛窗口。
function positionXuanfuqiuWindow(point) {
  if (!xuanfuqiuWindow || xuanfuqiuWindow.isDestroyed()) return
  const display = screen.getDisplayNearestPoint(point)
  const workArea = display.workArea
  const minX = workArea.x + shouqikouMargin
  const maxX = workArea.x + workArea.width - shouqikouMargin - shouqikouWindowSize.width
  const minY = workArea.y + shouqikouMargin
  const maxY = workArea.y + workArea.height - shouqikouMargin - shouqikouWindowSize.height
  const coordX = Math.min(Math.max(point.x, minX), maxX)
  const coordY = Math.min(Math.max(point.y, minY), maxY)
  xuanfuqiuWindow.setPosition(Math.round(coordX), Math.round(coordY))
}

// 等待悬浮球首帧完成，禁止未绘制的透明窗口提前显示。
function dengdaiXuanfuqiuWindowReady() {
  if (isXuanfuqiuWindowReady) return Promise.resolve()
  return new Promise((resolve) => xuanfuqiuWindow?.once('ready-to-show', resolve))
}

// 两个窗口均在启动时预加载，模式切换只交换可见性，不触发透明窗口的重定位重绘。
async function qiehuanXuanfuqiuMoshi(enabled) {
  if (!mainWindow || mainWindow.isDestroyed() || !xuanfuqiuWindow || xuanfuqiuWindow.isDestroyed()) return
  isXuanfuqiuMoshi = Boolean(enabled)
  if (isXuanfuqiuMoshi) {
    await dengdaiXuanfuqiuWindowReady()
    const workArea = screen.getPrimaryDisplay().workArea
    positionXuanfuqiuWindow({
      x: workArea.x + shouqikouMargin,
      y: workArea.y + workArea.height - shouqikouMargin - shouqikouWindowSize.height,
    })
    mainWindow.hide()
    xuanfuqiuWindow.setIgnoreMouseEvents(true, { forward: true })
    xuanfuqiuWindow.showInactive()
    xuanfuqiuWindow.webContents.send(ipcTongdao.floatingWindowShown)
  } else {
    xuanfuqiuWindow.hide()
    positionMainWindow()
    shezhiMainIslandWindowShape()
    mainWindow.setIgnoreMouseEvents(false)
    mainWindow.showInactive()
  }
}

// 主灵动岛与开机窗口共用完整页面，开机窗口仅展示加载动画。
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

// 悬浮球使用独立入口，避免解析资料库、Lottie 与主界面组件。
function loadXuanfuqiuWindow(win) {
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(new URL('/floating.html', process.env.VITE_DEV_SERVER_URL).toString())
    return
  }
  win.loadFile(path.join(__dirname, '..', 'dist', 'floating.html'))
}

// 将标准位图与文件引用图片统一为 PNG，收集箱与归档流程始终只处理一种图片格式。
function chuangjianJiantiebanTupianJieguo(image, title, captureTimestamp, captureType) {
  if (!image || image.isEmpty()) return null
  const imageData = image.toPNG()
  if (!imageData.length) return null
  const imageSize = image.getSize()
  const imagePreviewData = imageSize.width > 560
    ? image.resize({ width: 560, quality: 'good' }).toPNG()
    : imageData
  const result = library.tianjiaJiantiebanItem({
    type: 'image',
    title: `${title} · ${geshiJiantiebanBuhuoShijian(captureTimestamp)}`,
    imageData,
    imagePreviewData,
    contentHash: huoquNeirongZhizhen(imageData),
  })
  return { ...result, captureType }
}

function guifanJiantiebanFilePaths(rawPaths) {
  return [...new Set(rawPaths
    .flatMap((rawPath) => String(rawPath ?? '').split('\0'))
    .map((rawPath) => rawPath.trim())
    .filter((rawPath) => path.isAbsolute(rawPath)))]
}

// 仅在剪贴板声明了文件引用时查询 Windows DataObject，避免普通文本捕获额外创建原生进程。
// 解析 Windows 的 DROPFILES 二进制结构，优先在 Electron 主进程内获得真实文件路径。
function jiexiWindowsFileDropBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) return []
  const pathOffset = buffer.readUInt32LE(0)
  const isWideChar = buffer.readUInt32LE(16) !== 0
  if (pathOffset < 20 || pathOffset >= buffer.length) return []
  const encoding = isWideChar ? 'utf16le' : 'latin1'
  return buffer.subarray(pathOffset).toString(encoding).split('\0')
}

// Electron 可直接读取的 Windows 文件引用路径。
function huoquElectronJiantiebanFilePaths() {
  const formats = clipboard.availableFormats()
  const fileDropFormat = formats.find((format) => /^FileDrop$/i.test(format))
  const filenameFormat = formats.find((format) => /^FileNameW$/i.test(format))
    ?? formats.find((format) => /^FileName$/i.test(format))
  if (!fileDropFormat && !filenameFormat) return []

  const rawPaths = []
  if (fileDropFormat) {
    try {
      rawPaths.push(...jiexiWindowsFileDropBuffer(clipboard.readBuffer(fileDropFormat)))
    } catch {}
  }
  // FileNameW 是部分聊天软件提供的兼容格式，仅在 FileDrop 不可用时作为补充。
  if (!filenameFormat) return guifanJiantiebanFilePaths(rawPaths)
  try {
    const encoding = /W$/i.test(filenameFormat) ? 'utf16le' : 'latin1'
    rawPaths.push(clipboard.readBuffer(filenameFormat).toString(encoding))
  } catch {}
  try {
    rawPaths.push(clipboard.read(filenameFormat))
  } catch {}

  return guifanJiantiebanFilePaths(rawPaths)
}

// 常驻 STA 进程读取 Windows DataObject，避免每次捕获都启动 PowerShell。
function chushihuaWindowsJiantiebanHelper() {
  if (process.platform !== 'win32' || jiantiebanWindowsClipboardHelper) return jiantiebanWindowsClipboardHelper
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Windows.Forms',
    '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    'while (($command = [Console]::In.ReadLine()) -ne $null) {',
    '  if ($command -ne "read-file-paths") { continue }',
    '  try {',
    '    $clipboardData = [System.Windows.Forms.Clipboard]::GetDataObject()',
    '    $paths = @()',
    '    foreach ($format in @("FileDrop", "FileNameW", "FileName")) {',
    '      $value = $clipboardData.GetData($format, $true)',
    '      if ($value -is [System.Array]) { $paths += $value }',
    '      elseif ($value -is [string]) { $paths += $value }',
    '    }',
    '    $result = @{ paths = @($paths | Where-Object { $_ -is [string] }) }',
    '  } catch { $result = @{ paths = @() } }',
    '  [Console]::Out.WriteLine(($result | ConvertTo-Json -Compress))',
    '  [Console]::Out.Flush()',
    '}',
  ].join('\n')
  const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  const helper = { child, output: '', pending: null }
  jiantiebanWindowsClipboardHelper = helper
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => chuliWindowsJiantiebanHelperOutput(helper, chunk))
  child.once('error', () => guanbiWindowsJiantiebanHelper(helper))
  child.once('exit', () => guanbiWindowsJiantiebanHelper(helper))
  return helper
}

function chuliWindowsJiantiebanHelperOutput(helper, chunk) {
  helper.output += chunk
  const lineBreakIndex = helper.output.indexOf('\n')
  if (lineBreakIndex < 0 || !helper.pending) return
  const line = helper.output.slice(0, lineBreakIndex).trim()
  helper.output = helper.output.slice(lineBreakIndex + 1)
  const pending = helper.pending
  helper.pending = null
  clearTimeout(pending.timeout)
  try {
    const result = JSON.parse(line || '{}')
    pending.resolve(guifanJiantiebanFilePaths(result.paths ?? []))
  } catch {
    pending.resolve([])
  }
}

function guanbiWindowsJiantiebanHelper(helper = jiantiebanWindowsClipboardHelper) {
  if (!helper) return
  if (helper.pending) {
    clearTimeout(helper.pending.timeout)
    helper.pending.resolve([])
    helper.pending = null
  }
  if (jiantiebanWindowsClipboardHelper === helper) jiantiebanWindowsClipboardHelper = null
}

function tingzhiWindowsJiantiebanHelper() {
  const helper = jiantiebanWindowsClipboardHelper
  guanbiWindowsJiantiebanHelper(helper)
  helper?.child.kill()
}

// Electron 未暴露 FileDrop 时，从已预热的 Windows STA 剪贴板助手获取虚拟文件路径。
async function huoquWindowsJiantiebanFilePaths() {
  const helper = chushihuaWindowsJiantiebanHelper()
  if (!helper || helper.pending) return []
  return new Promise((resolve) => {
    const pending = {
      resolve,
      timeout: setTimeout(() => {
        if (helper.pending !== pending) return
        guanbiWindowsJiantiebanHelper(helper)
        helper.child.kill()
      }, 600),
    }
    helper.pending = pending
    try {
      helper.child.stdin.write('read-file-paths\n')
    } catch {
      guanbiWindowsJiantiebanHelper(helper)
    }
  })
}

// 优先使用 Electron 接口，只有无法取得路径时才调用 Windows 原生回退读取。
async function huoquJiantiebanFilePaths(allowWindowsFallback = false) {
  const electronPaths = huoquElectronJiantiebanFilePaths()
  return electronPaths.length || !allowWindowsFallback ? electronPaths : huoquWindowsJiantiebanFilePaths()
}

// 文件引用只接受普通本地图片，避免虚拟对象或超大文件占用常驻进程内存。
async function buhuoJiantiebanFileImage(captureTimestamp, allowWindowsFallback = false) {
  const maxImageFileBytes = 100 * 1024 * 1024
  for (const filePath of await huoquJiantiebanFilePaths(allowWindowsFallback)) {
    if (!jiantiebanImageExts.has(path.extname(filePath).toLowerCase())) continue
    try {
      const fileStat = await fsp.lstat(filePath)
      if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > maxImageFileBytes) continue
      const image = nativeImage.createFromPath(filePath)
      const title = path.basename(filePath, path.extname(filePath)).trim() || '剪贴板图片'
      const result = chuangjianJiantiebanTupianJieguo(image, title, captureTimestamp, '图片文件')
      if (result) return result
    } catch {}
  }
  return null
}

// 单次图片读取统一处理位图和 Windows 文件引用两种剪贴板格式。
async function buhuoJiantiebanTupian(captureTimestamp, allowWindowsFallback = false) {
  const screenshotResult = chuangjianJiantiebanTupianJieguo(
    clipboard.readImage(),
    '剪贴板截图',
    captureTimestamp,
    '截图',
  )
  if (screenshotResult) return screenshotResult
  return buhuoJiantiebanFileImage(captureTimestamp, allowWindowsFallback)
}

function chuangjianJiantiebanWenbenJieguo(content, captureTimestamp) {
  const maxClipboardNoteLength = 200000
  if (/^https?:\/\//i.test(content)) {
    const result = library.tianjiaJiantiebanItem({
      type: 'url',
      title: huoquJiantiebanLianjieBiaoti(content, captureTimestamp),
      sourceUrl: content,
      contentHash: huoquNeirongZhizhen(content),
    })
    return { ...result, captureType: '链接' }
  }

  const savedContent = content.slice(0, maxClipboardNoteLength)
  const result = library.tianjiaJiantiebanItem({
    type: 'text',
    title: huoquJiantiebanBijiBiaoti(savedContent, captureTimestamp),
    textContent: savedContent,
    contentHash: huoquNeirongZhizhen(savedContent),
  })
  return {
    ...result,
    captureType: '笔记',
    wasTruncated: content.length > maxClipboardNoteLength,
  }
}

function dengdaiJiantiebanBuhuo(waitMs) {
  return new Promise((resolve) => setTimeout(resolve, waitMs))
}

// 捕获内容先进入收集箱，由用户确认后再归档到资料库。
async function buhuoJiantiebanContent() {
  const captureTimestamp = Date.now()
  const imageResult = await buhuoJiantiebanTupian(captureTimestamp)
  if (imageResult) return imageResult

  const content = clipboard.readText().trim()
  if (content) return chuangjianJiantiebanWenbenJieguo(content, captureTimestamp)

  const windowsImageResult = await buhuoJiantiebanTupian(captureTimestamp, true)
  if (windowsImageResult) return windowsImageResult

  // Windows 在复制虚拟图片文件时会短暂锁定 DataObject；一次点击内补一次短重试。
  await dengdaiJiantiebanBuhuo(120)
  const retryImageResult = await buhuoJiantiebanTupian(captureTimestamp, true)
  if (retryImageResult) return retryImageResult

  const retryContent = clipboard.readText().trim()
  return retryContent
    ? chuangjianJiantiebanWenbenJieguo(retryContent, captureTimestamp)
    : { item: null, xiaoxi: '剪贴板中没有可捕获的内容' }
}

// 归档时才生成临时文件，复用资料库的文件分类、去重和缩略图流程。
async function guidangJiantiebanItems(rawItemIds) {
  const items = library.huoquJiantiebanItemsByIds(rawItemIds)
  const added = []
  const duplicates = []
  const removedIds = []
  const failedIds = []

  for (const item of items) {
    let temporaryPath = ''
    try {
      let result
      if (item.type === 'url') {
        result = await library.importContent({ file: [], url: [item.sourceUrl] })
      } else {
        const extension = item.type === 'image' ? '.png' : '.txt'
        const content = item.type === 'image' ? item.imageData : item.textContent
        temporaryPath = path.join(os.tmpdir(), `aetherdock-clipboard-archive-${item.id}${extension}`)
        await fsp.writeFile(temporaryPath, content)
        result = await library.importContent({
          file: [{
            path: temporaryPath,
            name: path.basename(temporaryPath),
            title: item.title,
            type: item.type === 'image' ? 'image/png' : 'text/plain',
            contentHash: item.contentHash,
          }],
          url: [],
        })
      }
      added.push(...(result?.added ?? []))
      duplicates.push(...(result?.duplicates ?? []))
      if ((result?.added?.length ?? 0) || (result?.duplicates?.length ?? 0)) removedIds.push(item.id)
    } catch {
      failedIds.push(item.id)
    } finally {
      if (temporaryPath) await fsp.rm(temporaryPath, { force: true }).catch(() => {})
    }
  }

  if (removedIds.length) library.shanchuJiantiebanItems(removedIds)
  const websiteIds = [...added.filter(({ type }) => type === 'url').map(({ id }) => id), ...duplicates]
  if (websiteIds.length) yureWebsiteIcons(websiteIds)
  const imageIds = added.filter(({ type }) => type === 'image').map(({ id }) => id)
  if (imageIds.length) {
    setTimeout(() => {
      for (const itemId of imageIds) {
        const item = library.getItemDetail(itemId)
        if (item) void huoquImageThumbnailKey(item, 2).catch(() => {})
      }
    }, 500)
  }
  return { added, duplicates, removedIds, failedIds }
}

function fuzhiJiantiebanItem(itemId) {
  const item = library.huoquJiantiebanItemsByIds([itemId])[0]
  if (!item) return { chenggong: false, xiaoxi: '该剪贴板内容已不存在' }
  if (item.type === 'image') {
    clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(item.imageData)))
  } else {
    clipboard.writeText(item.type === 'url' ? item.sourceUrl : item.textContent)
  }
  return { chenggong: true, xiaoxi: item.type === 'image' ? '截图已复制到剪贴板' : '内容已复制到剪贴板' }
}

// 剪贴板内容仅以摘要命名，避免将完整敏感文本写入资料标题。
function huoquJiantiebanBijiBiaoti(content, timestamp) {
  const firstLine = String(content ?? '')
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 36)
  const prefix = firstLine || '剪贴板笔记'
  return `${prefix} · ${geshiJiantiebanBuhuoShijian(timestamp)}`
}

function huoquJiantiebanLianjieBiaoti(content, timestamp) {
  try {
    return `${new URL(content).hostname} · ${geshiJiantiebanBuhuoShijian(timestamp)}`
  } catch {
    return `剪贴板链接 · ${geshiJiantiebanBuhuoShijian(timestamp)}`
  }
}

function geshiJiantiebanBuhuoShijian(timestamp) {
  const date = new Date(timestamp)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function huoquNeirongZhizhen(content) {
  return createHash('sha256').update(content).digest('hex')
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

function panduanPrivateIpv4(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && [0, 168].includes(b))
    || (a === 198 && [18, 19, 51].includes(b))
    || (a === 203 && b === 0)
}

function panduanPrivateIp(address) {
  if (nodeNet.isIPv4(address)) return panduanPrivateIpv4(address)
  if (!nodeNet.isIPv6(address)) return true
  const normalized = address.toLowerCase().split('%')[0]
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (mappedIpv4) return panduanPrivateIpv4(mappedIpv4)
  // IPv6 仅允许全球单播 2000::/3，并排除文档、Teredo 与 6to4 过渡网段。
  return !/^[23]/.test(normalized)
    || normalized.startsWith('2001:0:')
    || normalized.startsWith('2001:db8:')
    || normalized.startsWith('2002:')
}

async function jiaoyanRemoteUrl(rawUrl, signal) {
  const url = new URL(rawUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('不支持的网络地址')
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new Error('不允许访问本地地址')
  if (signal?.aborted) throw new Error('网络请求已取消')
  let abortHandler
  const abortPromise = new Promise((resolve, reject) => {
    abortHandler = () => reject(new Error('网络请求已取消'))
    signal?.addEventListener('abort', abortHandler, { once: true })
  })
  let addresses
  try {
    addresses = await Promise.race([dns.lookup(hostname, { all: true, verbatim: true }), abortPromise])
  } finally {
    signal?.removeEventListener('abort', abortHandler)
  }
  if (!addresses.length || addresses.some(({ address }) => panduanPrivateIp(address))) throw new Error('不允许访问内网地址')
  return { url, addresses }
}

function huoquRemoteReferer(currentUrl, requestContext = {}) {
  if (currentUrl.protocol !== 'https:') return ''
  const hostname = currentUrl.hostname.toLowerCase()
  const refererRules = [
    { suffix: 'sinaimg.cn', referer: 'https://weibo.com/' },
    { suffix: 'douyinpic.com', referer: 'https://www.douyin.com/' },
    { suffix: 'xhscdn.com', referer: 'https://www.xiaohongshu.com/' },
    { suffix: 'zhimg.com', referer: 'https://www.zhihu.com/' },
  ]
  const matchedRule = refererRules.find(({ suffix }) => hostname === suffix || hostname.endsWith(`.${suffix}`))
  if (matchedRule) return matchedRule.referer
  try {
    const refererUrl = new URL(requestContext.referer || requestContext.sourceUrl || '')
    const refererHostname = refererUrl.hostname.toLowerCase()
    const trustedSiteGroups = [
      ['baidu.com', 'bdstatic.com', 'bcebos.com'],
      ['github.com', 'githubusercontent.com', 'githubassets.com'],
      ['taobao.com', 'tmall.com', 'alicdn.com'],
    ]
    const belongsToDomain = (hostnameValue, domain) => hostnameValue === domain || hostnameValue.endsWith(`.${domain}`)
    const isTrustedSibling = trustedSiteGroups.some((domains) => (
      domains.some((domain) => belongsToDomain(hostname, domain))
      && domains.some((domain) => belongsToDomain(refererHostname, domain))
    ))
    const isSameSite = hostname === refererHostname
      || hostname.endsWith(`.${refererHostname}`)
      || refererHostname.endsWith(`.${hostname}`)
      || isTrustedSibling
    return refererUrl.protocol === 'https:' && isSameSite ? `${refererUrl.origin}/` : ''
  } catch {
    return ''
  }
}

// 将 Pi 助手事件推送到主窗口渲染层。
function piFaSongEvent(event) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.piEvent, event)
}

// 资料库写操作必须经由渲染层确认，模型本身不能绕过此关卡。
function piQingqiuZiliaokuShouquan(payload) {
  const permissionScope = String(payload?.permissionScope ?? payload?.title ?? '').trim()
  if (permissionScope && piChixuZiliaokuShouquanSet.has(permissionScope)) {
    return Promise.resolve({ approved: true, mode: 'always' })
  }
  const requestId = randomUUID()
  return new Promise((resolve) => {
    piZiliaokuShouquanMap.set(requestId, { resolve, permissionScope })
    piFaSongEvent({ type: 'library-approval', requestId, ...payload })
  })
}

// 中止会话或离开页面时拒绝所有待确认操作，避免后台遗留写入请求。
function piQuxiaoZiliaokuShouquan() {
  for (const request of piZiliaokuShouquanMap.values()) request.resolve({ approved: false })
  piZiliaokuShouquanMap.clear()
}

function piLiebiaoJiantieban() {
  return {
    items: library.huoquJiantiebanItems().slice(0, 50).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
    })),
  }
}

function piHuoquZiliaokuTiaomu(itemId) {
  const item = library.getItemDetail(itemId)
  if (!item) return null
  return { id: item.id, title: item.title, type: item.type, storageMode: item.storageMode }
}

async function piGuidangJiantiebanItems(itemIds) {
  const result = await guidangJiantiebanItems(itemIds)
  if (result.removedIds.length && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(ipcTongdao.jiantiebanChanged)
    mainWindow.webContents.send(ipcTongdao.libraryChanged)
  }
  return { chenggong: Boolean(result.removedIds.length), ...result }
}

function piYichuJiantiebanItems(itemIds) {
  const removedIds = library.shanchuJiantiebanItems(itemIds)?.removedIds ?? []
  if (removedIds.length && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.jiantiebanChanged)
  return { chenggong: true, removedIds }
}

async function piChongmingmingZiliaokuTiaomu(itemId, title) {
  const result = await library.renameItem(itemId, title)
  if (result.chenggong && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.libraryChanged)
  return result
}

async function piShanchuZiliaokuTiaomu(itemId) {
  const item = library.getItemDetail(itemId)
  const thumbnailCacheKey = item?.type === 'image' ? huoquThumbnailCacheKey(item) : ''
  const result = await library.deleteItem(itemId)
  if (result.chenggong && thumbnailCacheKey) await shanchuThumbnailCache(thumbnailCacheKey)
  if (result.chenggong && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.libraryChanged)
  return result
}

function piGengxinZiliaokuBiji(itemId, notes) {
  const result = library.setItemNotes(itemId, notes)
  if (result && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.libraryChanged)
  return result ? { chenggong: true, ...result } : { chenggong: false, xiaoxi: '未找到该资料库条目' }
}

// Pi 助手保存知识：写入收集箱，供用户确认后归档，不直接修改资料库文件。
async function piBaocunBiji(payload) {
  const title = String(payload?.title ?? '').trim().slice(0, 120)
  const content = String(payload?.content ?? '').trim()
  const sourceUrl = String(payload?.sourceUrl ?? '').trim()
  const approval = await piQingqiuZiliaokuShouquan({
    title: '允许保存到收集箱？',
    message: `将保存“${title || '未命名内容'}”到收集箱。`,
    detail: sourceUrl ? `来源：${sourceUrl}` : '内容将保存为本地笔记。',
    tone: 'default',
  })
  if (!approval.approved) return { chenggong: false, xiaoxi: '用户未授权保存操作' }
  try {
    let result
    if (sourceUrl) {
      if (!/^https?:\/\//i.test(sourceUrl)) return { chenggong: false, xiaoxi: '来源链接无效' }
      if (!content) {
        result = library.tianjiaJiantiebanItem({
          type: 'url',
          title: title || huoquJiantiebanLianjieBiaoti(sourceUrl, Date.now()),
          sourceUrl,
          contentHash: huoquNeirongZhizhen(sourceUrl),
        })
      } else {
        const textContent = `${content}\n\n来源：${sourceUrl}`
        result = library.tianjiaJiantiebanItem({
          type: 'text',
          title: title || huoquJiantiebanBijiBiaoti(content, Date.now()),
          textContent,
          contentHash: huoquNeirongZhizhen(textContent),
        })
      }
    } else {
      if (!title || !content) return { chenggong: false, xiaoxi: '标题与正文不能为空' }
      result = library.tianjiaJiantiebanItem({
        type: 'text',
        title,
        textContent: content,
        contentHash: huoquNeirongZhizhen(content),
      })
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.jiantiebanChanged)
    return { chenggong: true, title: result.item.title, duplicate: Boolean(result.duplicate) }
  } catch (error) {
    return { chenggong: false, xiaoxi: error?.message ?? '保存失败' }
  }
}

// Pi 仅生成新的 Word 修订副本，再通过资料库受管导入保存，确保原文件始终不被覆盖。
async function piShengchengDocxFuben(payload) {
  const sourceItemId = String(payload?.sourceItemId ?? '').trim()
  const content = String(payload?.content ?? '').trim().slice(0, 80000)
  const sourceItem = library.getItemDetail(sourceItemId)
  if (!sourceItem) return { chenggong: false, xiaoxi: '未找到原始资料库文档' }
  const sourceExtension = path.extname(sourceItem.title || sourceItem.sourcePath || '').toLowerCase()
  if (!['.docx', '.md', '.txt'].includes(sourceExtension)) {
    return { chenggong: false, xiaoxi: '当前支持基于 DOCX、Markdown 或 TXT 生成 Word 修订副本' }
  }
  if (!content) return { chenggong: false, xiaoxi: '修订内容不能为空' }
  if (!(await library.getValidatedItemLocalPath(sourceItem))) return { chenggong: false, xiaoxi: '原始文档不可用或已移动' }

  const rawTitle = String(payload?.title ?? '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim()
  const sourceTitle = path.basename(sourceItem.title || '文档', sourceExtension)
  const title = (rawTitle || `${sourceTitle} - 修订版`).replace(/\.docx$/i, '').trim().slice(0, 100) || 'Word 修订副本'
  const config = library.getConfig()
  if (!config.rootdir || !config.libraryId) return { chenggong: false, xiaoxi: '请先设置资料库目录' }

  if (payload?.yixianShouquan !== true) {
    const approval = await piQingqiuZiliaokuShouquan({
      title: '允许生成 Word 副本？',
      message: `将根据“${sourceItem.title}”创建新的 Word 副本。`,
      detail: `新文件名：${title}.docx\n原始文件不会被修改。`,
      tone: 'default',
    })
    if (!approval.approved) return { chenggong: false, daima: 'user_declined', xiaoxi: '用户已拒绝生成 Word 副本' }
  }

  const temporaryDir = path.join(app.getPath('userData'), 'generated-documents')
  const temporaryPath = path.join(temporaryDir, `${randomUUID()}.docx`)
  try {
    const buffer = await shengchengDocxBuffer({ title, content })
    await fsp.mkdir(temporaryDir, { recursive: true })
    await fsp.writeFile(temporaryPath, buffer, { flag: 'wx' })
    const importResult = await library.importContent({
      file: [{
        path: temporaryPath,
        name: `${title}.docx`,
        title: `${title}.docx`,
        contentHash: createHash('sha256').update(buffer).digest('hex'),
      }],
      url: [],
    })
    const item = importResult.added[0] ?? library.getItemDetail(importResult.duplicates[0])
    if (!item) return { chenggong: false, xiaoxi: '资料库未能保存修订副本' }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.libraryChanged)
    return { chenggong: true, title: item.title.replace(/\.docx$/i, ''), itemId: item.id }
  } catch (error) {
    return { chenggong: false, xiaoxi: error?.message ?? 'Word 修订副本生成失败' }
  } finally {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

// Pi 生成独立 Excel 工作簿，再通过资料库受管导入保存，避免覆盖任何原始资料。
async function piShengchengXlsxGongzuobu(payload) {
  const content = String(payload?.content ?? '').trim().slice(0, 80000)
  if (!content) return { chenggong: false, xiaoxi: '工作簿内容不能为空' }

  const sourceItemId = String(payload?.sourceItemId ?? '').trim()
  const sourceItem = sourceItemId ? library.getItemDetail(sourceItemId) : null
  if (sourceItemId && !sourceItem) return { chenggong: false, xiaoxi: '未找到原始资料库文档' }
  if (sourceItem && !(await library.getValidatedItemLocalPath(sourceItem))) return { chenggong: false, xiaoxi: '原始文档不可用或已移动' }

  const rawTitle = String(payload?.title ?? '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim()
  const sourceExtension = sourceItem ? path.extname(sourceItem.title || sourceItem.sourcePath || '') : ''
  const sourceTitle = sourceItem ? path.basename(sourceItem.title || '资料', sourceExtension) : ''
  const title = (rawTitle || `${sourceTitle || '数据'} 表`).replace(/\.xlsx?$/i, '').trim().slice(0, 100) || 'Excel 工作簿'
  const config = library.getConfig()
  if (!config.rootdir || !config.libraryId) return { chenggong: false, xiaoxi: '请先设置资料库目录' }

  if (payload?.yixianShouquan !== true) {
    const approval = await piQingqiuZiliaokuShouquan({
      title: '允许生成 Excel 工作簿？',
      message: `将创建新的 Excel 工作簿“${title}.xlsx”。`,
      detail: '生成的工作簿会加入资料库，原始资料不会被修改。',
      tone: 'default',
    })
    if (!approval.approved) return { chenggong: false, daima: 'user_declined', xiaoxi: '用户已拒绝生成 Excel 工作簿' }
  }

  const temporaryDir = path.join(app.getPath('userData'), 'generated-documents')
  const temporaryPath = path.join(temporaryDir, `${randomUUID()}.xlsx`)
  try {
    const buffer = await shengchengXlsxBuffer({ title, content })
    await fsp.mkdir(temporaryDir, { recursive: true })
    await fsp.writeFile(temporaryPath, buffer, { flag: 'wx' })
    const importResult = await library.importContent({
      file: [{
        path: temporaryPath,
        name: `${title}.xlsx`,
        title: `${title}.xlsx`,
        contentHash: createHash('sha256').update(buffer).digest('hex'),
      }],
      url: [],
    })
    const item = importResult.added[0] ?? library.getItemDetail(importResult.duplicates[0])
    if (!item) return { chenggong: false, xiaoxi: '资料库未能保存 Excel 工作簿' }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.libraryChanged)
    return { chenggong: true, title: item.title.replace(/\.xlsx$/i, ''), itemId: item.id }
  } catch (error) {
    return { chenggong: false, xiaoxi: error?.message ?? 'Excel 工作簿生成失败' }
  } finally {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

// Pi 生成独立 Markdown 文件并导入资料库，保留模型输出的原始 Markdown 结构。
async function piShengchengMarkdownWenjian(payload) {
  const content = String(payload?.content ?? '').trim().slice(0, 80000)
  if (!content) return { chenggong: false, xiaoxi: 'Markdown 正文不能为空' }

  const rawTitle = String(payload?.title ?? '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim()
  const title = (rawTitle || 'Markdown 文档').replace(/\.md$/i, '').trim().slice(0, 100) || 'Markdown 文档'
  const config = library.getConfig()
  if (!config.rootdir || !config.libraryId) return { chenggong: false, xiaoxi: '请先设置资料库目录' }

  if (payload?.yixianShouquan !== true) {
    const approval = await piQingqiuZiliaokuShouquan({
      title: '允许生成 Markdown 文件？',
      message: `将创建新的 Markdown 文件“${title}.md”。`,
      detail: '生成的文件会加入资料库，不会修改任何原始资料。',
      tone: 'default',
    })
    if (!approval.approved) return { chenggong: false, daima: 'user_declined', xiaoxi: '用户已拒绝生成 Markdown 文件' }
  }

  const temporaryDir = path.join(app.getPath('userData'), 'generated-documents')
  const temporaryPath = path.join(temporaryDir, `${randomUUID()}.md`)
  try {
    const buffer = shengchengMarkdownBuffer({ title, content })
    await fsp.mkdir(temporaryDir, { recursive: true })
    await fsp.writeFile(temporaryPath, buffer, { flag: 'wx' })
    const importResult = await library.importContent({
      file: [{
        path: temporaryPath,
        name: `${title}.md`,
        title: `${title}.md`,
        contentHash: createHash('sha256').update(buffer).digest('hex'),
      }],
      url: [],
    })
    const item = importResult.added[0] ?? library.getItemDetail(importResult.duplicates[0])
    if (!item) return { chenggong: false, xiaoxi: '资料库未能保存 Markdown 文件' }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.libraryChanged)
    return { chenggong: true, title: item.title.replace(/\.md$/i, ''), itemId: item.id }
  } catch (error) {
    return { chenggong: false, xiaoxi: error?.message ?? 'Markdown 文件生成失败' }
  } finally {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

// Pi 生成排版后的 PDF 文件并导入资料库，始终创建新文件而不覆盖原始资料。
async function piShengchengPdfWenjian(payload) {
  const content = String(payload?.content ?? '').trim().slice(0, 80000)
  if (!content) return { chenggong: false, xiaoxi: 'PDF 正文不能为空' }

  const rawTitle = String(payload?.title ?? '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim()
  const title = (rawTitle || 'PDF 文档').replace(/\.pdf$/i, '').trim().slice(0, 100) || 'PDF 文档'
  const config = library.getConfig()
  if (!config.rootdir || !config.libraryId) return { chenggong: false, xiaoxi: '请先设置资料库目录' }

  if (payload?.yixianShouquan !== true) {
    const approval = await piQingqiuZiliaokuShouquan({
      title: '允许生成 PDF 文件？',
      message: `将创建新的 PDF 文件“${title}.pdf”。`,
      detail: '生成的文件会加入资料库，不会修改任何原始资料。',
      tone: 'default',
    })
    if (!approval.approved) return { chenggong: false, daima: 'user_declined', xiaoxi: '用户已拒绝生成 PDF 文件' }
  }

  const temporaryDir = path.join(app.getPath('userData'), 'generated-documents')
  const temporaryPath = path.join(temporaryDir, `${randomUUID()}.pdf`)
  try {
    const buffer = await shengchengPdfBuffer(BrowserWindow, { title, content })
    await fsp.mkdir(temporaryDir, { recursive: true })
    await fsp.writeFile(temporaryPath, buffer, { flag: 'wx' })
    const importResult = await library.importContent({
      file: [{
        path: temporaryPath,
        name: `${title}.pdf`,
        title: `${title}.pdf`,
        contentHash: createHash('sha256').update(buffer).digest('hex'),
      }],
      url: [],
    })
    const item = importResult.added[0] ?? library.getItemDetail(importResult.duplicates[0])
    if (!item) return { chenggong: false, xiaoxi: '资料库未能保存 PDF 文件' }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.libraryChanged)
    return { chenggong: true, title: item.title.replace(/\.pdf$/i, ''), itemId: item.id }
  } catch (error) {
    return { chenggong: false, xiaoxi: error?.message ?? 'PDF 文件生成失败' }
  } finally {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

// Pi 助手读取资料库条目内容：仅接受已索引条目，并经校验后的本地路径读取文本。
async function piDukuLibraryWenjian(rawId) {
  const id = String(rawId ?? '').trim()
  if (!id) return { chenggong: false, xiaoxi: '请提供资料库条目 id' }
  try {
    const item = library.getItemDetail(id)
    if (!item) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
    if (item.type === 'url' || item.storageMode === 'bookmark') {
      return { chenggong: true, type: 'url', title: item.title, content: item.sourceUrl || '' }
    }
    if (item.type === 'image') {
      return { chenggong: true, type: 'image', title: item.title, content: '' }
    }
    const localPath = await library.getValidatedItemLocalPath(item)
    if (!localPath) return { chenggong: false, xiaoxi: '该条目对应的文件不存在或已移动' }
    const stat = await fsp.stat(localPath)
    if (!stat.isFile()) return { chenggong: false, xiaoxi: '该条目不是普通文件' }
    const extension = path.extname(localPath).toLowerCase()

    // PDF 与 Word 提取文本，其余类型仅给提示，避免越权或误读二进制内容。
    if (extension === '.pdf') {
      if (stat.size > 20 * 1024 * 1024) return { chenggong: false, xiaoxi: 'PDF 文件过大，暂不支持读取' }
      const { extractText } = require('unpdf')
      const { text } = await extractText(new Uint8Array(await fsp.readFile(localPath)))
      const content = (Array.isArray(text) ? text.join('\n') : String(text ?? '')).trim()
      return { chenggong: true, type: 'text', title: item.title, content: content.slice(0, 30000) }
    }
    if (extension === '.docx') {
      if (stat.size > 10 * 1024 * 1024) return { chenggong: false, xiaoxi: 'Word 文件过大，暂不支持读取' }
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ buffer: await fsp.readFile(localPath) })
      return { chenggong: true, type: 'text', title: item.title, content: String(result?.value ?? '').slice(0, 30000) }
    }
    if (!textPreviewExts.has(extension)) {
      return { chenggong: true, type: 'binary', title: item.title, hint: `该类型（${extension || '未知'}）暂不支持文本读取` }
    }
    if (stat.size > 64 * 1024) return { chenggong: false, xiaoxi: '文件过大，暂不支持直接读取' }
    const content = await fsp.readFile(localPath, 'utf8')
    return { chenggong: true, type: 'text', title: item.title, content: content.slice(0, 30000) }
  } catch (error) {
    return { chenggong: false, xiaoxi: error?.message ?? '读取失败' }
  }
}

// 解码网页 HTML 实体与常见命名实体。
function jiemiWangzhiShiti(text) {
  return String(text ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ensp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&middot;/gi, '·')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => { try { return String.fromCodePoint(parseInt(hex, 16)) } catch { return '' } })
    .replace(/&#(\d+);/g, (_, num) => { try { return String.fromCodePoint(Number(num)) } catch { return '' } })
}

// 按内容类型声明的字符集解码网页字节，避免 GBK 页面乱码。
function jiemiWangzhiBuffer(buffer, contentType) {
  const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(String(contentType ?? ''))?.[1]?.toLowerCase()
  if (charset && charset !== 'utf-8' && charset !== 'utf8') {
    try {
      return new TextDecoder(charset).decode(buffer)
    } catch {
      return buffer.toString('utf8')
    }
  }
  return buffer.toString('utf8')
}

function tiquWangzhiBiaoti(html) {
  return jiemiWangzhiShiti(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html ?? ''))?.[1]).trim().slice(0, 120)
}

// 将网页 HTML 压缩为可读文本：去除脚本样式，块级标签换行，折叠空白。
function tiquWangzhiWenben(html) {
  const cleaned = String(html ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|iframe|svg|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|title)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  return jiemiWangzhiShiti(cleaned)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function panduanKetiQuWenbenMimeType(mimeType) {
  const type = String(mimeType ?? '').toLowerCase()
  if (!type) return true
  if (type.startsWith('text/')) return true
  return ['application/json', 'application/xhtml+xml', 'application/xml', 'application/javascript', 'application/x-javascript'].includes(type)
}

// Pi 助手抓取网页正文：只允许公网 http(s)，屏蔽内网/私有地址，限制体积。
async function piZhuawangUrl(rawUrl) {
  const targetUrl = String(rawUrl ?? '').trim()
  if (!/^https?:\/\//i.test(targetUrl)) return { chenggong: false, xiaoxi: '请提供 http(s) 链接' }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  let response = null
  try {
    const result = await qingqiuRemoteResource(targetUrl, controller.signal, { useSessionNetwork: true })
    response = result.response
    if (!response.ok) return { chenggong: false, xiaoxi: `网页返回 ${response.status}` }
    const contentType = response.header('content-type') || ''
    if (!panduanKetiQuWenbenMimeType(contentType.split(';')[0].trim())) {
      return { chenggong: false, xiaoxi: '该链接返回的是图片/文件等二进制内容，无法提取文本' }
    }
    const maxBytes = 2 * 1024 * 1024
    const chunks = []
    let total = 0
    for await (const chunk of response.body ?? []) {
      const buffer = Buffer.from(chunk)
      total += buffer.length
      if (total > maxBytes) {
        chunks.push(buffer.subarray(0, Math.max(0, maxBytes - (total - buffer.length))))
        break
      }
      chunks.push(buffer)
    }
    const html = jiemiWangzhiBuffer(Buffer.concat(chunks), contentType)
    const content = tiquWangzhiWenben(html).slice(0, 20000)
    if (!content) return { chenggong: false, xiaoxi: '未能从网页提取到文本内容' }
    return { chenggong: true, title: tiquWangzhiBiaoti(html), content }
  } catch (error) {
    if (controller.signal.aborted) return { chenggong: false, xiaoxi: '抓取超时' }
    return { chenggong: false, xiaoxi: error?.message ?? '抓取失败' }
  } finally {
    clearTimeout(timeout)
    response?.destroy()
  }
}

// 创建常驻托盘入口，窗口不在任务栏出现时仍可让用户退出程序。
function createTuopan() {
  const iconPath = path.join(__dirname, 'assets', 'aetherdock-icon-brand.ico')
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) throw new Error('托盘图标加载失败')
  tuopan = new Tray(icon)
  tuopan.setToolTip('AetherDock')
  tuopan.setContextMenu(Menu.buildFromTemplate([
    { label: 'AetherDock', enabled: false },
    { type: 'separator' },
    { label: '退出 AetherDock', click: () => app.quit() },
  ]))
}

function huoquLoginItemOptions() {
  return app.isPackaged
    ? {}
    : { path: process.execPath, args: [path.resolve(__dirname, '..')] }
}

function huoquAppInfo() {
  const isSupportedPlatform = ['win32', 'darwin'].includes(process.platform)
  const autoLaunchSupported = isSupportedPlatform && app.isPackaged
  let autoLaunchEnabled = false
  if (autoLaunchSupported) {
    try {
      const loginItemSettings = app.getLoginItemSettings(huoquLoginItemOptions())
      autoLaunchEnabled = typeof loginItemSettings.executableWillLaunchAtLogin === 'boolean'
        ? loginItemSettings.executableWillLaunchAtLogin
        : loginItemSettings.openAtLogin
    } catch {}
  }
  const autoLaunchUnavailableReason = autoLaunchSupported ? '' : app.isPackaged ? 'platform' : 'development'
  return { version: app.getVersion(), autoLaunchSupported, autoLaunchEnabled, autoLaunchUnavailableReason, appGengxinInfo }
}

function shezhiAutoLaunch(enabled) {
  if (!huoquAppInfo().autoLaunchSupported) return { chenggong: false, ...huoquAppInfo() }
  try {
    app.setLoginItemSettings({ ...huoquLoginItemOptions(), openAtLogin: Boolean(enabled) })
    return { chenggong: true, ...huoquAppInfo() }
  } catch {
    return { chenggong: false, ...huoquAppInfo() }
  }
}

// 缓存启动检查结果，并同步给已打开的设置页显示版本提示。
function gengxinAppGengxinInfo(info) {
  appGengxinInfo = { ...appGengxinInfo, ...info }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ipcTongdao.appUpdateInfoChanged, appGengxinInfo)
}

// 将 Release 标签规范为可比较的三段版本号，仅接受正式发布版本。
function jiexianAppVersion(rawVersion) {
  const version = String(rawVersion ?? '').trim().replace(/^v/i, '')
  const matched = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!matched) return null
  return matched.slice(1).map(Number)
}

function panduanAppVersionGengxin(latestVersion, currentVersion) {
  const latestParts = jiexianAppVersion(latestVersion)
  const currentParts = jiexianAppVersion(currentVersion)
  if (!latestParts || !currentParts) return false
  for (let index = 0; index < latestParts.length; index += 1) {
    if (latestParts[index] !== currentParts[index]) return latestParts[index] > currentParts[index]
  }
  return false
}

// 将更新检查状态保存在用户目录，应用重启后仍可避免重复请求 GitHub。
function huoquGengxinJianchaStatePath() {
  return path.join(app.getPath('userData'), 'update-check-state.json')
}

async function duquGengxinJianchaState() {
  if (gengxinJianchaStateReadyPromise) return gengxinJianchaStateReadyPromise
  gengxinJianchaStateReadyPromise = (async () => {
    try {
      const content = await fsp.readFile(huoquGengxinJianchaStatePath(), 'utf8')
      const savedState = JSON.parse(content)
      const lastSuccessAt = Number(savedState?.lastSuccessAt)
      const retryAt = Number(savedState?.retryAt)
      gengxinJianchaState.lastSuccessAt = Number.isFinite(lastSuccessAt) && lastSuccessAt > 0 ? lastSuccessAt : 0
      gengxinJianchaState.retryAt = Number.isFinite(retryAt) && retryAt > 0 ? retryAt : 0
    } catch {}
  })()
  return gengxinJianchaStateReadyPromise
}

async function baocunGengxinJianchaState() {
  try {
    await fsp.writeFile(huoquGengxinJianchaStatePath(), JSON.stringify(gengxinJianchaState), 'utf8')
  } catch {}
}

async function jiluGengxinJianchaChenggong() {
  await duquGengxinJianchaState()
  gengxinJianchaState.lastSuccessAt = Date.now()
  gengxinJianchaState.retryAt = 0
  await baocunGengxinJianchaState()
}

async function jiluGengxinXianliu(retryAt) {
  await duquGengxinJianchaState()
  gengxinJianchaState.retryAt = Math.max(Date.now() + gengxinXianliuBaodiDengdaiMs, retryAt || 0)
  await baocunGengxinJianchaState()
}

function huoquGengxinXianliuTishi(retryAt) {
  const retryTime = new Date(retryAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `更新服务请求过于频繁，请于 ${retryTime} 后再试`
}

async function panduanGengxinJianchaKeFouZhixing(shiShoudong) {
  await duquGengxinJianchaState()
  const now = Date.now()
  if (gengxinJianchaState.retryAt > now) {
    const xiaoxi = huoquGengxinXianliuTishi(gengxinJianchaState.retryAt)
    gengxinAppGengxinInfo({ isChecking: false, isChecked: true, errorMessage: xiaoxi })
    return { keZhixing: false, xiaoxi }
  }
  if (!shiShoudong && now - gengxinJianchaState.lastSuccessAt < gengxinZidongJianchaJiangeMs) {
    return { keZhixing: false, xiaoxi: '' }
  }
  return { keZhixing: true, xiaoxi: '' }
}

// 优先使用 Retry-After，其次使用 GitHub 限流窗口的重置时间。
function huoquGengxinXianliuRetryAt(headers) {
  const retryAfter = Array.isArray(headers['retry-after']) ? headers['retry-after'][0] : headers['retry-after']
  const retrySeconds = Number(retryAfter)
  if (Number.isFinite(retrySeconds) && retrySeconds >= 0) return Date.now() + retrySeconds * 1000
  const retryDate = Date.parse(retryAfter || '')
  if (Number.isFinite(retryDate) && retryDate > Date.now()) return retryDate
  const resetAt = Number(Array.isArray(headers['x-ratelimit-reset']) ? headers['x-ratelimit-reset'][0] : headers['x-ratelimit-reset']) * 1000
  return Number.isFinite(resetAt) && resetAt > Date.now() ? resetAt : Date.now() + gengxinXianliuBaodiDengdaiMs
}

function panduanGengxinQingqiuXianliu(error) {
  const headers = error?.response?.headers || error?.headers || {}
  const statusCode = Number(error?.statusCode || error?.status || error?.response?.statusCode)
  const remaining = Array.isArray(headers['x-ratelimit-remaining']) ? headers['x-ratelimit-remaining'][0] : headers['x-ratelimit-remaining']
  return statusCode === 429 || (statusCode === 403 && remaining === '0')
}

function huoquGengxinQingqiuHeaders(error) {
  return error?.response?.headers || error?.headers || {}
}

// 仅请求固定的 GitHub Release 接口，避免更新检查引入可控的外部跳转。
function qingqiuGithubLatestRelease() {
  return new Promise((resolve, reject) => {
    const request = https.get(githubReleaseApiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `AetherDock/${app.getVersion()}`,
      },
      timeout: 10000,
    }, (response) => {
      const chunks = []
      let totalLength = 0
      response.on('data', (chunk) => {
        totalLength += chunk.length
        if (totalLength > 1024 * 1024) {
          response.destroy(new Error('更新信息过大'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        if (response.statusCode !== 200) {
          const isQingqiuXianliu = response.statusCode === 429
            || (response.statusCode === 403 && response.headers['x-ratelimit-remaining'] === '0')
          const error = new Error(isQingqiuXianliu ? '更新服务请求过于频繁' : `更新服务暂不可用 (${response.statusCode || 0})`)
          error.code = isQingqiuXianliu ? 'update_rate_limited' : 'update_service_unavailable'
          if (isQingqiuXianliu) error.retryAt = huoquGengxinXianliuRetryAt(response.headers)
          reject(error)
          return
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          reject(new Error('更新信息格式无效'))
        }
      })
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('更新检查超时')))
    request.on('error', reject)
  })
}

function huoquSafeReleaseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    const expectedPath = '/machho18/aether-dock/releases/tag/'
    return url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith(expectedPath)
      ? url.toString()
      : githubReleasePageUrl
  } catch {
    return githubReleasePageUrl
  }
}

// 仅允许通过 https 打开外部链接，避免渲染层触发任意协议或本地路径。
function huoquSafeExternalUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl ?? '').trim())
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

// 开发环境仍可验证 GitHub Release 的版本信息，启动检查受本地冷却时间控制。
async function jianchaGithubAppGengxin({ shiShoudong = false, yiJianyan = false } = {}) {
  if (zhengzaiGithubGengxinJianchaPromise) return zhengzaiGithubGengxinJianchaPromise
  zhengzaiGithubGengxinJianchaPromise = (async () => {
    if (!yiJianyan) {
      const jianchaJieguo = await panduanGengxinJianchaKeFouZhixing(shiShoudong)
      if (!jianchaJieguo.keZhixing) return { chenggong: false, xiaoxi: jianchaJieguo.xiaoxi, yiLue: !jianchaJieguo.xiaoxi }
    }
    const currentVersion = app.getVersion()
    gengxinAppGengxinInfo({ isChecking: true, isChecked: false, isDownloading: false, downloadPercent: 0, isDownloaded: false, errorMessage: '' })
    try {
      const release = await qingqiuGithubLatestRelease()
      const latestVersion = String(release?.tag_name ?? '').trim().replace(/^v/i, '')
      if (!jiexianAppVersion(latestVersion)) {
        gengxinAppGengxinInfo({ hasUpdate: false, latestVersion: '', isChecking: false, isChecked: true, isDownloading: false, downloadPercent: 0, errorMessage: '未获取到有效的正式版本' })
        return { chenggong: false, xiaoxi: '未获取到有效的正式版本' }
      }
      const hasUpdate = panduanAppVersionGengxin(latestVersion, currentVersion)
      gengxinAppGengxinInfo({ hasUpdate, latestVersion, isChecking: false, isChecked: true, isDownloading: false, downloadPercent: 0, errorMessage: '' })
      await jiluGengxinJianchaChenggong()
      return {
        chenggong: true,
        hasUpdate,
        currentVersion,
        latestVersion,
        releaseUrl: huoquSafeReleaseUrl(release?.html_url),
      }
    } catch (error) {
      // GitHub 限流与网络故障分别提示，避免用户误判为本地网络异常。
      const isQingqiuXianliu = error?.code === 'update_rate_limited' || panduanGengxinQingqiuXianliu(error)
      if (isQingqiuXianliu) await jiluGengxinXianliu(error.retryAt || huoquGengxinXianliuRetryAt(huoquGengxinQingqiuHeaders(error)))
      const xiaoxi = isQingqiuXianliu ? huoquGengxinXianliuTishi(gengxinJianchaState.retryAt) : '无法连接更新服务，请检查网络后重试'
      gengxinAppGengxinInfo({ isChecking: false, isChecked: true, isDownloading: false, downloadPercent: 0, errorMessage: xiaoxi })
      return { chenggong: false, xiaoxi }
    }
  })()
  try {
    return await zhengzaiGithubGengxinJianchaPromise
  } finally {
    zhengzaiGithubGengxinJianchaPromise = null
  }
}

// 安装版检查更新后自动下载，下载进度仅同步至设置页的检查更新区域。
async function jianchaAppGengxin() {
  const jianchaJieguo = await panduanGengxinJianchaKeFouZhixing(true)
  if (!jianchaJieguo.keZhixing) return { chenggong: false, xiaoxi: jianchaJieguo.xiaoxi }
  if (isKaifaHuanjing) return jianchaGithubAppGengxin({ shiShoudong: true, yiJianyan: true })
  gengxinAppGengxinInfo({ isChecking: true, isChecked: false, isDownloading: false, downloadPercent: 0, isDownloaded: false, errorMessage: '' })
  try {
    autoUpdater.autoDownload = true
    const updateResult = await autoUpdater.checkForUpdates()
    const latestVersion = String(updateResult?.updateInfo?.version ?? '').trim()
    if (!jiexianAppVersion(latestVersion)) {
      gengxinAppGengxinInfo({ hasUpdate: false, latestVersion: '', isChecking: false, isChecked: true, isDownloading: false, downloadPercent: 0, errorMessage: '未获取到有效的正式版本' })
      return { chenggong: false, xiaoxi: '未获取到有效的正式版本' }
    }
    const hasUpdate = panduanAppVersionGengxin(latestVersion, app.getVersion())
    gengxinAppGengxinInfo({ hasUpdate, latestVersion, isChecking: false, isChecked: true, isDownloading: hasUpdate, downloadPercent: 0, errorMessage: '' })
    await jiluGengxinJianchaChenggong()
    return {
      chenggong: true,
      hasUpdate,
      currentVersion: app.getVersion(),
      latestVersion,
      autoDownload: true,
    }
  } catch (error) {
    const isQingqiuXianliu = panduanGengxinQingqiuXianliu(error)
    if (isQingqiuXianliu) await jiluGengxinXianliu(huoquGengxinXianliuRetryAt(huoquGengxinQingqiuHeaders(error)))
    const xiaoxi = isQingqiuXianliu ? huoquGengxinXianliuTishi(gengxinJianchaState.retryAt) : '检查更新失败，请检查网络后重试'
    gengxinAppGengxinInfo({ isChecking: false, isChecked: true, isDownloading: false, downloadPercent: 0, errorMessage: xiaoxi })
    return { chenggong: false, xiaoxi }
  }
}

// 下载完成后再提供安装选择，避免将下载进度分散到系统弹窗中。
async function tishiGengxinDownloadWancheng(updateInfo) {
  if (isGengxinDialogShowing) return
  isGengxinDialogShowing = true
  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已下载',
      message: `AetherDock ${updateInfo.version} 已准备就绪`,
      detail: '更新将在退出应用时自动安装，也可以现在重启完成更新。',
      buttons: ['稍后', '立即重启更新'],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
    })
    if (response === 1) autoUpdater.quitAndInstall(false, true)
  } finally {
    isGengxinDialogShowing = false
  }
}

// 自动更新器仅在安装版启用，开发调试不会下载或覆盖本地应用。
function chushihuaAutoUpdater() {
  if (isKaifaHuanjing || isAutoUpdaterInitialized) return
  isAutoUpdaterInitialized = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('download-progress', (progress) => {
    gengxinAppGengxinInfo({ isDownloading: true, downloadPercent: Math.round(progress.percent), isDownloaded: false, errorMessage: '' })
  })
  autoUpdater.on('update-downloaded', (updateInfo) => {
    gengxinAppGengxinInfo({ isDownloading: false, downloadPercent: 100, isDownloaded: true, errorMessage: '' })
    void tishiGengxinDownloadWancheng(updateInfo)
  })
  autoUpdater.on('error', () => gengxinAppGengxinInfo({ isDownloading: false, errorMessage: '下载失败，请检查网络后重试' }))
}

function chuangjianRemoteRequestHeaders(currentUrl, requestContext = {}) {
  const referer = huoquRemoteReferer(currentUrl, requestContext)
  return {
    Accept: requestContext.accept || 'image/*,application/pdf,text/plain,application/octet-stream;q=0.8,*/*;q=0.5',
    'Accept-Encoding': 'identity',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
    'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/${process.versions.chrome} Safari/537.36`,
    ...(referer ? { Referer: referer } : {}),
  }
}

async function qingqiuPinnedRemoteResponse(currentUrl, addresses, signal, requestContext) {
  let lastError
  for (const address of addresses) {
    if (signal?.aborted) throw new Error('网络请求已取消')
    try {
      return await new Promise((resolve, reject) => {
        const request = (currentUrl.protocol === 'https:' ? https : http).request(currentUrl, {
          method: 'GET',
          signal,
          headers: chuangjianRemoteRequestHeaders(currentUrl, requestContext),
          lookup: (hostname, options, callback) => {
            if (options.all) {
              callback(null, [address])
              return
            }
            callback(null, address.address, address.family)
          },
        }, resolve)
        if (requestContext.addressTimeoutMs) {
          request.setTimeout(requestContext.addressTimeoutMs, () => request.destroy(new Error('网络连接超时')))
        }
        request.on('error', reject)
        request.end()
      })
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    }
  }
  throw lastError || new Error('网络连接失败')
}

function zhuangpeiNodeRemoteResponse(response) {
  response.status = response.statusCode ?? 0
  response.ok = response.status >= 200 && response.status < 300
  response.body = response
  response.header = (name) => {
    const value = response.headers[name.toLowerCase()]
    return Array.isArray(value) ? value[0] : value || ''
  }
  return response
}

function zhuangpeiSessionRemoteResponse(fetchResponse) {
  const body = fetchResponse.body
  return {
    status: fetchResponse.status,
    ok: fetchResponse.ok,
    body,
    header: (name) => fetchResponse.headers.get(name) || '',
    destroy: () => { void body?.cancel().catch(() => {}) },
    async *[Symbol.asyncIterator]() {
      if (!body) return
      for await (const chunk of body) yield chunk
    },
  }
}

async function qingqiuRemoteResourceDirect(initialTarget, signal, requestContext) {
  let currentTarget = initialTarget
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const { url: currentUrl, addresses } = currentTarget
    const response = zhuangpeiNodeRemoteResponse(
      await qingqiuPinnedRemoteResponse(currentUrl, addresses, signal, requestContext),
    )
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: currentUrl }
    const location = response.header('location')
    response.destroy()
    if (!location || redirectCount === 5) throw new Error('网络资源重定向过多')
    currentTarget = await jiaoyanRemoteUrl(new URL(location, currentUrl).toString(), signal)
  }
  throw new Error('网络资源重定向失败')
}

function panduanSessionProxyAvailable(proxyRules) {
  return String(proxyRules ?? '').split(';').some((rule) => /^(?:PROXY|HTTPS|SOCKS(?:4|5)?)\s+/i.test(rule.trim()))
}

async function qingqiuRemoteResourceWithSession(initialTarget, signal, requestContext) {
  let currentTarget = initialTarget
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const currentUrl = currentTarget.url
    const fetchResponse = await electronNet.fetch(currentUrl.toString(), {
      method: 'GET',
      signal,
      redirect: 'manual',
      credentials: 'omit',
      headers: chuangjianRemoteRequestHeaders(currentUrl, requestContext),
    })
    const response = zhuangpeiSessionRemoteResponse(fetchResponse)
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: currentUrl }
    const location = response.header('location')
    response.destroy()
    if (!location || redirectCount === 5) throw new Error('网络资源重定向过多')
    currentTarget = await jiaoyanRemoteUrl(new URL(location, currentUrl).toString(), signal)
  }
  throw new Error('网络资源重定向失败')
}

async function qingqiuRemoteResource(rawUrl, signal, requestContext = {}) {
  const initialTarget = await jiaoyanRemoteUrl(rawUrl, signal)
  let canUseSessionNetwork = false
  if (requestContext.useSessionNetwork) {
    try {
      const proxyRules = await session.defaultSession.resolveProxy(initialTarget.url.toString())
      canUseSessionNetwork = panduanSessionProxyAvailable(proxyRules)
    } catch {}
  }

  if (canUseSessionNetwork) {
    try {
      return await qingqiuRemoteResourceWithSession(initialTarget, signal, requestContext)
    } catch (error) {
      if (signal?.aborted) throw error
    }
  }
  return qingqiuRemoteResourceDirect(initialTarget, signal, requestContext)
}

function tiquRemoteFilename(response, finalUrl, mimeType) {
  const disposition = response.header('content-disposition')
  const encodedFilename = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(disposition)?.[1]
  const plainFilename = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition)?.[1]
  let filename = encodedFilename || plainFilename || path.basename(finalUrl.pathname)
  try { filename = decodeURIComponent(filename.replace(/^"|"$/g, '')) } catch {}
  filename = path.basename(filename || 'download')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'download'
  if (remoteMimeExtensions.has(mimeType)) {
    const expectedExtension = remoteMimeExtensions.get(mimeType)
    const currentExtension = path.extname(filename)
    const acceptsJpegAlias = mimeType === 'image/jpeg' && ['.jpg', '.jpeg'].includes(currentExtension.toLowerCase())
    if (!acceptsJpegAlias && currentExtension.toLowerCase() !== expectedExtension) {
      filename = `${path.basename(filename, currentExtension)}${expectedExtension}`
    }
  }
  return filename
}

function panduanRemoteResource(filename, mimeType) {
  if (mimeType === 'text/html' || mimeType === 'application/xhtml+xml') return false
  const extension = path.extname(filename).toLowerCase()
  if (remoteMimeExtensions.has(mimeType)) return true
  if (!mimeType || mimeType === 'application/octet-stream') {
    return remoteImageExts.has(extension) || remoteDocumentExts.has(extension)
  }
  return remoteImageExts.has(extension) || remoteDocumentExts.has(extension)
}

function panduanRemoteFileUrl(rawUrl) {
  try {
    const extension = path.extname(decodeURIComponent(new URL(rawUrl).pathname)).toLowerCase()
    return remoteImageExts.has(extension) || remoteDocumentExts.has(extension)
  } catch {
    return false
  }
}

function normalizeRemoteResource(rawResource) {
  const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value)
  const rawCandidates = Array.isArray(rawResource?.candidates) ? rawResource.candidates : []
  const candidates = [...new Set(rawCandidates.filter(isHttpUrl))].slice(0, 8)
  const sourceUrl = isHttpUrl(rawResource?.sourceUrl) ? rawResource.sourceUrl : candidates[0] || ''
  const referer = isHttpUrl(rawResource?.referer) ? rawResource.referer : ''
  const isXiazaiPreferred = rawResource?.isXiazaiPreferred === true
  return { sourceUrl, referer, candidates, isXiazaiPreferred }
}

function decodeUrlRepeatedly(value) {
  let decoded = String(value ?? '')
  for (let count = 0; count < 2 && /^https?%3a/i.test(decoded); count += 1) {
    try {
      const nextValue = decodeURIComponent(decoded)
      if (nextValue === decoded) break
      decoded = nextValue
    } catch {
      break
    }
  }
  return decoded
}

function panduanBaiduImageDetail(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return url.hostname === 'image.baidu.com' && url.pathname === '/search/detail'
  } catch {
    return false
  }
}

async function duquRemoteText(response, maxBytes = 2 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of response) {
    size += chunk.length
    if (size > maxBytes) {
      response.destroy()
      throw new Error('远程页面过大')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function tiquBaiduMetadataCandidates(html) {
  const jsonText = /<script[^>]*id=["']image-detail-data["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1]?.trim()
  if (!jsonText) return []
  try {
    const payload = JSON.parse(jsonText)
    const data = payload.data ?? payload
    const selectedImage = data.images?.[Number(data.csIndex) || 0]
    if (!selectedImage) return []
    const readUrl = (target, names) => names.map((name) => target?.[name]).find((value) => typeof value === 'string')
    const replaceUrls = Array.isArray(selectedImage.replaceUrl) ? selectedImage.replaceUrl : []
    const setList = Array.isArray(selectedImage.setList) ? selectedImage.setList : []
    return [
      readUrl(selectedImage, ['objurl', 'objURL', 'ObjURL']),
      ...replaceUrls.map((item) => readUrl(item, ['objurl', 'objURL', 'ObjURL'])),
      readUrl(selectedImage, ['thumburl', 'thumbURL', 'thumbUrl']),
      ...setList.map((item) => readUrl(item, ['thumburl', 'thumbURL', 'thumbUrl'])),
    ].filter((url) => typeof url === 'string')
  } catch {
    return []
  }
}

async function jiexiBaiduImageResource(resource, detailUrl, batchSignal) {
  const metadataCandidates = []
  try {
    const encodedObjurl = new URL(detailUrl).searchParams.get('objurl')
    const objurl = decodeUrlRepeatedly(encodedObjurl)
    if (/^https?:\/\//i.test(objurl)) metadataCandidates.push(objurl)
  } catch {}

  const controller = new AbortController()
  const abortFromBatch = () => controller.abort()
  if (batchSignal?.aborted) controller.abort()
  else batchSignal?.addEventListener('abort', abortFromBatch, { once: true })
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const { response } = await qingqiuRemoteResource(detailUrl, controller.signal, { sourceUrl: detailUrl })
    if (response.ok && response.header('content-type').includes('text/html')) {
      metadataCandidates.push(...tiquBaiduMetadataCandidates(await duquRemoteText(response)))
    } else {
      response.destroy()
    }
  } catch {
    // 页面元数据读取失败时仍继续尝试 URL 参数和拖放候选地址。
  } finally {
    clearTimeout(timeout)
    batchSignal?.removeEventListener('abort', abortFromBatch)
  }

  const nonDetailCandidates = resource.candidates.filter((candidate) => !panduanBaiduImageDetail(candidate))
  return [...new Set([...metadataCandidates, ...nonDetailCandidates])].filter((url) => /^https?:\/\//i.test(url))
}

async function jiexiRemoteResource(rawResource, batchSignal) {
  const resource = normalizeRemoteResource(rawResource)
  if (batchSignal?.aborted) return { ...resource, candidates: [] }
  const detailUrl = [resource.sourceUrl, ...resource.candidates].find(panduanBaiduImageDetail)
  const candidates = detailUrl
    ? await jiexiBaiduImageResource(resource, detailUrl, batchSignal)
    : resource.candidates
  return { ...resource, candidates: candidates.slice(0, 12) }
}

async function changshiDownloadRemoteCandidate(rawUrl, requestContext, batchSignal) {
  const existing = library.getItemByUrl(rawUrl)
  if (existing) return { added: [], duplicates: [existing.id], bookmark: false }

  const controller = new AbortController()
  const abortFromBatch = () => controller.abort()
  if (batchSignal?.aborted) controller.abort()
  else batchSignal?.addEventListener('abort', abortFromBatch, { once: true })
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const { response, finalUrl } = await qingqiuRemoteResource(rawUrl, controller.signal, requestContext)
    if (!response.ok || !response.body) {
      response.destroy()
      return { added: [], duplicates: [], bookmark: true }
    }
    const mimeType = response.header('content-type').split(';')[0].trim().toLowerCase()
    const contentEncoding = response.header('content-encoding').trim().toLowerCase()
    if (contentEncoding && contentEncoding !== 'identity') {
      response.destroy()
      return { added: [], duplicates: [], bookmark: true }
    }
    const filename = tiquRemoteFilename(response, finalUrl, mimeType)
    if (!panduanRemoteResource(filename, mimeType)) {
      response.destroy()
      return { added: [], duplicates: [], bookmark: true }
    }
    const contentLength = Number(response.header('content-length')) || 0
    const result = await library.importRemoteContent({
      sourceUrl: finalUrl.toString(),
      filename,
      mimeType,
      contentLength,
      body: response.body,
      maxBytes: maxRemoteFileBytes,
    })
    return { ...result, bookmark: !result.added.length && !result.duplicates.length }
  } catch {
    return { added: [], duplicates: [], bookmark: true }
  } finally {
    clearTimeout(timeout)
    batchSignal?.removeEventListener('abort', abortFromBatch)
  }
}

async function changshiDownloadRemoteResource(rawResource, batchSignal) {
  const normalizedResource = normalizeRemoteResource(rawResource)
  const shouldChangshiDownload = normalizedResource.isXiazaiPreferred
    || normalizedResource.candidates.some(panduanRemoteFileUrl)
  // 普通网页直接保存为书签，只有图片拖拽或明确的文件地址才进入网络下载链路。
  if (!shouldChangshiDownload) {
    return { added: [], duplicates: [], bookmark: true, sourceUrl: normalizedResource.sourceUrl }
  }

  const resource = await jiexiRemoteResource(normalizedResource, batchSignal)
  for (const candidate of resource.candidates) {
    if (batchSignal?.aborted) break
    const result = await changshiDownloadRemoteCandidate(candidate, resource, batchSignal)
    if (!result.bookmark) return result
  }
  return { added: [], duplicates: [], bookmark: true, sourceUrl: resource.sourceUrl }
}

// 快捷方式图标可能带有资源索引，缓存与提取时都需保留这部分信息。
function jiexiShortcutIconInfo(rawIcon) {
  const iconValue = String(rawIcon ?? '').trim().replace(/^"|"$/g, '')
  if (fs.existsSync(iconValue)) return { filePath: iconValue, iconIndex: 0 }
  const withIndex = /^(.*),\s*-?\d+$/.exec(iconValue)
  return {
    filePath: withIndex?.[1]?.trim() || iconValue,
    iconIndex: withIndex ? Number(withIndex[0].slice(withIndex[1].length + 1).trim()) : 0,
  }
}

function jiexiShortcutIconPath(rawIcon) {
  return jiexiShortcutIconInfo(rawIcon).filePath
}

async function huoquShortcutFileVersion(filePath) {
  if (!filePath || !path.isAbsolute(filePath)) return ''
  try {
    const stats = await fsp.stat(filePath)
    return `${stats.size}\0${Math.round(stats.mtimeMs)}`
  } catch {
    return ''
  }
}

async function chuangjianShortcutFingerprint(details, shortcutPath) {
  const parts = [details.target, details.args, details.cwd, details.appUserModelId, details.icon]
    .map((value) => String(value ?? '').trim().toLowerCase())
  const iconPath = jiexiShortcutIconPath(details.icon)
  const fileVersions = await Promise.all([
    huoquShortcutFileVersion(shortcutPath),
    huoquShortcutFileVersion(details.target),
    huoquShortcutFileVersion(iconPath),
  ])
  const content = parts.some(Boolean)
    ? [...parts, ...fileVersions].join('\0')
    : `unreadable\0${shortcutPath.toLowerCase()}\0${fileVersions[0]}`
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
          shortcutFingerprint: await chuangjianShortcutFingerprint(details, shortcutPath),
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
          shortcutFingerprint: await chuangjianShortcutFingerprint({}, shortcutPath),
          sourceScope: source.scope,
          status: 'unreadable',
        })
      }
    }
  }
  return { shortcuts, scannedScopes, unsupported: false }
}

// Electron 在 Windows 最多返回 32px 图标，使用原生接口按 256px 提取程序资源。
async function huoquWindowsShellIconData(filePath, iconIndex = 0) {
  if (process.platform !== 'win32' || !windowsIconResourceExts.has(path.extname(filePath).toLowerCase())) return ''
  const safeIconIndex = Number.isInteger(iconIndex) && iconIndex >= -10000 && iconIndex <= 10000 ? iconIndex : 0
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    "Add-Type -TypeDefinition @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class AetherDockShellIcon {',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]',
    '  public static extern uint PrivateExtractIcons(string fileName, int iconIndex, int width, int height, IntPtr[] icons, uint[] iconIds, uint iconCount, uint flags);',
    '  [DllImport("user32.dll", SetLastError = true)]',
    '  [return: MarshalAs(UnmanagedType.Bool)]',
    '  public static extern bool DestroyIcon(IntPtr icon);',
    '}',
    "'@",
    '$iconHandles = [System.IntPtr[]]::new(1)',
    '$iconIds = [uint32[]]::new(1)',
    '$count = [AetherDockShellIcon]::PrivateExtractIcons($env:AETHERDOCK_ICON_PATH, [int]$env:AETHERDOCK_ICON_INDEX, 256, 256, $iconHandles, $iconIds, 1, 0)',
    'if ($count -lt 1 -or $iconHandles[0] -eq [System.IntPtr]::Zero) { exit 2 }',
    '$stream = [System.IO.MemoryStream]::new()',
    'try {',
    '  $icon = [System.Drawing.Icon]::FromHandle($iconHandles[0])',
    '  $bitmap = $icon.ToBitmap()',
    '  try {',
    '    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)',
    '    [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))',
    '  } finally {',
    '    $bitmap.Dispose(); $icon.Dispose()',
    '  }',
    '} finally {',
    '  $stream.Dispose(); [AetherDockShellIcon]::DestroyIcon($iconHandles[0]) | Out-Null',
    '}',
  ].join('\n')

  try {
    const { stdout } = await zhixingFileAsync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script,
    ], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        AETHERDOCK_ICON_PATH: filePath,
        AETHERDOCK_ICON_INDEX: String(safeIconIndex),
      },
    })
    const base64 = stdout.trim()
    return base64 ? `data:image/png;base64,${base64}` : ''
  } catch {
    return ''
  }
}

// 图标读取可能触发原生接口或 PowerShell，固定并发数避免占满主进程资源。
function xianxingZhixingYingyongIconRenwu(action, priority = 2, taskKey = '') {
  return new Promise((resolve, reject) => {
    yingyongIconRenwuQueue.push({ action, priority, taskKey, sequence: yingyongIconRenwuXuhao++, resolve, reject })
    yingyongIconRenwuQueue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)
    zhixingNextYingyongIconRenwu()
  })
}

function tishengYingyongIconRenwuPriority(taskKey, priority) {
  const task = yingyongIconRenwuQueue.find((currentTask) => currentTask.taskKey === taskKey)
  if (!task || task.priority <= priority) return
  task.priority = priority
  yingyongIconRenwuQueue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)
}

function zhixingNextYingyongIconRenwu() {
  if (isHeavyTasksPaused) return
  while (yingyongIconHuodongRenwu < 2 && yingyongIconRenwuQueue.length) {
    const task = yingyongIconRenwuQueue.shift()
    yingyongIconHuodongRenwu += 1
    // 让出当前事件循环，避免 IPC 内连续启动原生图像任务挤占窗口交互。
    setImmediate(() => {
      if (isHeavyTasksPaused) {
        yingyongIconHuodongRenwu -= 1
        yingyongIconRenwuQueue.push(task)
        yingyongIconRenwuQueue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)
        return
      }
      Promise.resolve()
        .then(task.action)
        .then(task.resolve, task.reject)
        .finally(() => {
          yingyongIconHuodongRenwu -= 1
          zhixingNextYingyongIconRenwu()
        })
    })
  }
}

function huoquYingyongIconCacheKey(item) {
  const sourceKey = /^[a-f\d]{64}$/i.test(item.shortcutFingerprint || '')
    ? item.shortcutFingerprint.toLowerCase()
    : [item.targetPath, item.sourcePath, item.id].map((value) => String(value ?? '').toLowerCase()).join('\0')
  return createHash('sha256')
    .update(`${yingyongIconCacheVersion}\0${sourceKey}`)
    .digest('hex')
}

async function tiquApplicationNativeIcon(item) {
  const iconSources = []
  if (item.sourcePath && fs.existsSync(item.sourcePath)) {
    try {
      const shortcutDetails = shell.readShortcutLink(item.sourcePath)
      iconSources.push(jiexiShortcutIconInfo(shortcutDetails.icon), { filePath: shortcutDetails.target, iconIndex: 0 })
    } catch {}
  }
  iconSources.push({ filePath: item.targetPath, iconIndex: 0 }, { filePath: item.sourcePath, iconIndex: 0 })

  // 优先读取快捷方式显式图标和目标程序，最后才使用 Windows 的通用 .lnk 图标。
  const uniqueIconSources = [...new Map(iconSources
    .filter(({ filePath }) => filePath && fs.existsSync(filePath))
    .map((source) => [`${source.filePath}\0${source.iconIndex}`, source])).values()]
  for (const { filePath, iconIndex } of uniqueIconSources) {
    try {
      const windowsIconData = await huoquWindowsShellIconData(filePath, iconIndex)
      const nativeIcon = windowsIconData
        ? nativeImage.createFromDataURL(windowsIconData)
        : path.extname(filePath).toLowerCase() === '.ico'
          ? nativeImage.createFromPath(filePath)
          : await app.getFileIcon(filePath, { size: 'large' })
      if (nativeIcon.isEmpty()) continue
      return nativeIcon
    } catch {}
  }
  return null
}

function chuangjianYingyongIconUrl(cacheKey) {
  return `aetherdock-icon://${cacheKey}`
}

function huoquMediaCacheVersion(stats) {
  return `${stats.size}\0${stats.mtimeMs}`
}

function jiluMediaCacheVersion(filePath, cacheVersion) {
  mediaCacheYanzhengVersionMap.delete(filePath)
  mediaCacheYanzhengVersionMap.set(filePath, cacheVersion)
  while (mediaCacheYanzhengVersionMap.size > mediaCacheYanzhengMaxSize) {
    mediaCacheYanzhengVersionMap.delete(mediaCacheYanzhengVersionMap.keys().next().value)
  }
}

// PNG 缓存每个版本只解码验证一次，后续命中仅走异步文件状态检查。
async function huoquValidPngCacheStats(filePath) {
  try {
    const stats = await fsp.stat(filePath)
    if (!stats.isFile() || !stats.size) throw new Error('PNG 缓存为空')
    const cacheVersion = huoquMediaCacheVersion(stats)
    if (mediaCacheYanzhengVersionMap.get(filePath) !== cacheVersion) {
      const pngBuffer = await fsp.readFile(filePath)
      if (nativeImage.createFromBuffer(pngBuffer).isEmpty()) throw new Error('PNG 缓存损坏')
    }
    jiluMediaCacheVersion(filePath, cacheVersion)
    return stats
  } catch {
    mediaCacheYanzhengVersionMap.delete(filePath)
    await fsp.rm(filePath, { force: true }).catch(() => {})
    return null
  }
}

async function biaojiMediaCachePathsValid(filePaths) {
  const statsList = await Promise.all(filePaths.map((filePath) => fsp.stat(filePath)))
  filePaths.forEach((filePath, index) => {
    jiluMediaCacheVersion(filePath, huoquMediaCacheVersion(statsList[index]))
  })
}

async function huoquReadyIconCacheUrl(cacheKey) {
  for (const size of [256, 128]) {
    const iconPath = path.join(yingyongIconCacheDir, `${cacheKey}-${size}.png`)
    const iconStats = await huoquValidPngCacheStats(iconPath)
    if (iconStats) return `${chuangjianYingyongIconUrl(cacheKey)}?v=${iconStats.mtimeMs}`
  }
  return ''
}

async function shengchengYingyongIconCache(item, cacheKey) {
  const nativeIcon = await tiquApplicationNativeIcon(item)
  if (!nativeIcon) return false

  return baocunNativeIconCache(nativeIcon, cacheKey)
}

async function baocunNativeIconCache(nativeIcon, cacheKey) {
  const outputPaths = yingyongIconCacheSizes.map((size) => ({
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
    await biaojiMediaCachePathsValid(outputPaths.map(({ finalPath }) => finalPath))
    return true
  } catch {
    await Promise.all(outputPaths.map(({ tempPath }) => fsp.rm(tempPath, { force: true }).catch(() => {})))
    return false
  }
}

async function baocunWebsiteIconCache(iconResource, cacheKey) {
  if (iconResource.type === 'browser') {
    const finalPath = path.join(yingyongIconCacheDir, `${cacheKey}-128.${iconResource.extension}`)
    const tempPath = path.join(yingyongIconCacheDir, `${cacheKey}-128.${process.pid}.${Date.now()}.tmp`)
    try {
      await fsp.writeFile(tempPath, iconResource.buffer, { flag: 'wx' })
      await fsp.rename(tempPath, finalPath)
      await biaojiMediaCachePathsValid([finalPath])
      const stalePaths = [
        ...yingyongIconCacheSizes.map((size) => path.join(yingyongIconCacheDir, `${cacheKey}-${size}.png`)),
        ...websiteBrowserIconExtensions
          .filter((extension) => extension !== iconResource.extension)
          .map((extension) => path.join(yingyongIconCacheDir, `${cacheKey}-128.${extension}`)),
      ]
      await Promise.all(stalePaths.map((stalePath) => fsp.rm(stalePath, { force: true })))
      return true
    } catch {
      await fsp.rm(tempPath, { force: true }).catch(() => {})
      return false
    }
  }

  const saved = await baocunNativeIconCache(iconResource.image, cacheKey)
  if (saved) {
    await Promise.all(websiteBrowserIconExtensions.map((extension) => (
      fsp.rm(path.join(yingyongIconCacheDir, `${cacheKey}-128.${extension}`), { force: true })
    )))
  }
  return saved
}

function huoquWebsiteIconCacheKey(item) {
  try {
    return createHash('sha256').update(new URL(item.sourceUrl).origin.toLowerCase()).digest('hex')
  } catch {
    return ''
  }
}

function jiemaHtmlAttribute(value) {
  return String(value ?? '').replace(/&(?:#(\d+)|#x([a-f\d]+)|(amp|quot|apos|lt|gt));/gi, (match, decimal, hex, name) => {
    const codePoint = decimal ? Number(decimal) : hex ? Number.parseInt(hex, 16) : 0
    if ((decimal || hex) && codePoint >= 0 && codePoint <= 0x10ffff) return String.fromCodePoint(codePoint)
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[name?.toLowerCase()] || match
  })
}

function duquHtmlAttribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return jiemaHtmlAttribute(match?.[1] ?? match?.[2] ?? match?.[3] ?? '')
}

function jiemaWebsiteDataIcon(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > websiteBrowserIconMaxBytes * 1.5) return null
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/is.exec(dataUrl)
  const mimeType = match?.[1]?.trim().toLowerCase()
  if (!mimeType || !websiteDataIconMimeTypes.has(mimeType)) return null
  try {
    const isBase64 = /(?:^|;)base64(?:;|$)/i.test(match[2])
    const buffer = isBase64
      ? Buffer.from(match[3].replace(/\s+/g, ''), 'base64')
      : Buffer.from(decodeURIComponent(match[3]), 'utf8')
    return buffer.length && buffer.length <= websiteBrowserIconMaxBytes ? buffer : null
  } catch {
    return null
  }
}

function guifanWebsiteIconUrl(rawUrl, baseUrl) {
  try {
    const iconUrl = new URL(rawUrl, baseUrl)
    if (['http:', 'https:'].includes(iconUrl.protocol)) return iconUrl
    if (iconUrl.protocol === 'data:' && jiemaWebsiteDataIcon(iconUrl.toString())) return iconUrl
  } catch {}
  return null
}

function tiquWebsiteHeaderIconCandidates(linkHeader, pageUrl) {
  const candidates = []
  for (const match of String(linkHeader ?? '').matchAll(/<([^>]+)>\s*((?:;[^,]*)*)/g)) {
    const relValue = /(?:^|;)\s*rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]+))/i.exec(match[2])
    const rel = (relValue?.[1] ?? relValue?.[2] ?? relValue?.[3] ?? '').toLowerCase().split(/\s+/)
    if (!rel.some((value) => ['icon', 'apple-touch-icon', 'mask-icon', 'fluid-icon'].includes(value))) continue
    const iconUrl = guifanWebsiteIconUrl(match[1], pageUrl)
    if (iconUrl) candidates.push(iconUrl.toString())
  }
  return [...new Set(candidates)].slice(0, 4)
}

function tiquWebsiteFallbackIconUrls(pageUrl) {
  return ['/favicon.ico', '/favicon.svg', '/favicon.png', '/apple-touch-icon.png'].flatMap((pathname) => {
    try { return [new URL(pathname, pageUrl).toString()] } catch { return [] }
  })
}

function huoquWebsiteBaseUrl(html, pageUrl) {
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0]
  if (!baseTag) return pageUrl
  try {
    const baseUrl = new URL(duquHtmlAttribute(baseTag, 'href'), pageUrl)
    return ['http:', 'https:'].includes(baseUrl.protocol) ? baseUrl : pageUrl
  } catch {
    return pageUrl
  }
}

function tiquWebsiteManifestUrls(html, pageUrl) {
  const baseUrl = huoquWebsiteBaseUrl(html, pageUrl)
  const manifestUrls = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = duquHtmlAttribute(tag, 'rel').toLowerCase().split(/\s+/)
    if (!rel.includes('manifest')) continue
    try {
      const manifestUrl = new URL(duquHtmlAttribute(tag, 'href'), baseUrl)
      if (['http:', 'https:'].includes(manifestUrl.protocol)) manifestUrls.push(manifestUrl.toString())
    } catch {}
  }
  return [...new Set(manifestUrls)].slice(0, 2)
}

function tiquManifestIconCandidates(manifestText, manifestUrl) {
  let manifest
  try { manifest = JSON.parse(String(manifestText ?? '').replace(/^\uFEFF/, '')) } catch { return [] }
  if (!Array.isArray(manifest?.icons)) return []
  return manifest.icons.flatMap((icon, sequence) => {
    if (!icon || typeof icon.src !== 'string') return []
    try {
      const iconUrl = guifanWebsiteIconUrl(icon.src, manifestUrl)
      if (!iconUrl) return []
      const sizes = [...String(icon.sizes ?? '').matchAll(/(\d{1,4})x(\d{1,4})/gi)]
        .map((match) => Math.min(Number(match[1]), Number(match[2])))
        .filter((size) => size > 0 && size <= 2048)
      const declaredSize = sizes.length ? Math.max(...sizes) : 0
      const declaredType = String(icon.type ?? '').toLowerCase()
      if (declaredType && !websiteIconMimeTypes.has(declaredType)) return []
      return [{
        url: iconUrl.toString(),
        score: Math.min(declaredSize, 512) * 2
          + (declaredType === 'image/svg+xml' || iconUrl.pathname.toLowerCase().endsWith('.svg') ? 64 : 0)
          + (declaredType === 'image/png' ? 24 : 0),
        sequence,
      }]
    } catch {
      return []
    }
  })
    .sort((first, second) => second.score - first.score || first.sequence - second.sequence)
    .slice(0, 4)
    .map(({ url }) => url)
}

function tiquWebsiteIconCandidates(html, pageUrl) {
  const baseUrl = huoquWebsiteBaseUrl(html, pageUrl)

  const candidates = []
  let sequence = 0
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = duquHtmlAttribute(tag, 'rel').toLowerCase().split(/\s+/)
    const isDeclaredIcon = rel.some((value) => [
      'icon', 'shortcut', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon', 'fluid-icon',
    ].includes(value))
    if (!isDeclaredIcon) continue
    const href = duquHtmlAttribute(tag, 'href')
    try {
      const iconUrl = guifanWebsiteIconUrl(href, baseUrl)
      if (!iconUrl) continue
      const declaredSizes = [...duquHtmlAttribute(tag, 'sizes').matchAll(/(\d{1,4})x(\d{1,4})/gi)]
        .map((match) => Math.min(Number(match[1]), Number(match[2])))
        .filter((size) => size > 0 && size <= 2048)
      const declaredSize = declaredSizes.length ? Math.max(...declaredSizes) : 0
      const declaredType = duquHtmlAttribute(tag, 'type').toLowerCase()
      if (declaredType && !websiteIconMimeTypes.has(declaredType)) continue
      const score = 1000
        + Math.min(declaredSize, 512) * 2
        + (rel.some((value) => value.startsWith('apple-touch-icon')) ? 48 : 0)
        + (declaredType === 'image/svg+xml' || iconUrl.pathname.toLowerCase().endsWith('.svg') ? 64 : 0)
        + (declaredType === 'image/png' ? 24 : 0)
      candidates.push({ url: iconUrl.toString(), score, sequence: sequence++ })
    } catch {}
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = duquHtmlAttribute(tag, 'name').toLowerCase()
    if (!/^msapplication-(?:tileimage|square\d+x\d+logo)$/.test(name)) continue
    const iconUrl = guifanWebsiteIconUrl(duquHtmlAttribute(tag, 'content'), baseUrl)
    if (iconUrl) candidates.push({ url: iconUrl.toString(), score: 1000, sequence: sequence++ })
  }
  const fallbackUrls = tiquWebsiteFallbackIconUrls(pageUrl)
  for (const [index, fallbackUrl] of fallbackUrls.entries()) {
    candidates.push({ url: fallbackUrl, score: 100 - index, sequence: sequence++ })
  }

  // 同一地址仅保留最高质量声明，优先下载矢量、大尺寸 PNG 与触控图标。
  const uniqueCandidates = new Map()
  for (const candidate of candidates) {
    const existing = uniqueCandidates.get(candidate.url)
    if (!existing || candidate.score > existing.score) uniqueCandidates.set(candidate.url, candidate)
  }
  const preferredUrls = [...uniqueCandidates.values()]
    .sort((first, second) => second.score - first.score || first.sequence - second.sequence)
    .filter(({ score }) => score >= 1000)
    .slice(0, websiteIconMaxCandidates - fallbackUrls.length)
    .map(({ url }) => url)
  for (const fallbackUrl of fallbackUrls) {
    if (!preferredUrls.includes(fallbackUrl)) preferredUrls.push(fallbackUrl)
  }
  return preferredUrls.slice(0, websiteIconMaxCandidates)
}

function chuangjianWebsiteRequestSignal(parentSignal, timeoutMs) {
  const controller = new AbortController()
  const abortRequest = () => controller.abort()
  if (parentSignal.aborted) abortRequest()
  else parentSignal.addEventListener('abort', abortRequest, { once: true })
  const timeout = setTimeout(abortRequest, timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      parentSignal.removeEventListener('abort', abortRequest)
    },
  }
}

async function huoquReadyWebsiteIconCacheUrl(cacheKey) {
  const rasterIconUrl = await huoquReadyIconCacheUrl(cacheKey)
  if (rasterIconUrl) return rasterIconUrl

  for (const extension of websiteBrowserIconExtensions) {
    const iconPath = path.join(yingyongIconCacheDir, `${cacheKey}-128.${extension}`)
    try {
      const [iconBuffer, iconStats] = await Promise.all([fsp.readFile(iconPath), fsp.stat(iconPath)])
      const browserIcon = chuangjianSafeWebsiteBrowserIcon(iconBuffer)
      if (!browserIcon || browserIcon.extension !== extension) {
        await fsp.rm(iconPath, { force: true })
        continue
      }
      jiluMediaCacheVersion(iconPath, huoquMediaCacheVersion(iconStats))
      return `${chuangjianYingyongIconUrl(cacheKey)}?v=${iconStats.mtimeMs}`
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      return ''
    }
  }
  return ''
}

async function duquRemoteBuffer(response, maxBytes) {
  const contentLength = Number(response.header('content-length')) || 0
  if (contentLength > maxBytes) {
    response.destroy()
    throw new Error('远程图标过大')
  }
  const chunks = []
  let size = 0
  for await (const chunk of response) {
    size += chunk.length
    if (size > maxBytes) {
      response.destroy()
      throw new Error('远程图标过大')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function huoquRasterImageSize(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let offset = 2
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    if (marker === 0xff || marker === 0x00) {
      offset += 1
      continue
    }
    if (startOfFrameMarkers.has(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) }
    }
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (segmentLength < 2) return null
    offset += segmentLength + 2
  }
  return null
}

function panduanSafeImageSize({ width, height }, maxEdge = 2048, maxPixels = 4 * 1024 * 1024) {
  return width > 0 && height > 0 && width <= maxEdge && height <= maxEdge && width * height <= maxPixels
}

function panduanSafeIco(buffer) {
  if (buffer.length < 22 || buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) return false
  const imageCount = buffer.readUInt16LE(4)
  if (!imageCount || imageCount > 20 || buffer.length < 6 + imageCount * 16) return false
  for (let index = 0; index < imageCount; index += 1) {
    const entryOffset = 6 + index * 16
    const width = buffer[entryOffset] || 256
    const height = buffer[entryOffset + 1] || 256
    const byteLength = buffer.readUInt32LE(entryOffset + 8)
    const dataOffset = buffer.readUInt32LE(entryOffset + 12)
    if (!panduanSafeImageSize({ width, height }, 512, 512 * 512) || !byteLength || dataOffset + byteLength > buffer.length) return false
    const imageData = buffer.subarray(dataOffset, dataOffset + byteLength)
    const rasterSize = huoquRasterImageSize(imageData)
    if (rasterSize && !panduanSafeImageSize(rasterSize, 512, 512 * 512)) return false
    if (!rasterSize) {
      if (imageData.length < 12) return false
      const dibSize = {
        width: Math.abs(imageData.readInt32LE(4)),
        height: Math.ceil(Math.abs(imageData.readInt32LE(8)) / 2),
      }
      if (!panduanSafeImageSize(dibSize, 512, 512 * 512)) return false
    }
  }
  return true
}

// SVG 作为图片展示前仅保留无脚本、无外链、复杂度受限的静态图形。
function chuangjianSafeWebsiteSvgIcon(iconBuffer) {
  if (!Buffer.isBuffer(iconBuffer) || !iconBuffer.length || iconBuffer.length > websiteSvgIconMaxBytes) return null
  let svg = iconBuffer.toString('utf8').replace(/^\uFEFF/, '').trim()
  if (/<!doctype[^>]*\[/i.test(svg) || /<!entity\b/i.test(svg)) return null
  svg = svg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .trim()
  if (!/^<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) return null
  if (/\son[a-z][\w:-]*\s*=/i.test(svg) || /\b(?:javascript|file):/i.test(svg)) return null
  if (/<\s*(?:script|foreignobject|iframe|object|embed|image|audio|video|canvas|style)\b/i.test(svg)) return null
  if (/@import\b|expression\s*\(/i.test(svg)) return null

  for (const match of svg.matchAll(/\b(?:href|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const href = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (href && !href.startsWith('#')) return null
  }
  for (const match of svg.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    if (!match[2].trim().startsWith('#')) return null
  }

  const elementMatches = [...svg.matchAll(/<\s*\/?\s*([a-z][\w:-]*)\b/gi)]
  if (!elementMatches.length || elementMatches.length > 1200) return null
  if (elementMatches.some((match) => !websiteSvgAllowedElements.has(match[1].toLowerCase()))) return null
  return Buffer.from(svg, 'utf8')
}

function huoquGifImageSize(buffer) {
  if (buffer.length < 10 || !['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) return null
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
}

function huoquWebpImageSize(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null
  const chunkType = buffer.toString('ascii', 12, 16)
  if (chunkType === 'VP8X') {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 }
  }
  if (chunkType === 'VP8L' && buffer[20] === 0x2f) {
    return {
      width: 1 + ((buffer[21] | (buffer[22] << 8)) & 0x3fff),
      height: 1 + (((buffer[22] >> 6) | (buffer[23] << 2) | (buffer[24] << 10)) & 0x3fff),
    }
  }
  if (chunkType === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
  }
  return null
}

function chuangjianSafeWebsiteBrowserIcon(iconBuffer) {
  if (!Buffer.isBuffer(iconBuffer) || !iconBuffer.length || iconBuffer.length > websiteBrowserIconMaxBytes) return null
  const svgBuffer = chuangjianSafeWebsiteSvgIcon(iconBuffer)
  if (svgBuffer) return { type: 'browser', extension: 'svg', contentType: 'image/svg+xml', buffer: svgBuffer }

  const gifSize = huoquGifImageSize(iconBuffer)
  if (gifSize && panduanSafeImageSize(gifSize)) {
    return { type: 'browser', extension: 'gif', contentType: 'image/gif', buffer: iconBuffer }
  }
  const webpSize = huoquWebpImageSize(iconBuffer)
  if (webpSize && panduanSafeImageSize(webpSize)) {
    return { type: 'browser', extension: 'webp', contentType: 'image/webp', buffer: iconBuffer }
  }
  return null
}

async function chuangjianSafeWebsiteIcon(iconBuffer, cacheKey) {
  const browserIcon = chuangjianSafeWebsiteBrowserIcon(iconBuffer)
  if (browserIcon) return browserIcon

  const rasterSize = huoquRasterImageSize(iconBuffer)
  if (rasterSize) {
    if (!panduanSafeImageSize(rasterSize)) return null
    const image = nativeImage.createFromBuffer(iconBuffer)
    return image.isEmpty() ? null : { type: 'raster', image }
  }
  if (process.platform !== 'win32' || !panduanSafeIco(iconBuffer)) return null
  const tempPath = path.join(yingyongIconCacheDir, `${cacheKey}.${process.pid}.${Date.now()}.ico`)
  try {
    await fsp.writeFile(tempPath, iconBuffer, { flag: 'wx' })
    const image = nativeImage.createFromPath(tempPath)
    return image.isEmpty() ? null : { type: 'raster', image }
  } finally {
    await fsp.rm(tempPath, { force: true }).catch(() => {})
  }
}

async function tiquWebsiteCandidateIcon(candidate, item, pageUrl, cacheKey, parentSignal) {
  if (/^data:/i.test(candidate)) {
    const iconBuffer = jiemaWebsiteDataIcon(candidate)
    return iconBuffer ? chuangjianSafeWebsiteIcon(iconBuffer, cacheKey) : null
  }
  const requestSignal = chuangjianWebsiteRequestSignal(parentSignal, websiteIconCandidateTimeoutMs)
  try {
    const { response } = await qingqiuRemoteResource(candidate, requestSignal.signal, {
      sourceUrl: pageUrl?.toString() || item.sourceUrl,
      referer: pageUrl?.toString() || item.sourceUrl,
      accept: 'image/svg+xml,image/webp,image/gif,image/png,image/jpeg,image/x-icon,image/vnd.microsoft.icon,application/octet-stream;q=0.8,*/*;q=0.2',
      useSessionNetwork: true,
      addressTimeoutMs: 3000,
    })
    const contentType = response.header('content-type').split(';')[0].trim().toLowerCase()
    if (!response.ok || (contentType && !websiteIconMimeTypes.has(contentType))) {
      response.destroy()
      return null
    }
    const iconBuffer = await duquRemoteBuffer(response, 1024 * 1024)
    return chuangjianSafeWebsiteIcon(iconBuffer, cacheKey)
  } catch {
    return null
  } finally {
    requestSignal.cleanup()
  }
}

async function tiquWebsiteManifestIconUrls(manifestUrl, item, pageUrl, parentSignal) {
  const requestSignal = chuangjianWebsiteRequestSignal(parentSignal, websiteIconCandidateTimeoutMs)
  try {
    const { response, finalUrl } = await qingqiuRemoteResource(manifestUrl, requestSignal.signal, {
      sourceUrl: pageUrl?.toString() || item.sourceUrl,
      referer: pageUrl?.toString() || item.sourceUrl,
      accept: 'application/manifest+json,application/json,text/plain;q=0.8,*/*;q=0.2',
      useSessionNetwork: true,
      addressTimeoutMs: 3000,
    })
    if (!response.ok) {
      response.destroy()
      return []
    }
    const manifestBuffer = await duquRemoteBuffer(response, 512 * 1024)
    return tiquManifestIconCandidates(manifestBuffer.toString('utf8'), finalUrl)
  } catch {
    return []
  } finally {
    requestSignal.cleanup()
  }
}

async function tiquWebsiteNativeIcon(item) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), websiteIconTotalTimeoutMs)
  const cacheKey = huoquWebsiteIconCacheKey(item)
  let pageUrl
  let candidates = []
  let manifestUrls = []
  try {
    const pageSignal = chuangjianWebsiteRequestSignal(controller.signal, websiteIconPageTimeoutMs)
    try {
      const pageResult = await qingqiuRemoteResource(item.sourceUrl, pageSignal.signal, {
        sourceUrl: item.sourceUrl,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2',
        useSessionNetwork: true,
        addressTimeoutMs: 3000,
      })
      pageUrl = pageResult.finalUrl
      const contentType = pageResult.response.header('content-type').split(';')[0].trim().toLowerCase()
      if (pageResult.response.ok && ['text/html', 'application/xhtml+xml'].includes(contentType)) {
        const linkHeader = pageResult.response.header('link')
        const html = (await duquRemoteBuffer(pageResult.response, 2 * 1024 * 1024)).toString('utf8')
        const fallbackUrls = tiquWebsiteFallbackIconUrls(pageUrl)
        candidates = [...new Set([
          ...tiquWebsiteIconCandidates(html, pageUrl).filter((candidate) => !fallbackUrls.includes(candidate)),
          ...tiquWebsiteHeaderIconCandidates(linkHeader, pageUrl),
          ...fallbackUrls,
        ])].slice(0, websiteIconMaxCandidates)
        manifestUrls = tiquWebsiteManifestUrls(html, pageUrl)
      } else {
        pageResult.response.destroy()
      }
    } finally {
      pageSignal.cleanup()
    }
  } catch {
    try {
      pageUrl = new URL(item.sourceUrl)
    } catch {}
  }
  if (pageUrl) {
    const fallbackUrls = tiquWebsiteFallbackIconUrls(pageUrl)
    const declaredCandidates = candidates.filter((candidate) => !fallbackUrls.includes(candidate))
    let manifestCandidates = []
    if (!declaredCandidates.length && manifestUrls.length && !controller.signal.aborted) {
      for (const manifestUrl of manifestUrls) {
        manifestCandidates = await tiquWebsiteManifestIconUrls(manifestUrl, item, pageUrl, controller.signal)
        if (manifestCandidates.length) break
      }
    }
    candidates = [...new Set([...declaredCandidates, ...manifestCandidates, ...fallbackUrls])]
      .slice(0, websiteIconMaxCandidates)
  }

  try {
    if (!cacheKey) return null
    // 每批并行尝试两个候选，兼顾首屏速度与网络连接数量。
    for (let index = 0; index < candidates.length && !controller.signal.aborted; index += 2) {
      try {
        return await Promise.any(candidates.slice(index, index + 2).map(async (candidate) => {
          const icon = await tiquWebsiteCandidateIcon(candidate, item, pageUrl, cacheKey, controller.signal)
          if (!icon) throw new Error('网址图标候选不可用')
          return icon
        }))
      } catch {}
    }
    return null
  } finally {
    controller.abort()
    clearTimeout(timeout)
  }
}

async function huoquWebsiteIconUrl(item, priority) {
  if (item.type !== 'url') return ''
  const cacheKey = huoquWebsiteIconCacheKey(item)
  if (!cacheKey) return ''
  const cachedIconUrl = await huoquReadyWebsiteIconCacheUrl(cacheKey)
  if (cachedIconUrl) {
    if (item.iconCacheKey !== cacheKey || item.iconStatus !== 'ready') library.setWebsiteIconCache(item.id, cacheKey, 'ready')
    return cachedIconUrl
  }

  library.setWebsiteIconCache(item.id, cacheKey, 'pending')
  let cachePromise = yingyongIconPromiseMap.get(cacheKey)
  if (!cachePromise) {
    cachePromise = xianxingZhixingYingyongIconRenwu(async () => {
      const iconResource = await tiquWebsiteNativeIcon(item)
      return iconResource ? baocunWebsiteIconCache(iconResource, cacheKey) : false
    }, priority, cacheKey).finally(() => yingyongIconPromiseMap.delete(cacheKey))
    yingyongIconPromiseMap.set(cacheKey, cachePromise)
  } else tishengYingyongIconRenwuPriority(cacheKey, priority)
  const generated = await cachePromise
  library.setWebsiteIconCache(item.id, cacheKey, generated ? 'ready' : 'failed')
  return generated ? huoquReadyWebsiteIconCacheUrl(cacheKey) : ''
}

async function huoquWebsiteIconMap(itemIds) {
  const validIds = [...new Set(Array.isArray(itemIds) ? itemIds : [])]
    .filter((itemId) => typeof itemId === 'string')
    .slice(0, 12)
  const iconEntries = await Promise.all(validIds.map(async (itemId, index) => {
    const item = library.getItemDetail(itemId)
    if (item?.type !== 'url') return [itemId, '']
    return [itemId, await huoquWebsiteIconUrl(item, index < 5 ? 0 : 1)]
  }))
  return Object.fromEntries(iconEntries)
}

// 链接归档成功后立即进入后台队列，打开资料库时通常可直接命中本地缓存。
function yureWebsiteIcons(itemIds) {
  const validIds = [...new Set(Array.isArray(itemIds) ? itemIds : [])]
    .filter((itemId) => typeof itemId === 'string')
    .slice(0, 20)
  for (const [index, itemId] of validIds.reverse().entries()) {
    const item = library.getItemDetail(itemId)
    if (item?.type === 'url') void huoquWebsiteIconUrl(item, index < 2 ? 0 : 1).catch(() => {})
  }
}

async function huoquApplicationIconUrl(item, priority) {
  if (item.type !== 'application') return ''
  const cacheKey = huoquYingyongIconCacheKey(item)
  const cachedIconUrl = await huoquReadyIconCacheUrl(cacheKey)
  if (cachedIconUrl) {
    if (item.iconCacheKey !== cacheKey || item.iconStatus !== 'ready') {
      library.setApplicationIconCache(item.id, cacheKey, 'ready')
    }
    return cachedIconUrl
  }

  library.setApplicationIconCache(item.id, cacheKey, 'pending')
  let cachePromise = yingyongIconPromiseMap.get(cacheKey)
  if (!cachePromise) {
    cachePromise = xianxingZhixingYingyongIconRenwu(
      () => shengchengYingyongIconCache(item, cacheKey),
      priority,
      cacheKey,
    ).finally(() => yingyongIconPromiseMap.delete(cacheKey))
    yingyongIconPromiseMap.set(cacheKey, cachePromise)
  } else tishengYingyongIconRenwuPriority(cacheKey, priority)
  const generated = await cachePromise
  library.setApplicationIconCache(item.id, cacheKey, generated ? 'ready' : 'failed')
  return generated ? huoquReadyIconCacheUrl(cacheKey) : ''
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

async function shanchuYingyongIconCacheBatch(cacheItems) {
  if (isHeavyTasksPaused || !library) {
    isYingyongIconCleanupPending = true
    return false
  }
  await Promise.all(cacheItems.map(({ cacheKey, cachePath }) => {
    // 删除前复检，避免后台清理与刚完成的图标生成互相覆盖。
    if (mediaCacheYanzhengVersionMap.has(cachePath) || library.hasIconCacheKey(cacheKey)) return undefined
    return fsp.rm(cachePath, { force: true })
  }))
  await new Promise((resolve) => setImmediate(resolve))
  return true
}

// 目录与数据库均流式逐项检查，十万级程序也不会一次构造全量数组和 Set。
async function qingliYingyongIconCache() {
  let cacheDirectory
  try { cacheDirectory = await fsp.opendir(yingyongIconCacheDir) } catch { return }
  let staleCacheItems = []
  let scannedCount = 0
  for await (const entry of cacheDirectory) {
    if (isHeavyTasksPaused || !library) {
      isYingyongIconCleanupPending = true
      return
    }
    scannedCount += 1
    if (scannedCount % 128 === 0) {
      await new Promise((resolve) => setImmediate(resolve))
      if (isHeavyTasksPaused || !library) {
        isYingyongIconCleanupPending = true
        return
      }
    }
    if (!entry.isFile()) continue
    const match = /^([a-f\d]{64})-(?:64|128|256)\.(?:png|svg|webp|gif)$/i.exec(entry.name)
    if (!match) continue
    const cacheKey = match[1].toLowerCase()
    const cachePath = path.join(yingyongIconCacheDir, entry.name)
    if (mediaCacheYanzhengVersionMap.has(cachePath) || library.hasIconCacheKey(cacheKey)) continue
    staleCacheItems.push({ cacheKey, cachePath })
    if (staleCacheItems.length < 64) continue
    if (!(await shanchuYingyongIconCacheBatch(staleCacheItems))) return
    staleCacheItems = []
  }
  if (staleCacheItems.length) await shanchuYingyongIconCacheBatch(staleCacheItems)
}

function qingqiuYingyongIconCacheCleanup() {
  if (!library) return
  if (isHeavyTasksPaused || yingyongIconCleanupPromise) {
    isYingyongIconCleanupPending = true
    return
  }
  isYingyongIconCleanupPending = false
  yingyongIconCleanupPromise = qingliYingyongIconCache()
    .catch(() => {})
    .finally(() => {
      yingyongIconCleanupPromise = null
      if (isYingyongIconCleanupPending && !isHeavyTasksPaused) setImmediate(qingqiuYingyongIconCacheCleanup)
    })
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
  // 缩略图解码和编码是同步原生操作，至少先让窗口事件获得一次处理机会。
  setImmediate(() => {
    if (isHeavyTasksPaused) {
      tupianThumbnailHuodongRenwu = 0
      tupianThumbnailRenwuQueue.push(task)
      tupianThumbnailRenwuQueue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence)
      return
    }
    Promise.resolve()
      .then(task.action)
      .then(task.resolve, task.reject)
      .finally(() => {
        tupianThumbnailHuodongRenwu = 0
        zhixingNextThumbnailRenwu()
      })
  })
}

function huoquThumbnailCacheKey(item) {
  return createHash('sha256')
    .update([item.libraryId, item.id, item.byteSize, item.updatedAt, item.relativePath].map((value) => String(value ?? '')).join('\0'))
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
  const localPath = await library.getValidatedItemLocalPath(item)
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
    await biaojiMediaCachePathsValid(outputPaths.map(({ finalPath }) => finalPath))
    return true
  } catch {
    await Promise.all(outputPaths.map(({ tempPath }) => fsp.rm(tempPath, { force: true }).catch(() => {})))
    return false
  }
}

async function huoquImageThumbnailKey(item, priority) {
  if (item.type !== 'image') return ''
  const cacheKey = huoquThumbnailCacheKey(item)
  const cachePaths = [320, 640].map((width) => path.join(tupianThumbnailCacheDir, `${cacheKey}-${width}.png`))
  const cacheStats = await Promise.all(cachePaths.map(huoquValidPngCacheStats))
  const hasCache = cacheStats.every(Boolean)
  if (hasCache) {
    if (item.thumbnailCacheKey !== cacheKey || item.thumbnailStatus !== 'ready') {
      if (!library.setImageThumbnailCache(item, cacheKey, 'ready')) return ''
    }
    return cacheKey
  }
  await Promise.all(cachePaths.map((cachePath) => fsp.rm(cachePath, { force: true }).catch(() => {})))

  if (!library.setImageThumbnailCache(item, cacheKey, 'pending')) return ''
  let cachePromise = tupianThumbnailPromiseMap.get(cacheKey)
  if (!cachePromise) {
    cachePromise = xianxingZhixingThumbnailRenwu(
      () => shengchengThumbnailCache(item, cacheKey),
      priority,
    ).finally(() => tupianThumbnailPromiseMap.delete(cacheKey))
    tupianThumbnailPromiseMap.set(cacheKey, cachePromise)
  }
  const generated = await cachePromise
  const currentItem = library.getItemDetail(item.id)
  if (currentItem?.status !== 'ready' || huoquThumbnailCacheKey(currentItem) !== cacheKey) {
    if (generated) await shanchuThumbnailCache(cacheKey)
    return ''
  }
  if (!library.setImageThumbnailCache(item, cacheKey, generated ? 'ready' : 'failed')) {
    if (generated) await shanchuThumbnailCache(cacheKey)
    return ''
  }
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
  await Promise.all([320, 640].map((width) => {
    const cachePath = path.join(tupianThumbnailCacheDir, `${cacheKey.toLowerCase()}-${width}.png`)
    mediaCacheYanzhengVersionMap.delete(cachePath)
    return fsp.rm(cachePath, { force: true })
  }))
}

async function tongbuManagedLibraryFiles() {
  const config = library.getConfig()
  const requestedKey = `${config.libraryId}\0${config.rootdir}`
  if (managedReconcilePromise) {
    const awaitedKey = managedReconcileKey
    const result = await managedReconcilePromise
    const currentConfig = library.getConfig()
    const currentKey = `${currentConfig.libraryId}\0${currentConfig.rootdir}`
    if (awaitedKey !== currentKey || result.pending) return tongbuManagedLibraryFiles()
    return result
  }
  managedReconcileKey = requestedKey
  const currentPromise = (async () => {
    const result = await library.reconcileManagedFiles()
    await Promise.all([...new Set(result.staleThumbnailKeys)].map(shanchuThumbnailCache))
    return result
  })().finally(() => {
    if (managedReconcilePromise === currentPromise) managedReconcilePromise = null
  })
  managedReconcilePromise = currentPromise
  const result = await currentPromise
  const currentConfig = library.getConfig()
  const currentKey = `${currentConfig.libraryId}\0${currentConfig.rootdir}`
  return currentKey === requestedKey && !result.pending ? result : tongbuManagedLibraryFiles()
}

async function tongbuManagedFilesAndNotify() {
  const result = await tongbuManagedLibraryFiles()
  if ((result.missing || result.recovered) && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(ipcTongdao.libraryChanged)
  }
  return result
}

// 动画期间只记录目录变更，待关键帧结束后再执行全量对账。
function qingqiuManagedFilesReconcile() {
  if (!library) return
  if (isHeavyTasksPaused) {
    isManagedReconcilePending = true
    return
  }
  isManagedReconcilePending = false
  void tongbuManagedFilesAndNotify().catch(() => {})
}

// 创建应用主窗口
function createMainWindow() {
  isMainIslandShapeReady = false
  mainIslandShapeCacheKey = ''
  isMainWindowReady = false
  mainWindow = new BrowserWindow(createWindowOptions(mainWindowSize))
  jiantingWindowYichang(mainWindow, '主窗口')

  // 主灵动岛预加载在桌面右下角，等待开机动画结束后再显示。
  positionMainWindow()
  shezhiMainIslandWindowShape()
  mainWindow.once('ready-to-show', () => {
    // 透明窗口就绪后再次锁定内容尺寸，避免沿用旧窗口边界
    mainWindow.setContentSize(mainWindowSize.width, mainWindowSize.height)
    positionMainWindow()
    isMainIslandShapeReady = false
    mainIslandShapeCacheKey = ''
    shezhiMainIslandWindowShape()
    // 以普通置顶层级常驻，避免覆盖系统级界面。
    mainWindow.setAlwaysOnTop(true, 'floating')
    mainWindow.setIgnoreMouseEvents(false)
    isMainWindowReady = true
    if (isStartupCompleted) xianshiMainLingdongdao()
  })

  loadRendererWindow(mainWindow, false)
  mainWindow.on('closed', () => {
    jieshuMainIslandWindowMove()
    isMainIslandShapeReady = false
    mainIslandShapeCacheKey = ''
    isMainWindowReady = false
    mainWindow = null
  })
}

// 预加载独立收起坞窗口，切换时无需移动主灵动岛窗口。
function createXuanfuqiuWindow() {
  xuanfuqiuWindow = new BrowserWindow(createWindowOptions(shouqikouWindowSize))
  jiantingWindowYichang(xuanfuqiuWindow, '收起坞窗口')
  isXuanfuqiuWindowReady = false
  if (process.platform === 'win32' || process.platform === 'linux') {
    xuanfuqiuWindow.setShape(huoquShouqikouWindowShape())
  }
  const workArea = screen.getPrimaryDisplay().workArea
  positionXuanfuqiuWindow({
    x: workArea.x + shouqikouMargin,
    y: workArea.y + workArea.height - shouqikouMargin - shouqikouWindowSize.height,
  })
  xuanfuqiuWindow.once('ready-to-show', () => {
    isXuanfuqiuWindowReady = true
    xuanfuqiuWindow?.setAlwaysOnTop(true, 'floating')
    xuanfuqiuWindow?.setIgnoreMouseEvents(true, { forward: true })
  })
  loadXuanfuqiuWindow(xuanfuqiuWindow)
  xuanfuqiuWindow.on('closed', () => {
    xuanfuqiuWindow = null
    isXuanfuqiuWindowReady = false
  })
}

// 主窗口首帧完成后再切换，避免启动页关闭时灵动岛仍是透明空白窗口。
function xianshiMainLingdongdao() {
  if (!isStartupCompleted || !isMainWindowReady || !mainWindow || mainWindow.isDestroyed()) return
  positionMainWindow()
  shezhiMainIslandWindowShape()
  mainWindow.setIgnoreMouseEvents(false)
  mainWindow.showInactive()
  if (startupWindow && !startupWindow.isDestroyed()) startupWindow.close()
}

// 无论渲染层动画是否完成，主进程都保证将窗口交接给主灵动岛。
function wanchengStartupWindow() {
  if (startupWindowFallbackTimer) {
    clearTimeout(startupWindowFallbackTimer)
    startupWindowFallbackTimer = null
  }
  isStartupCompleted = true
  xianshiMainLingdongdao()
  anpaiPiYure()
}

// 在开机动画结束后的空闲期预热 Pi 助手运行时，把 PI SDK 加载与首会话建立挪到后台，
// 避免用户首次进入助手页时主进程被 SDK 加载阻塞而表现为界面卡顿。
function anpaiPiYure() {
  if (piPrewarmTimer || !library) return
  piPrewarmTimer = setTimeout(() => {
    piPrewarmTimer = null
    void piJicheng.init().catch(() => {})
  }, 2500)
  piPrewarmTimer.unref?.()
}

// 创建独立开机窗口，避免重定位主灵动岛造成平移与卡顿
function createStartupWindow() {
  isStartupCompleted = false
  startupWindow = new BrowserWindow(createWindowOptions(startupWindowSize))
  jiantingWindowYichang(startupWindow, '启动窗口')

  const workArea = screen.getPrimaryDisplay().workArea
  startupWindow.setPosition(
    Math.round(workArea.x + (workArea.width - startupWindowSize.width) / 2),
    Math.round(workArea.y + (workArea.height - startupWindowSize.height) / 2),
  )
  startupWindow.once('ready-to-show', () => {
    startupWindow?.setAlwaysOnTop(true, 'floating')
    startupWindow?.setIgnoreMouseEvents(true, { forward: true })
    startupWindow?.show()
  })
  loadRendererWindow(startupWindow, true)
  startupWindow.on('closed', () => {
    startupWindow = null
  })
  // 渲染层异常或开机动画失效时，最多等待 5 秒后强制显示主窗口。
  startupWindowFallbackTimer = setTimeout(wanchengStartupWindow, 5000)
  startupWindowFallbackTimer.unref()
}

// 唤起已有窗口，避免桌面快捷方式重复启动多个灵动岛进程。
function jihuoYiyouLingdongdaoWindow() {
  if (startupWindow && !startupWindow.isDestroyed()) {
    startupWindow.show()
    startupWindow.focus()
    return
  }
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (isXuanfuqiuMoshi) {
    void qiehuanXuanfuqiuMoshi(false).then(() => mainWindow?.focus())
    return
  }
  mainWindow.show()
  mainWindow.focus()
}

// 仅向渲染层暴露前后各四位，完整 AnySearch 密钥始终留在主进程。
function geshiAnySearchApiKeyMask(apiKey) {
  const value = String(apiKey ?? '').trim()
  if (value.length <= 8) return value ? '*******' : ''
  return `${value.slice(0, 4)}*******${value.slice(-4)}`
}

async function chushihuaYingyong() {
  // 先显示启动页，再执行同步数据库初始化，避免首帧被磁盘 I/O 长时间阻塞。
  qidongJieduan = '显示启动窗口'
  createStartupWindow()
  qidongJieduan = '初始化本地数据'
  // 后台预热 Windows STA 剪贴板读取，图片捕获时无需等待 PowerShell 冷启动。
  chushihuaWindowsJiantiebanHelper()
  // 初始化资料库索引，数据库与用户可管理的资料目录保持分离
  // 开发与生产使用独立数据库，调试数据不会影响已安装应用的资料库。
  library = createLibrary(path.join(app.getPath('userData'), ziliaokuDbFilename))
  huihuaStore = createHuihuaStore(path.join(app.getPath('userData'), isKaifaHuanjing ? 'aether-dock-chat.dev.db' : 'aether-dock-chat.db'))
  const piSessionDir = path.join(app.getPath('userData'), 'pi-sessions')
  const kongbaiHuihuaList = huihuaStore.qingliKongbaiHuihua()
  await Promise.all(kongbaiHuihuaList.map(async (conversation) => {
    const rawSessionFile = String(conversation.piSessionFile ?? '')
    if (!rawSessionFile) return
    const sessionFile = path.resolve(rawSessionFile)
    if (!sessionFile.startsWith(`${piSessionDir}${path.sep}`)) return
    await fsp.rm(sessionFile, { force: true }).catch(() => {})
  }))
  library.onManagedFilesDirty(() => {
    qingqiuManagedFilesReconcile()
  })
  // Pi 助手按首次使用加载；配置、凭据与可操作文件集中在应用数据目录，避免干扰全局 Pi 配置。
  const piAgentDir = path.join(app.getPath('userData'), 'pi-agent')
  const piWorkspaceDir = path.join(app.getPath('userData'), 'pi-workspace')
  piJicheng.peizhi({
    agentDir: piAgentDir,
    workspaceDir: piWorkspaceDir,
    sessionDir: piSessionDir,
    sendEvent: piFaSongEvent,
    getSearchConfig: () => ({ provider: library.getSearchProvider(), apiKey: library.getAnySearchApiKey() }),
    // 无关键词的 AI 查询返回全库概览，避免将“最近打开”误当作资料库全量内容。
    searchLibrary: (keyword) => {
      const value = String(keyword ?? '').trim()
      return value ? library.searchLibrary({ keyword: value }) : { overview: library.getLibrarySummary() }
    },
    libraryRead: piDukuLibraryWenjian,
    fetchUrl: piZhuawangUrl,
    saveNote: piBaocunBiji,
    createDocxCopy: piShengchengDocxFuben,
    createXlsxWorkbook: piShengchengXlsxGongzuobu,
    createMarkdownFile: piShengchengMarkdownWenjian,
    createPdfDocument: piShengchengPdfWenjian,
    requestLibraryApproval: piQingqiuZiliaokuShouquan,
    listInbox: piLiebiaoJiantieban,
    archiveInbox: piGuidangJiantiebanItems,
    removeInbox: piYichuJiantiebanItems,
    renameLibraryItem: piChongmingmingZiliaokuTiaomu,
    deleteLibraryItem: piShanchuZiliaokuTiaomu,
    updateLibraryNotes: piGengxinZiliaokuBiji,
    getLibraryItem: piHuoquZiliaokuTiaomu,
  })
  qidongJieduan = '准备运行目录'
  yingyongIconCacheDir = path.join(app.getPath('userData'), 'application-icons')
  tupianThumbnailCacheDir = path.join(app.getPath('userData'), 'image-thumbnails')
  await fsp.mkdir(yingyongIconCacheDir, { recursive: true })
  await fsp.mkdir(tupianThumbnailCacheDir, { recursive: true })
  qidongJieduan = '注册本地协议'
  protocol.handle('aetherdock-icon', async (request) => {
    try {
      const cacheKey = new URL(request.url).hostname.toLowerCase()
      if (!/^[a-f\d]{64}$/.test(cacheKey)) return new Response('invalid key', { status: 400 })
      let buffer
      let contentType = 'image/png'
      for (const size of [256, 128]) {
        try {
          buffer = await fsp.readFile(path.join(yingyongIconCacheDir, `${cacheKey}-${size}.png`))
          break
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error
        }
      }
      if (!buffer) {
        for (const extension of websiteBrowserIconExtensions) {
          try {
            const browserIcon = chuangjianSafeWebsiteBrowserIcon(
              await fsp.readFile(path.join(yingyongIconCacheDir, `${cacheKey}-128.${extension}`)),
            )
            if (!browserIcon || browserIcon.extension !== extension) continue
            buffer = browserIcon.buffer
            contentType = browserIcon.contentType
            break
          } catch (browserIconError) {
            if (browserIconError?.code !== 'ENOENT') throw browserIconError
          }
        }
        if (!buffer) {
          const missingIconError = new Error('网址浏览器图标缓存无效')
          missingIconError.code = 'ENOENT'
          throw missingIconError
        }
      }
      return new Response(buffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
          'X-Content-Type-Options': 'nosniff',
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
  // PDF 预览始终按资料 ID 在主进程重新校验路径，渲染层无法借此读取任意本地文件。
  protocol.handle('aetherdock-preview', async (request) => {
    try {
      const itemId = new URL(request.url).hostname
      if (!/^[\da-f-]{36}$/i.test(itemId)) return new Response('invalid preview', { status: 400 })
      const item = library.getItemDetail(itemId)
      if (!item || path.extname(item.title || item.sourcePath || '').toLowerCase() !== '.pdf') {
        return new Response('not found', { status: 404 })
      }
      const localPath = await library.getValidatedItemLocalPath(item)
      if (!localPath) return new Response('not found', { status: 404 })
      const buffer = await fsp.readFile(localPath)
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Security-Policy': "default-src 'none'; frame-src 'none'; object-src 'none'",
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (error) {
      return new Response('not found', { status: error?.code === 'ENOENT' ? 404 : 500 })
    }
  })
  qidongJieduan = '注册应用服务'
  ipcMain.handle(ipcTongdao.getSystemStatus, () => getSystemStatus())
  ipcMain.handle(ipcTongdao.getAppInfo, () => huoquAppInfo())
  ipcMain.handle(ipcTongdao.checkAppUpdate, jianchaAppGengxin)
  ipcMain.handle(ipcTongdao.openAppRelease, (_, url) => shell.openExternal(huoquSafeReleaseUrl(url)))
  ipcMain.handle(ipcTongdao.openExternalUrl, (_, url) => {
    const safeUrl = huoquSafeExternalUrl(url)
    if (!safeUrl) return { chenggong: false }
    return shell.openExternal(safeUrl).then(() => ({ chenggong: true })).catch(() => ({ chenggong: false }))
  })
  ipcMain.handle(ipcTongdao.setAutoLaunch, (_, enabled) => {
    if (typeof enabled !== 'boolean') return { chenggong: false, ...huoquAppInfo() }
    return shezhiAutoLaunch(enabled)
  })
  ipcMain.handle(ipcTongdao.setIslandPassthrough, (event, isPassthrough) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender)
    if (!targetWindow || targetWindow.isDestroyed()) return
    targetWindow.setIgnoreMouseEvents(Boolean(isPassthrough), { forward: Boolean(isPassthrough) })
  })
  ipcMain.handle(ipcTongdao.kaishiMainIslandMove, (event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) return null
    return kaishiMainIslandWindowMove()
  })
  ipcMain.on(ipcTongdao.jieshuMainIslandMove, (event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) return
    jieshuMainIslandWindowMove()
  })
  ipcMain.handle(ipcTongdao.setIslandWindowShape, (event, state, options) => {
    if (BrowserWindow.fromWebContents(event.sender) !== mainWindow) return
    if (!['collapsed', 'moving', 'expanded', 'drop'].includes(state)) return
    return shezhiMainIslandWindowShape(state, options)
  })
  ipcMain.handle(ipcTongdao.setFloatingMode, (_, enabled) => {
    qiehuanXuanfuqiuMoshi(enabled)
  })
  ipcMain.handle(ipcTongdao.moveFloatingIsland, (_, point) => {
    if (!isXuanfuqiuMoshi || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return
    positionXuanfuqiuWindow(point)
  })
  // 开机窗口完成后直接显示已预加载的右侧灵动岛
  ipcMain.handle(ipcTongdao.completeStartup, () => {
    wanchengStartupWindow()
  })
  // 选择资料库根目录，并按用户选择迁移或建立独立资料库。
  ipcMain.handle(ipcTongdao.selectLibraryRootdir, async (_, mode = 'migrate') => {
    if (libraryRootMigrationPromise) {
      return { quxiao: false, chenggong: false, code: 'migration_busy', xiaoxi: '资料库正在迁移' }
    }
    libraryRootMigrationPromise = (async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择 AetherDock 资料库',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || !result.filePaths[0]) return { quxiao: true }
      try {
        const migrationResult = await library.setRootdir(result.filePaths[0], mode)
        let reconciliationWarning = false
        try {
          await tongbuManagedLibraryFiles()
        } catch {
          reconciliationWarning = true
        }
        return { quxiao: false, chenggong: true, reconciliationWarning, ...migrationResult }
      } catch (error) {
        const messageMap = {
          target_library_conflict: '目标目录属于另一个资料库',
          file_conflict: '目标目录存在同名但内容不同的文件',
          invalid_target: '目标目录不可用',
          source_unavailable: '原资料库目录暂时不可用',
          unsafe_file: '资料库包含不安全的文件',
          copy_verification_failed: '资源复制校验失败',
          source_changed: '迁移期间资料库状态发生变化',
          invalid_mode: '资料库切换方式无效',
        }
        return {
          quxiao: false,
          chenggong: false,
          code: error?.code || 'migration_failed',
          xiaoxi: messageMap[error?.code] || '资料库迁移失败',
          conflictPath: error?.conflictPath || '',
        }
      }
    })().catch(() => ({
      quxiao: false,
      chenggong: false,
      code: 'migration_failed',
      xiaoxi: '资料库迁移失败',
    })).finally(() => { libraryRootMigrationPromise = null })
    return libraryRootMigrationPromise
  })
  ipcMain.handle(ipcTongdao.getLibraryConfig, () => library.getConfig())
  ipcMain.handle(ipcTongdao.getCollapsedAnimation, () => library.getCollapsedAnimation())
  ipcMain.handle(ipcTongdao.setCollapsedAnimation, (_, animation) => library.setCollapsedAnimation(animation))
  ipcMain.handle(ipcTongdao.getSearchConfig, () => {
    const apiKey = library.getAnySearchApiKey()
    return {
      chenggong: true,
      provider: library.getSearchProvider(),
      apiKeyConfigured: Boolean(apiKey),
      apiKeyMask: geshiAnySearchApiKeyMask(apiKey),
    }
  })
  ipcMain.handle(ipcTongdao.setSearchProvider, (_, provider) => ({ chenggong: true, provider: library.setSearchProvider(provider) }))
  ipcMain.handle(ipcTongdao.setAnySearchApiKey, (_, apiKey) => {
    const savedApiKey = library.setAnySearchApiKey(apiKey)
    return {
      chenggong: true,
      apiKeyConfigured: Boolean(savedApiKey),
      apiKeyMask: geshiAnySearchApiKeyMask(savedApiKey),
    }
  })
  ipcMain.handle(ipcTongdao.importLibraryContent, async (_, payload) => {
    const localResult = await library.importContent({ file: payload?.file ?? [], url: [] })
    const remoteAdded = []
    const remoteDuplicates = []
    const bookmarkUrls = []
    const seenRemoteResources = new Set()
    const remoteResources = (Array.isArray(payload?.url) ? payload.url : [])
      .map(normalizeRemoteResource)
      .filter(({ candidates }) => candidates.length)
      .filter((resource) => {
        const key = `${resource.sourceUrl}\0${resource.candidates.join('\0')}`
        if (seenRemoteResources.has(key)) return false
        seenRemoteResources.add(key)
        return true
      })
      .slice(0, 20)
    const remoteResults = new Array(remoteResources.length)
    const batchController = new AbortController()
    const batchTimeout = setTimeout(() => batchController.abort(), 45000)
    let nextRemoteIndex = 0
    const downloadWorker = async () => {
      while (nextRemoteIndex < remoteResources.length) {
        if (batchController.signal.aborted) return
        const index = nextRemoteIndex
        nextRemoteIndex += 1
        remoteResults[index] = await changshiDownloadRemoteResource(remoteResources[index], batchController.signal)
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(3, remoteResources.length) }, downloadWorker))
    } finally {
      clearTimeout(batchTimeout)
    }
    for (let index = 0; index < remoteResults.length; index += 1) {
      const remoteResult = remoteResults[index] ?? { added: [], duplicates: [], bookmark: true }
      remoteAdded.push(...remoteResult.added)
      remoteDuplicates.push(...remoteResult.duplicates)
      if (remoteResult.bookmark) bookmarkUrls.push(remoteResult.sourceUrl || remoteResources[index].sourceUrl)
    }
    const bookmarkResult = await library.importContent({ file: [], url: bookmarkUrls })
    const result = {
      added: [...localResult.added, ...remoteAdded, ...bookmarkResult.added],
      duplicates: [...localResult.duplicates, ...remoteDuplicates, ...bookmarkResult.duplicates],
      downloaded: remoteAdded.length,
    }
    const websiteIds = [
      ...result.added.filter(({ type }) => type === 'url').map(({ id }) => id),
      ...bookmarkResult.duplicates,
    ]
    if (websiteIds.length) yureWebsiteIcons(websiteIds)
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
  ipcMain.handle(ipcTongdao.captureClipboardContent, buhuoJiantiebanContent)
  ipcMain.handle(ipcTongdao.getClipboardItems, () => ({ items: library.huoquJiantiebanItems() }))
  ipcMain.handle(ipcTongdao.archiveClipboardItems, (_, itemIds) => guidangJiantiebanItems(itemIds))
  ipcMain.handle(ipcTongdao.deleteClipboardItems, async (_, itemIds) => {
    let lastError = null
    // SQLite 短暂忙碌时重试，确保点击移除不会被后台索引任务打断。
    for (let cishu = 0; cishu < 3; cishu += 1) {
      try {
        return { chenggong: true, ...library.shanchuJiantiebanItems(itemIds) }
      } catch (error) {
        lastError = error
        await new Promise((resolve) => setTimeout(resolve, 60 * (cishu + 1)))
      }
    }
    console.warn('剪贴板收集箱移除失败', lastError)
    return { chenggong: false, removedIds: [], xiaoxi: '收集箱暂时繁忙，请稍后再试' }
  })
  ipcMain.handle(ipcTongdao.clearClipboardItems, () => library.qingkongJiantiebanItems())
  ipcMain.handle(ipcTongdao.copyClipboardItem, (_, itemId) => fuzhiJiantiebanItem(itemId))
  ipcMain.handle(ipcTongdao.setHeavyTasksPaused, (_, paused) => {
    isHeavyTasksPaused = Boolean(paused)
    if (isHeavyTasksPaused) return
    setImmediate(() => {
      if (isHeavyTasksPaused) return
      zhixingNextYingyongIconRenwu()
      zhixingNextThumbnailRenwu()
      if (isManagedReconcilePending) qingqiuManagedFilesReconcile()
      if (isYingyongIconCleanupPending) qingqiuYingyongIconCacheCleanup()
    })
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
        return {
          chenggong: true,
          ...tongbuResult,
          scanned: saomiaoResult.shortcuts.length,
        }
      })().finally(() => { yingyongSyncPromise = null })
    }
    return yingyongSyncPromise
  })
  ipcMain.handle(ipcTongdao.getLibrarySummary, async () => {
    const reconciliation = await tongbuManagedLibraryFiles()
    return { ...library.getLibrarySummary(), libraryAvailable: reconciliation.available }
  })
  ipcMain.handle(ipcTongdao.getLibraryPage, (_, options) => library.getLibraryPage(options))
  ipcMain.handle(ipcTongdao.searchLibrary, (_, options) => library.searchLibrary(options))
  ipcMain.handle(ipcTongdao.getLibraryItemDetails, async (_, itemId) => {
    const item = library.getItemDetail(itemId)
    const notesDetail = library.getItemNotes(itemId)
    if (!item || !notesDetail) return { chenggong: false, xiaoxi: '未找到该资料库条目' }

    const extension = path.extname(item.title || item.sourcePath || '').toLowerCase()
    const localPath = await library.getValidatedItemLocalPath(item)
    const detail = {
      id: item.id,
      type: item.type,
      title: item.title,
      status: item.status,
      source: item.sourceUrl || item.relativePath || item.sourcePath || '',
      byteSize: Number(item.byteSize ?? 0),
      ...notesDetail,
      preview: { type: 'none', content: '' },
    }
    if (item.type === 'image') {
      const thumbnailKey = await huoquImageThumbnailKey(item, 0).catch(() => '')
      if (thumbnailKey) detail.preview = { type: 'image', content: `aetherdock-thumb://${thumbnailKey}/640` }
    } else if (extension === '.pdf' && localPath) {
      detail.preview = { type: 'pdf', content: `aetherdock-preview://${item.id}` }
    } else if (textPreviewExts.has(extension) && localPath) {
      const stat = await fsp.stat(localPath).catch(() => null)
      if (stat?.isFile() && stat.size <= 256 * 1024) {
        detail.preview = { type: 'text', content: await fsp.readFile(localPath, 'utf8') }
      }
    }
    return { chenggong: true, detail }
  })
  ipcMain.handle(ipcTongdao.updateLibraryItemNotes, (_, itemId, notes) => {
    const result = library.setItemNotes(itemId, notes)
    return result ? { chenggong: true, ...result } : { chenggong: false, xiaoxi: '未找到该资料库条目' }
  })
  ipcMain.handle(ipcTongdao.getApplicationIcons, (_, itemIds) => huoquYingyongIconMap(itemIds))
  ipcMain.handle(ipcTongdao.getWebsiteIcons, (_, itemIds) => huoquWebsiteIconMap(itemIds))
  ipcMain.handle(ipcTongdao.getImageThumbnails, (_, itemIds) => huoquImageThumbnailMap(itemIds))
  ipcMain.handle(ipcTongdao.openLibraryItem, async (_, itemId) => {
    try {
      const item = library.getItemDetail(itemId)
      if (!item) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
      if (item?.storageMode === 'bookmark' && item.sourceUrl) {
        await shell.openExternal(item.sourceUrl)
        return { chenggong: true, usage: library.recordItemOpened(itemId) }
      }
      const localPath = await library.getValidatedItemLocalPath(item)
      if (localPath) {
        const error = await shell.openPath(localPath)
        return error ? { chenggong: false, xiaoxi: error } : { chenggong: true, usage: library.recordItemOpened(itemId) }
      }
      return { chenggong: false, xiaoxi: '条目缺少可打开的来源' }
    } catch {
      return { chenggong: false, xiaoxi: '系统未能打开该条目' }
    }
  })
  ipcMain.handle(ipcTongdao.locateLibraryItem, async (_, itemId) => {
    const item = library.getItemDetail(itemId)
    const localPath = await library.getValidatedItemLocalPath(item)
    if (localPath) shell.showItemInFolder(localPath)
  })
  ipcMain.handle(ipcTongdao.renameLibraryItem, async (_, itemId, title) => {
    try {
      return await library.renameItem(itemId, title)
    } catch {
      return { chenggong: false, xiaoxi: '重命名失败' }
    }
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
  ipcMain.handle(ipcTongdao.shareLibraryItem, async (_, itemId) => {
    const item = library.getItemDetail(itemId)
    if (!item) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
    if (item.storageMode === 'bookmark' && item.sourceUrl) {
      clipboard.writeText(item.sourceUrl)
      return { chenggong: true, xiaoxi: '链接已复制，可直接粘贴分享' }
    }
    const localPath = await library.getValidatedItemLocalPath(item)
    if (!localPath) return { chenggong: false, xiaoxi: '该文件暂时无法分享' }
    try {
      await fuzhiWenjianZiyuan(localPath)
      return { chenggong: true, xiaoxi: '文件已复制，可直接粘贴分享' }
    } catch {
      return { chenggong: false, xiaoxi: '文件复制失败，请稍后重试' }
    }
  })
  ipcMain.handle(ipcTongdao.piPrompt, async (_, message) => {
    try {
      return await piJicheng.faSong(message)
    } catch (error) {
      return { accepted: false, xiaoxi: error?.message ?? '助手不可用' }
    }
  })
  ipcMain.handle(ipcTongdao.piAbort, () => {
    piQuxiaoZiliaokuShouquan()
    return piJicheng.zhongzhi()
  })
  ipcMain.handle(ipcTongdao.piResolveLibraryApproval, (_, requestId, mode) => {
    const request = piZiliaokuShouquanMap.get(String(requestId ?? ''))
    if (!request) return { chenggong: false, xiaoxi: '该授权请求已失效' }
    piZiliaokuShouquanMap.delete(String(requestId ?? ''))
    const approvalMode = mode === 'always' ? 'always' : mode === true || mode === 'once' ? 'once' : 'reject'
    const isApproved = approvalMode !== 'reject'
    if (approvalMode === 'always' && request.permissionScope) {
      piChixuZiliaokuShouquanSet.add(request.permissionScope)
    }
    request.resolve({ approved: isApproved, mode: approvalMode })
    return { chenggong: true }
  })
  ipcMain.handle(ipcTongdao.piGetStatus, async () => {
    try {
      return { chenggong: true, status: await piJicheng.getStatus() }
    } catch (error) {
      return { chenggong: false, xiaoxi: error?.message ?? '助手尚未就绪' }
    }
  })
  ipcMain.handle(ipcTongdao.piSetProviderKey, (_, provider, key) => piJicheng.setProviderKey(provider, key))
  ipcMain.handle(ipcTongdao.piClearProviderKey, (_, provider) => piJicheng.qingchuProviderKey(provider))
  ipcMain.handle(ipcTongdao.piSetModel, async (_, provider, modelId) => {
    try {
      return await piJicheng.xuanzeModel(provider, modelId)
    } catch (error) {
      return { chenggong: false, xiaoxi: error?.message ?? '切换模型失败' }
    }
  })
  ipcMain.handle(ipcTongdao.piSetThinking, async (_, level) => {
    try {
      return await piJicheng.shezhiTuiliQiangdu(level)
    } catch (error) {
      return { chenggong: false, xiaoxi: error?.message ?? '设置推理强度失败' }
    }
  })
  ipcMain.handle(ipcTongdao.piAddProvider, (_, payload) => piJicheng.tianjiaGongyingshang(payload))
  ipcMain.handle(ipcTongdao.piRemoveProvider, (_, provider) => piJicheng.shanchuCustomProvider(provider))
  ipcMain.handle(ipcTongdao.chatListConversations, () => ({ chenggong: true, items: huihuaStore?.liechuHuihua() ?? [] }))
  ipcMain.handle(ipcTongdao.chatGetConversation, (_, conversationId) => ({ chenggong: true, conversation: huihuaStore?.duquHuihua(conversationId) ?? null }))
  ipcMain.handle(ipcTongdao.chatCreateConversation, () => ({ chenggong: true, conversation: huihuaStore?.chuangjianHuihua() ?? null }))
  ipcMain.handle(ipcTongdao.chatSaveConversation, (_, conversationId, messages) => {
    try {
      return { chenggong: true, conversation: huihuaStore?.baocunHuihua(conversationId, messages) ?? null }
    } catch (error) {
      return { chenggong: false, xiaoxi: error?.message ?? '保存对话失败' }
    }
  })
  ipcMain.handle(ipcTongdao.chatSwitchConversation, async (_, conversationId) => {
    const conversation = huihuaStore?.duquHuihua(conversationId)
    if (!conversation) return { chenggong: false, xiaoxi: '会话不存在' }
    try {
      const result = await piJicheng.qiehuanHuihua({ id: conversation.id, sessionFile: conversation.piSessionFile })
      if (!result.chenggong) return result
      huihuaStore.shezhiPiSessionFile(conversation.id, result.sessionFile)
      return { chenggong: true, conversation: huihuaStore.duquHuihua(conversation.id) }
    } catch (error) {
      return { chenggong: false, xiaoxi: error?.message ?? '切换对话失败' }
    }
  })
  ipcMain.handle(ipcTongdao.chatDeleteConversation, async (_, conversationId) => {
    const conversation = huihuaStore?.duquHuihua(conversationId)
    if (!conversation) return { chenggong: false, xiaoxi: '会话不存在' }
    huihuaStore.shanchuHuihua(conversation.id)
    const piSessionRoot = path.resolve(app.getPath('userData'), 'pi-sessions')
    const sessionFile = conversation.piSessionFile ? path.resolve(conversation.piSessionFile) : ''
    if (sessionFile && sessionFile.startsWith(`${piSessionRoot}${path.sep}`)) {
      await fsp.rm(sessionFile, { force: true }).catch(() => {})
    }
    return { chenggong: true }
  })
  managedReconcileTimer = setInterval(() => {
    qingqiuManagedFilesReconcile()
  }, 5 * 60 * 1000)
  managedReconcileTimer.unref()
  qidongJieduan = '创建应用窗口'
  createTuopan()
  createMainWindow()
  createXuanfuqiuWindow()
  chushihuaAutoUpdater()
  yingyongIconCleanupTimer = setTimeout(qingqiuYingyongIconCacheCleanup, 2500)
  yingyongIconCleanupTimer.unref()
  setTimeout(() => { void jianchaGithubAppGengxin({ shiShoudong: false }) }, 5000).unref()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
      createXuanfuqiuWindow()
      createStartupWindow()
    }
  })
  qidongJieduan = '启动完成'
}

// 初始化失败时显示明确提示并保存阶段信息，避免表现为无提示退出。
function chuliYingyongQidongShibai(error) {
  const xiaoxi = error instanceof Error ? error.message : String(error ?? '未知错误')
  jiluQidongWenti(`启动失败（${qidongJieduan}）`, error)
  dialog.showErrorBox('AetherDock 启动失败', `程序未能完成${qidongJieduan}。诊断信息已保存到应用数据目录的 ${qidongRizhiFilename}。\n\n${xiaoxi}`)
}

// 同一用户仅保留一个进程，后续启动请求交由已有进程处理。
const hasDanliYingyongLock = app.requestSingleInstanceLock()
if (!hasDanliYingyongLock) {
  app.quit()
} else {
  app.on('second-instance', jihuoYiyouLingdongdaoWindow)
  app.whenReady().then(chushihuaYingyong).catch(chuliYingyongQidongShibai)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.once('will-quit', () => {
  tingzhiWindowsJiantiebanHelper()
  if (piPrewarmTimer) clearTimeout(piPrewarmTimer)
  piPrewarmTimer = null
  if (managedReconcileTimer) clearInterval(managedReconcileTimer)
  managedReconcileTimer = null
  isManagedReconcilePending = false
  if (yingyongIconCleanupTimer) clearTimeout(yingyongIconCleanupTimer)
  yingyongIconCleanupTimer = null
  isYingyongIconCleanupPending = false
  library?.close()
  library = null
  piQuxiaoZiliaokuShouquan()
  huihuaStore?.close()
  huihuaStore = null
  piJicheng.close()
})
