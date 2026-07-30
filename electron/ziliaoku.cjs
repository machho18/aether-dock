const { DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const tupianKuozhan = new Set(['.avif', '.bmp', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const wenjianKuozhan = new Set(['.csv', '.doc', '.docx', '.md', '.odp', '.ods', '.odt', '.pdf', '.ppt', '.pptx', '.rtf', '.txt', '.xls', '.xlsx'])

// 创建资料库持久层，所有数据库读写仅在主进程执行
function chuangjianZiliaoku(shujuKuLujing) {
  const shujuKu = new DatabaseSync(shujuKuLujing)
  shujuKu.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  // 先确保设置表存在，资料库目录迁移时仍可保留应用侧配置
  shujuKu.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `)

  const jiuTiaomuBiao = shujuKu.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'").get()
  // 旧版本仅支持 reference；升级时保留既有记录并增加受管副本字段
  if (jiuTiaomuBiao?.sql && !jiuTiaomuBiao.sql.includes("'managed'")) {
    shujuKu.exec(`
      BEGIN IMMEDIATE;
      DROP INDEX IF EXISTS idx_items_reference_source_path;
      DROP INDEX IF EXISTS idx_items_bookmark_normalized_url;
      ALTER TABLE items RENAME TO items_legacy;
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('document', 'image', 'url')),
        storageMode TEXT NOT NULL CHECK(storageMode IN ('reference', 'managed', 'bookmark')),
        title TEXT NOT NULL,
        sourcePath TEXT,
        relativePath TEXT,
        sourceUrl TEXT,
        normalizedUrl TEXT,
        mimeType TEXT,
        byteSize INTEGER,
        status TEXT NOT NULL DEFAULT 'ready',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      INSERT INTO items (id, type, storageMode, title, sourcePath, sourceUrl, normalizedUrl, mimeType, byteSize, status, createdAt, updatedAt)
        SELECT id, type, storageMode, title, sourcePath, sourceUrl, normalizedUrl, mimeType, byteSize, status, createdAt, updatedAt FROM items_legacy;
      DROP TABLE items_legacy;
      COMMIT;
    `)
  }

  shujuKu.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('document', 'image', 'url')),
      storageMode TEXT NOT NULL CHECK(storageMode IN ('reference', 'managed', 'bookmark')),
      title TEXT NOT NULL,
      sourcePath TEXT,
      relativePath TEXT,
      sourceUrl TEXT,
      normalizedUrl TEXT,
      mimeType TEXT,
      byteSize INTEGER,
      status TEXT NOT NULL DEFAULT 'ready',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_reference_source_path
      ON items(sourcePath)
      WHERE storageMode = 'reference' AND sourcePath IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_bookmark_normalized_url
      ON items(normalizedUrl)
      WHERE storageMode = 'bookmark' AND normalizedUrl IS NOT NULL;
  `)

  const duquShezhi = shujuKu.prepare('SELECT value FROM settings WHERE key = ?')
  const xieruShezhi = shujuKu.prepare(`
    INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `)
  const chazhaoTiaomu = shujuKu.prepare('SELECT * FROM items WHERE sourcePath = ? OR normalizedUrl = ? LIMIT 1')
  const xieruTiaomu = shujuKu.prepare(`
    INSERT INTO items (id, type, storageMode, title, sourcePath, relativePath, sourceUrl, normalizedUrl, mimeType, byteSize, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)
  `)
  const gengxinGuankongTiaomu = shujuKu.prepare(`
    UPDATE items SET type = ?, storageMode = 'managed', title = ?, sourcePath = ?, relativePath = ?, mimeType = ?, byteSize = ?, status = 'ready', updatedAt = ? WHERE id = ?
  `)
  const duquTiaomu = shujuKu.prepare('SELECT * FROM items ORDER BY createdAt DESC')
  const duquDanGeTiaomu = shujuKu.prepare('SELECT * FROM items WHERE id = ?')
  const shanchuTiaomuYuju = shujuKu.prepare('DELETE FROM items WHERE id = ?')

  // 读取资料库根目录与稳定标识
  function duquPeizhi() {
    return {
      genMulu: duquShezhi.get('ziliaoKuGenMulu')?.value ?? '',
      kuId: duquShezhi.get('ziliaoKuId')?.value ?? '',
    }
  }

  // 读取收起态动画偏好，未设置时回退到哭泣猫咪
  function duquShouqiDonghua() {
    return duquShezhi.get('shouqiDonghua')?.value ?? 'kulian'
  }

  // 保存允许范围内的收起态动画偏好
  function sheZhiShouqiDonghua(donghua) {
    const keYongDonghua = new Set(['kulian', 'daxiao', 'aixin'])
    if (!keYongDonghua.has(donghua)) throw new Error('不支持的收起态动画')
    xieruShezhi.run('shouqiDonghua', donghua, Date.now())
    return donghua
  }

  // 写入用户选定的资料库目录
  async function sheZhiGenMulu(genMulu) {
    const biaoshiLujing = path.join(genMulu, '.aetherdock-library.json')
    await fsp.mkdir(genMulu, { recursive: true })
    await Promise.all([
      fsp.mkdir(path.join(genMulu, 'images'), { recursive: true }),
      fsp.mkdir(path.join(genMulu, 'documents'), { recursive: true }),
      fsp.mkdir(path.join(genMulu, '.staging'), { recursive: true }),
    ])

    let biaoshi = null
    try {
      biaoshi = JSON.parse(await fsp.readFile(biaoshiLujing, 'utf8'))
    } catch {
      biaoshi = { libraryId: randomUUID(), createdAt: Date.now(), version: 1 }
      await fsp.writeFile(biaoshiLujing, `${JSON.stringify(biaoshi, null, 2)}\n`, 'utf8')
    }

    const shijian = Date.now()
    xieruShezhi.run('ziliaoKuGenMulu', genMulu, shijian)
    xieruShezhi.run('ziliaoKuId', biaoshi.libraryId, shijian)
    return duquPeizhi()
  }

  // 基于扩展名与浏览器 MIME 初步归类本地文件
  function shibieBendiWenjian(wenjian) {
    const kuozhan = path.extname(wenjian.name ?? wenjian.lujing).toLowerCase()
    if (wenjian.type?.startsWith('image/') || tupianKuozhan.has(kuozhan)) return { leixing: 'image', mimeType: wenjian.type || null }
    if (wenjianKuozhan.has(kuozhan)) return { leixing: 'document', mimeType: wenjian.type || null }
    return null
  }

  // 生成资源管理器中可辨认且不会冲突的受管文件名
  function shengchengGuankongWenjianMing(yuanLujing, id) {
    const kuozhan = path.extname(yuanLujing)
    const yuanMing = path.basename(yuanLujing, kuozhan)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30) || 'untitled'
    return `${id}_${yuanMing}${kuozhan.toLowerCase()}`
  }

  // 将本地文件先复制到同卷暂存区，再原子移动至资料库正式目录
  async function fuzhiDaoGuankongMulu(yuanLujing, leixing, id) {
    const { genMulu } = duquPeizhi()
    if (!genMulu) throw new Error('请先设置资料库目录')
    const fenleiMulu = leixing === 'image' ? 'images' : 'documents'
    const xiangduiLujing = path.join(fenleiMulu, shengchengGuankongWenjianMing(yuanLujing, id))
    const zuizhongLujing = path.resolve(genMulu, xiangduiLujing)
    const zancunLujing = path.join(genMulu, '.staging', `${id}.part`)
    await fsp.copyFile(yuanLujing, zancunLujing)
    await fsp.rename(zancunLujing, zuizhongLujing)
    return { xiangduiLujing, zuizhongLujing }
  }

  // 只解析资料库内的相对路径，防止渲染层伪造路径访问任意文件
  function jiexiGuankongLujing(tiaomu) {
    const { genMulu } = duquPeizhi()
    if (!genMulu || !tiaomu.relativePath) return ''
    const genMuluJuedui = path.resolve(genMulu)
    const wenjianLujing = path.resolve(genMuluJuedui, tiaomu.relativePath)
    return wenjianLujing.startsWith(`${genMuluJuedui}${path.sep}`) ? wenjianLujing : ''
  }

  // 规范化网址用于收藏去重，不改变用户展示用的原始地址
  function guifanHuaWangzhi(yuanWangzhi) {
    const wangzhi = new URL(yuanWangzhi)
    if (!['http:', 'https:'].includes(wangzhi.protocol)) return null
    wangzhi.hash = ''
    wangzhi.hostname = wangzhi.hostname.toLowerCase()
    if ((wangzhi.protocol === 'http:' && wangzhi.port === '80') || (wangzhi.protocol === 'https:' && wangzhi.port === '443')) wangzhi.port = ''
    return wangzhi.toString()
  }

  // 本地拖入复制为受管副本，网址则建立收藏；两者均写入资料库索引
  async function yinruNeirong({ wenjian = [], wangzhi = [] }) {
    const xinZeng = []
    const chongfu = []

    for (const dangqianWenjian of wenjian) {
      if (!dangqianWenjian?.lujing) continue
      const leixing = shibieBendiWenjian(dangqianWenjian)
      if (!leixing) continue

      let tongji
      let zhenshiLujing
      try {
        zhenshiLujing = await fsp.realpath(dangqianWenjian.lujing)
        tongji = await fsp.stat(zhenshiLujing)
      } catch {
        continue
      }
      if (!tongji.isFile()) continue

      const shijian = Date.now()
      const yicunzai = chazhaoTiaomu.get(zhenshiLujing, '')
      if (yicunzai?.storageMode === 'managed') {
        chongfu.push(yicunzai.id)
        continue
      }

      const id = yicunzai?.id ?? randomUUID()
      let fuzhiJieguo
      try {
        fuzhiJieguo = await fuzhiDaoGuankongMulu(zhenshiLujing, leixing.leixing, id)
      } catch {
        continue
      }
      const tiaomu = {
        id,
        type: leixing.leixing,
        storageMode: 'managed',
        title: path.basename(zhenshiLujing),
        sourcePath: zhenshiLujing,
        relativePath: fuzhiJieguo.xiangduiLujing,
        sourceUrl: null,
        normalizedUrl: null,
        mimeType: leixing.mimeType,
        byteSize: tongji.size,
        createdAt: shijian,
      }
      shujuKu.exec('BEGIN IMMEDIATE')
      try {
        if (yicunzai) {
          gengxinGuankongTiaomu.run(tiaomu.type, tiaomu.title, tiaomu.sourcePath, tiaomu.relativePath, tiaomu.mimeType, tiaomu.byteSize, shijian, tiaomu.id)
        } else {
          xieruTiaomu.run(tiaomu.id, tiaomu.type, tiaomu.storageMode, tiaomu.title, tiaomu.sourcePath, tiaomu.relativePath, tiaomu.sourceUrl, tiaomu.normalizedUrl, tiaomu.mimeType, tiaomu.byteSize, shijian, shijian)
        }
        shujuKu.exec('COMMIT')
        xinZeng.push(tiaomu)
      } catch (cuowu) {
        shujuKu.exec('ROLLBACK')
        await fsp.rm(fuzhiJieguo.zuizhongLujing, { force: true })
        if (String(cuowu.message).includes('UNIQUE')) chongfu.push(tiaomu.id)
        else throw cuowu
      }
    }

    for (const yuanWangzhi of wangzhi) {
      let guifanWangzhi
      try {
        guifanWangzhi = guifanHuaWangzhi(yuanWangzhi)
      } catch {
        continue
      }
      if (!guifanWangzhi) continue

      const yicunzai = chazhaoTiaomu.get('', guifanWangzhi)
      if (yicunzai) {
        chongfu.push(yicunzai.id)
        continue
      }

      const wangzhiDuixiang = new URL(guifanWangzhi)
      const shijian = Date.now()
      const tiaomu = {
        id: randomUUID(),
        type: 'url',
        storageMode: 'bookmark',
        title: wangzhiDuixiang.hostname,
        sourcePath: null,
        sourceUrl: yuanWangzhi,
        normalizedUrl: guifanWangzhi,
        mimeType: null,
        byteSize: null,
        createdAt: shijian,
      }
      shujuKu.exec('BEGIN IMMEDIATE')
      try {
        xieruTiaomu.run(tiaomu.id, tiaomu.type, tiaomu.storageMode, tiaomu.title, tiaomu.sourcePath, null, tiaomu.sourceUrl, tiaomu.normalizedUrl, tiaomu.mimeType, tiaomu.byteSize, shijian, shijian)
        shujuKu.exec('COMMIT')
        xinZeng.push(tiaomu)
      } catch (cuowu) {
        shujuKu.exec('ROLLBACK')
        if (String(cuowu.message).includes('UNIQUE')) chongfu.push(tiaomu.id)
        else throw cuowu
      }
    }

    return { xinZeng, chongfu }
  }

  // 读取条目时同步受管副本或本地引用状态，避免显示失效文件为正常状态
  function duquTiaomuLiebiao() {
    return duquTiaomu.all().map((tiaomu) => {
      if (tiaomu.storageMode === 'reference' || tiaomu.storageMode === 'managed') {
        const benDiLujing = tiaomu.storageMode === 'managed' ? jiexiGuankongLujing(tiaomu) : tiaomu.sourcePath
        const shifouCunzai = Boolean(benDiLujing && fs.existsSync(benDiLujing))
        return { ...tiaomu, status: shifouCunzai ? 'ready' : 'missing' }
      }
      return tiaomu
    })
  }

  // 主进程按条目 ID 读取来源，避免信任渲染层提交的任意路径
  function duquTiaomuXiangqing(id) {
    return duquDanGeTiaomu.get(id) ?? null
  }

  function duquTiaomuBendiLujing(tiaomu) {
    if (tiaomu?.storageMode === 'managed') return jiexiGuankongLujing(tiaomu)
    return tiaomu?.storageMode === 'reference' ? tiaomu.sourcePath : ''
  }

  // 删除条目：先删除数据库记录，成功后再清理本地受管副本，避免删了文件却入库失败
  async function shanchuTiaomu(id) {
    const tiaomu = duquDanGeTiaomu.get(id)
    if (!tiaomu) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
    const benDiLujing = duquTiaomuBendiLujing(tiaomu)
    shujuKu.exec('BEGIN IMMEDIATE')
    try {
      shanchuTiaomuYuju.run(id)
      shujuKu.exec('COMMIT')
    } catch (cuowu) {
      shujuKu.exec('ROLLBACK')
      throw cuowu
    }
    // 入库删除已成功，本地副本清理失败只静默忽略，不回滚已删除的记录
    if (benDiLujing) {
      try { await fsp.rm(benDiLujing, { force: true }) } catch {}
    }
    return { chenggong: true }
  }

  function guanbi() {
    shujuKu.close()
  }

  return { duquPeizhi, duquShouqiDonghua, sheZhiShouqiDonghua, sheZhiGenMulu, yinruNeirong, duquTiaomuLiebiao, duquTiaomuXiangqing, duquTiaomuBendiLujing, shanchuTiaomu, guanbi }
}

module.exports = { chuangjianZiliaoku }
