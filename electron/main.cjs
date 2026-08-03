const { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, screen, shell } = require('electron')
const { execFile } = require('node:child_process')
const { createHash } = require('node:crypto')
const dns = require('node:dns/promises')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const nodeNet = require('node:net')
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
let managedReconcilePromise = null
let managedReconcileKey = ''
let managedReconcileTimer = null
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
const maxRemoteFileBytes = 100 * 1024 * 1024
const remoteImageExts = new Set(['.avif', '.bmp', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.webp'])
const remoteDocumentExts = new Set(['.csv', '.doc', '.docx', '.md', '.odp', '.ods', '.odt', '.pdf', '.ppt', '.pptx', '.rtf', '.txt', '.xls', '.xlsx'])
const websiteIconMimeTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/x-icon', 'image/vnd.microsoft.icon', 'application/octet-stream'])
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
      ['github.com', 'githubusercontent.com'],
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

async function qingqiuRemoteResource(rawUrl, signal, requestContext = {}) {
  let currentTarget = await jiaoyanRemoteUrl(rawUrl, signal)
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const { url: currentUrl, addresses } = currentTarget
    const referer = huoquRemoteReferer(currentUrl, requestContext)
    const response = await new Promise((resolve, reject) => {
      const request = (currentUrl.protocol === 'https:' ? https : http).request(currentUrl, {
        method: 'GET',
        signal,
        headers: {
          Accept: 'image/*,application/pdf,text/plain,application/octet-stream;q=0.8,*/*;q=0.5',
          'Accept-Encoding': 'identity',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
          'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/${process.versions.chrome} Safari/537.36`,
          ...(referer ? { Referer: referer } : {}),
        },
        lookup: (hostname, options, callback) => {
          if (options.all) {
            callback(null, addresses)
            return
          }
          const selectedAddress = addresses.find(({ family }) => !options.family || family === options.family) ?? addresses[0]
          callback(null, selectedAddress.address, selectedAddress.family)
        },
      }, resolve)
      request.on('error', reject)
      request.end()
    })
    response.status = response.statusCode ?? 0
    response.ok = response.status >= 200 && response.status < 300
    response.body = response
    response.header = (name) => {
      const value = response.headers[name.toLowerCase()]
      return Array.isArray(value) ? value[0] : value || ''
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: currentUrl }
    const location = response.header('location')
    response.destroy()
    if (!location || redirectCount === 5) throw new Error('网络资源重定向过多')
    currentTarget = await jiaoyanRemoteUrl(new URL(location, currentUrl).toString(), signal)
  }
  throw new Error('网络资源重定向失败')
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

function normalizeRemoteResource(rawResource) {
  const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value)
  const rawCandidates = Array.isArray(rawResource?.candidates) ? rawResource.candidates : []
  const candidates = [...new Set(rawCandidates.filter(isHttpUrl))].slice(0, 8)
  const sourceUrl = isHttpUrl(rawResource?.sourceUrl) ? rawResource.sourceUrl : candidates[0] || ''
  const referer = isHttpUrl(rawResource?.referer) ? rawResource.referer : ''
  return { sourceUrl, referer, candidates }
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
  const resource = await jiexiRemoteResource(rawResource, batchSignal)
  for (const candidate of resource.candidates) {
    if (batchSignal?.aborted) break
    const result = await changshiDownloadRemoteCandidate(candidate, resource, batchSignal)
    if (!result.bookmark) return result
  }
  return { added: [], duplicates: [], bookmark: true, sourceUrl: resource.sourceUrl }
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

function huoquReadyIconCacheUrl(cacheKey) {
  const iconPath = path.join(yingyongIconCacheDir, `${cacheKey}-128.png`)
  if (!fs.existsSync(iconPath)) return ''
  try {
    if (nativeImage.createFromPath(iconPath).isEmpty()) {
      fs.rmSync(iconPath, { force: true })
      return ''
    }
    return `${chuangjianYingyongIconUrl(cacheKey)}?v=${fs.statSync(iconPath).mtimeMs}`
  } catch {
    return ''
  }
}

async function shengchengYingyongIconCache(item, cacheKey) {
  const nativeIcon = await tiquApplicationNativeIcon(item)
  if (!nativeIcon) return false

  return baocunNativeIconCache(nativeIcon, cacheKey)
}

async function baocunNativeIconCache(nativeIcon, cacheKey) {
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

function tiquWebsiteIconCandidates(html, pageUrl) {
  const candidates = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = duquHtmlAttribute(tag, 'rel').toLowerCase().split(/\s+/)
    if (!rel.some((value) => value === 'icon' || value === 'shortcut' || value === 'apple-touch-icon')) continue
    const href = duquHtmlAttribute(tag, 'href')
    try {
      const iconUrl = new URL(href, pageUrl)
      if (['http:', 'https:'].includes(iconUrl.protocol)) candidates.push(iconUrl.toString())
    } catch {}
  }
  try { candidates.push(new URL('/favicon.ico', pageUrl).toString()) } catch {}
  return [...new Set(candidates)].slice(0, 8)
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

async function chuangjianSafeWebsiteIcon(iconBuffer, cacheKey) {
  const rasterSize = huoquRasterImageSize(iconBuffer)
  if (rasterSize) {
    if (!panduanSafeImageSize(rasterSize)) return null
    const image = nativeImage.createFromBuffer(iconBuffer)
    return image.isEmpty() ? null : image
  }
  if (process.platform !== 'win32' || !panduanSafeIco(iconBuffer)) return null
  const tempPath = path.join(yingyongIconCacheDir, `${cacheKey}.${process.pid}.${Date.now()}.ico`)
  try {
    await fsp.writeFile(tempPath, iconBuffer, { flag: 'wx' })
    const image = nativeImage.createFromPath(tempPath)
    return image.isEmpty() ? null : image
  } finally {
    await fsp.rm(tempPath, { force: true }).catch(() => {})
  }
}

async function tiquWebsiteNativeIcon(item) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  let pageUrl
  let candidates = []
  try {
    const pageResult = await qingqiuRemoteResource(item.sourceUrl, controller.signal, { sourceUrl: item.sourceUrl })
    pageUrl = pageResult.finalUrl
    const contentType = pageResult.response.header('content-type').split(';')[0].trim().toLowerCase()
    if (pageResult.response.ok && ['text/html', 'application/xhtml+xml'].includes(contentType)) {
      const html = (await duquRemoteBuffer(pageResult.response, 2 * 1024 * 1024)).toString('utf8')
      candidates = tiquWebsiteIconCandidates(html, pageUrl)
    } else {
      pageResult.response.destroy()
    }
  } catch {
    try {
      pageUrl = new URL(item.sourceUrl)
      candidates = [new URL('/favicon.ico', pageUrl).toString()]
    } catch {}
  }

  try {
    for (const candidate of candidates) {
      try {
        const { response } = await qingqiuRemoteResource(candidate, controller.signal, {
          sourceUrl: pageUrl?.toString() || item.sourceUrl,
          referer: pageUrl?.toString() || item.sourceUrl,
        })
        const contentType = response.header('content-type').split(';')[0].trim().toLowerCase()
        if (!response.ok || !websiteIconMimeTypes.has(contentType)) {
          response.destroy()
          continue
        }
        const iconBuffer = await duquRemoteBuffer(response, 1024 * 1024)
        const cacheKey = huoquWebsiteIconCacheKey(item)
        const icon = cacheKey ? await chuangjianSafeWebsiteIcon(iconBuffer, cacheKey) : null
        if (icon) return icon
      } catch {}
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function huoquWebsiteIconUrl(item, priority) {
  if (item.type !== 'url') return ''
  const cacheKey = huoquWebsiteIconCacheKey(item)
  if (!cacheKey) return ''
  const cachedIconUrl = huoquReadyIconCacheUrl(cacheKey)
  if (cachedIconUrl) {
    if (item.iconCacheKey !== cacheKey || item.iconStatus !== 'ready') library.setWebsiteIconCache(item.id, cacheKey, 'ready')
    return cachedIconUrl
  }

  library.setWebsiteIconCache(item.id, cacheKey, 'pending')
  let cachePromise = yingyongIconPromiseMap.get(cacheKey)
  if (!cachePromise) {
    cachePromise = xianxingZhixingYingyongIconRenwu(async () => {
      const nativeIcon = await tiquWebsiteNativeIcon(item)
      return nativeIcon ? baocunNativeIconCache(nativeIcon, cacheKey) : false
    }, priority).finally(() => yingyongIconPromiseMap.delete(cacheKey))
    yingyongIconPromiseMap.set(cacheKey, cachePromise)
  }
  const generated = await cachePromise
  library.setWebsiteIconCache(item.id, cacheKey, generated ? 'ready' : 'failed')
  return generated ? huoquReadyIconCacheUrl(cacheKey) : ''
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

async function huoquApplicationIconUrl(item, priority) {
  if (item.type !== 'application') return ''
  const cacheKey = huoquYingyongIconCacheKey(item)
  const cachedIconUrl = huoquReadyIconCacheUrl(cacheKey)
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
    ).finally(() => yingyongIconPromiseMap.delete(cacheKey))
    yingyongIconPromiseMap.set(cacheKey, cachePromise)
  }
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

// 同步仅删除已无数据库记录引用的指纹文件，未变化程序永久复用原缓存。
async function qingliYingyongIconCache() {
  const validKeys = new Set(library.getIconCacheItems().map(({ iconCacheKey }) => iconCacheKey).filter(Boolean))
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
  const hasCache = cachePaths.every((cachePath) => (
    fs.existsSync(cachePath) && !nativeImage.createFromPath(cachePath).isEmpty()
  ))
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
  await Promise.all([320, 640].map((width) => (
    fsp.rm(path.join(tupianThumbnailCacheDir, `${cacheKey.toLowerCase()}-${width}.png`), { force: true })
  )))
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
  library.onManagedFilesDirty(() => {
    void tongbuManagedFilesAndNotify().catch(() => {})
  })
  yingyongIconCacheDir = path.join(app.getPath('userData'), 'application-icons')
  tupianThumbnailCacheDir = path.join(app.getPath('userData'), 'image-thumbnails')
  await fsp.mkdir(yingyongIconCacheDir, { recursive: true })
  await fsp.mkdir(tupianThumbnailCacheDir, { recursive: true })
  await qingliYingyongIconCache()
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
  ipcMain.handle(ipcTongdao.getApplicationIcons, (_, itemIds) => huoquYingyongIconMap(itemIds))
  ipcMain.handle(ipcTongdao.getWebsiteIcons, (_, itemIds) => huoquWebsiteIconMap(itemIds))
  ipcMain.handle(ipcTongdao.getImageThumbnails, (_, itemIds) => huoquImageThumbnailMap(itemIds))
  ipcMain.handle(ipcTongdao.openLibraryItem, async (_, itemId) => {
    try {
      const item = library.getItemDetail(itemId)
      if (!item) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
      if (item?.storageMode === 'bookmark' && item.sourceUrl) {
        await shell.openExternal(item.sourceUrl)
        return { chenggong: true }
      }
      const localPath = await library.getValidatedItemLocalPath(item)
      if (localPath) {
        const error = await shell.openPath(localPath)
        return error ? { chenggong: false, xiaoxi: error } : { chenggong: true }
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
  managedReconcileTimer = setInterval(() => {
    void tongbuManagedFilesAndNotify().catch(() => {})
  }, 5 * 60 * 1000)
  managedReconcileTimer.unref()
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
  if (process.platform !== 'darwin') app.quit()
})

app.once('will-quit', () => {
  if (managedReconcileTimer) clearInterval(managedReconcileTimer)
  managedReconcileTimer = null
  library?.close()
  library = null
})
