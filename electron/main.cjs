const { app, BrowserWindow, dialog, ipcMain, protocol, screen, shell } = require('electron')
const os = require('node:os')
const path = require('node:path')
const fsp = require('node:fs/promises')
const { chuangjianZiliaoku } = require('./ziliaoku.cjs')

// 图片扩展名到 MIME 的映射，用于无 mimeType 时的回退推断
const tupianMime = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml', '.avif': 'image/avif',
}

// 持有主窗口引用，避免被垃圾回收后自动关闭
let zhuChuangkou = null
let kaijiChuangkou = null
let shangciCpuTongji = null
let ziliaoku = null
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
  // 初始化资料库索引，数据库与用户可管理的资料目录保持分离
  ziliaoku = chuangjianZiliaoku(path.join(app.getPath('userData'), 'aether-dock.db'))
  // 以条目 ID 为键安全返回图片字节，路径仍由资料库层校验，不开放任意文件访问
  protocol.handle('aetherdock-img', async (qingqiu) => {
    try {
      const id = new URL(qingqiu.url).hostname
      if (!id) return new Response('missing id', { status: 400 })
      const tiaomu = ziliaoku.duquTiaomuXiangqing(id)
      if (!tiaomu || tiaomu.type !== 'image') return new Response('not found', { status: 404 })
      const benDiLujing = ziliaoku.duquTiaomuBendiLujing(tiaomu)
      if (!benDiLujing) return new Response('not found', { status: 404 })
      const huanchong = await fsp.readFile(benDiLujing)
      const mime = tiaomu.mimeType || tupianMime[path.extname(benDiLujing).toLowerCase()] || 'image/png'
      return new Response(huanchong, { headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' } })
    } catch {
      return new Response('error', { status: 500 })
    }
  })
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
  // 选择资料库根目录，并创建必要的目录标记
  ipcMain.handle('ziliaoku:xuanze-genmulu', async () => {
    const jieguo = await dialog.showOpenDialog(zhuChuangkou, {
      title: '选择 AetherDock 资料库目录',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (jieguo.canceled || !jieguo.filePaths[0]) return { quxiao: true }
    return { quxiao: false, peizhi: await ziliaoku.sheZhiGenMulu(jieguo.filePaths[0]) }
  })
  ipcMain.handle('ziliaoku:duqu-peizhi', () => ziliaoku.duquPeizhi())
  ipcMain.handle('shezhi:duqu-shouqi-donghua', () => ziliaoku.duquShouqiDonghua())
  ipcMain.handle('shezhi:shezhi-shouqi-donghua', (_, donghua) => ziliaoku.sheZhiShouqiDonghua(donghua))
  ipcMain.handle('ziliaoku:yinru', async (_, miaoshu) => ziliaoku.yinruNeirong(miaoshu))
  ipcMain.handle('ziliaoku:duqu-tiaomu', () => ziliaoku.duquTiaomuLiebiao())
  ipcMain.handle('ziliaoku:dakai-tiaomu', async (_, tiaomuId) => {
    try {
      const tiaomu = ziliaoku.duquTiaomuXiangqing(tiaomuId)
      if (!tiaomu) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
      if (tiaomu?.storageMode === 'bookmark' && tiaomu.sourceUrl) {
        await shell.openExternal(tiaomu.sourceUrl)
        return { chenggong: true }
      }
      const benDiLujing = ziliaoku.duquTiaomuBendiLujing(tiaomu)
      if (benDiLujing) {
        const cuowu = await shell.openPath(benDiLujing)
        return cuowu ? { chenggong: false, xiaoxi: cuowu } : { chenggong: true }
      }
      return { chenggong: false, xiaoxi: '条目缺少可打开的来源' }
    } catch {
      return { chenggong: false, xiaoxi: '系统未能打开该条目' }
    }
  })
  ipcMain.handle('ziliaoku:dingwei-tiaomu', (_, tiaomuId) => {
    const tiaomu = ziliaoku.duquTiaomuXiangqing(tiaomuId)
    const benDiLujing = ziliaoku.duquTiaomuBendiLujing(tiaomu)
    if (benDiLujing) shell.showItemInFolder(benDiLujing)
  })
  ipcMain.handle('ziliaoku:shanchu-tiaomu', async (_, tiaomuId) => {
    try {
      const tiaomu = ziliaoku.duquTiaomuXiangqing(tiaomuId)
      if (!tiaomu) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
      // 主进程原生确认框挂载在主窗口上，避免渲染层 window.confirm 被置顶窗口遮挡
      const queren = await dialog.showMessageBox(zhuChuangkou, {
        type: 'warning',
        buttons: ['删除', '取消'],
        defaultId: 1,
        cancelId: 1,
        title: '删除资料',
        message: '确定删除该资料？',
        detail: `将同时删除本地文件与资料库记录，此操作不可撤销。\n${tiaomu.title || ''}`.trim(),
      })
      if (queren.response !== 0) return { quxiao: true }
      return await ziliaoku.shanchuTiaomu(tiaomuId)
    } catch {
      return { chenggong: false, xiaoxi: '删除失败' }
    }
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
  ziliaoku?.guanbi()
  if (process.platform !== 'darwin') app.quit()
})
