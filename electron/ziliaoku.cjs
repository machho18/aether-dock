const { DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const imageExts = new Set(['.avif', '.bmp', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const documentExts = new Set(['.csv', '.doc', '.docx', '.md', '.odp', '.ods', '.odt', '.pdf', '.ppt', '.pptx', '.rtf', '.txt', '.xls', '.xlsx'])

// 创建资料库持久层，所有数据库读写仅在主进程执行
function createLibrary(dbPath) {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  // 先确保设置表存在，资料库目录迁移时仍可保留应用侧配置
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `)

  const oldItemsTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'").get()
  // 旧版本仅支持 reference；升级时保留既有记录并增加受管副本字段
  if (oldItemsTable?.sql && !oldItemsTable.sql.includes("'managed'")) {
    db.exec(`
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

  db.exec(`
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

  const readSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  const writeSettingStmt = db.prepare(`
    INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `)
  const findItemStmt = db.prepare('SELECT * FROM items WHERE sourcePath = ? OR normalizedUrl = ? LIMIT 1')
  const insertItemStmt = db.prepare(`
    INSERT INTO items (id, type, storageMode, title, sourcePath, relativePath, sourceUrl, normalizedUrl, mimeType, byteSize, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)
  `)
  const updateManagedItemStmt = db.prepare(`
    UPDATE items SET type = ?, storageMode = 'managed', title = ?, sourcePath = ?, relativePath = ?, mimeType = ?, byteSize = ?, status = 'ready', updatedAt = ? WHERE id = ?
  `)
  const readItemsStmt = db.prepare('SELECT * FROM items ORDER BY createdAt DESC')
  const readItemStmt = db.prepare('SELECT * FROM items WHERE id = ?')
  const deleteItemStmt = db.prepare('DELETE FROM items WHERE id = ?')

  // 读取资料库根目录与稳定标识
  function getConfig() {
    return {
      rootdir: readSettingStmt.get('ziliaoKuGenMulu')?.value ?? '',
      libraryId: readSettingStmt.get('ziliaoKuId')?.value ?? '',
    }
  }

  // 读取收起态动画偏好，未设置时回退到哭泣猫咪
  function getCollapsedAnimation() {
    return readSettingStmt.get('shouqiDonghua')?.value ?? 'kulian'
  }

  // 保存允许范围内的收起态动画偏好
  function setCollapsedAnimation(animation) {
    const availableAnimations = new Set(['kulian', 'daxiao', 'aixin'])
    if (!availableAnimations.has(animation)) throw new Error('不支持的收起态动画')
    writeSettingStmt.run('shouqiDonghua', animation, Date.now())
    return animation
  }

  // 写入用户选定的资料库目录
  async function setRootdir(rootdir) {
    const markerPath = path.join(rootdir, '.aetherdock-library.json')
    await fsp.mkdir(rootdir, { recursive: true })
    await Promise.all([
      fsp.mkdir(path.join(rootdir, 'images'), { recursive: true }),
      fsp.mkdir(path.join(rootdir, 'documents'), { recursive: true }),
      fsp.mkdir(path.join(rootdir, '.staging'), { recursive: true }),
    ])

    let marker = null
    try {
      marker = JSON.parse(await fsp.readFile(markerPath, 'utf8'))
    } catch {
      marker = { libraryId: randomUUID(), createdAt: Date.now(), version: 1 }
      await fsp.writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
    }

    const timestamp = Date.now()
    writeSettingStmt.run('ziliaoKuGenMulu', rootdir, timestamp)
    writeSettingStmt.run('ziliaoKuId', marker.libraryId, timestamp)
    return getConfig()
  }

  // 基于扩展名与浏览器 MIME 初步归类本地文件
  function classifyLocalFile(file) {
    const ext = path.extname(file.name ?? file.path).toLowerCase()
    if (file.type?.startsWith('image/') || imageExts.has(ext)) return { type: 'image', mimeType: file.type || null }
    if (documentExts.has(ext)) return { type: 'document', mimeType: file.type || null }
    return null
  }

  // 生成资源管理器中可辨认且不会冲突的受管文件名
  function generateManagedFilename(yuanLujing, id) {
    const ext = path.extname(yuanLujing)
    const baseName = path.basename(yuanLujing, ext)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30) || 'untitled'
    return `${id}_${baseName}${ext.toLowerCase()}`
  }

  // 将本地文件先复制到同卷暂存区，再原子移动至资料库正式目录
  async function copyToManagedDir(yuanLujing, type, id) {
    const { rootdir } = getConfig()
    if (!rootdir) throw new Error('请先设置资料库目录')
    const categoryDir = type === 'image' ? 'images' : 'documents'
    const relativePath = path.join(categoryDir, generateManagedFilename(yuanLujing, id))
    const finalPath = path.resolve(rootdir, relativePath)
    const stagingPath = path.join(rootdir, '.staging', `${id}.part`)
    await fsp.copyFile(yuanLujing, stagingPath)
    await fsp.rename(stagingPath, finalPath)
    return { relativePath, finalPath }
  }

  // 只解析资料库内的相对路径，防止渲染层伪造路径访问任意文件
  function resolveManagedPath(item) {
    const { rootdir } = getConfig()
    if (!rootdir || !item.relativePath) return ''
    const rootdirAbsolute = path.resolve(rootdir)
    const filePath = path.resolve(rootdirAbsolute, item.relativePath)
    return filePath.startsWith(`${rootdirAbsolute}${path.sep}`) ? filePath : ''
  }

  // 规范化网址用于收藏去重，不改变用户展示用的原始地址
  function normalizeUrl(rawUrl) {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) url.port = ''
    return url.toString()
  }

  // 本地拖入复制为受管副本，网址则建立收藏；两者均写入资料库索引
  async function importContent({ file = [], url = [] }) {
    const added = []
    const duplicates = []

    for (const currentFile of file) {
      if (!currentFile?.path) continue
      const type = classifyLocalFile(currentFile)
      if (!type) continue

      let stat
      let realPath
      try {
        realPath = await fsp.realpath(currentFile.path)
        stat = await fsp.stat(realPath)
      } catch {
        continue
      }
      if (!stat.isFile()) continue

      const timestamp = Date.now()
      const existing = findItemStmt.get(realPath, '')
      if (existing?.storageMode === 'managed') {
        duplicates.push(existing.id)
        continue
      }

      const id = existing?.id ?? randomUUID()
      let copyResult
      try {
        copyResult = await copyToManagedDir(realPath, type.type, id)
      } catch {
        continue
      }
      const item = {
        id,
        type: type.type,
        storageMode: 'managed',
        title: path.basename(realPath),
        sourcePath: realPath,
        relativePath: copyResult.relativePath,
        sourceUrl: null,
        normalizedUrl: null,
        mimeType: type.mimeType,
        byteSize: stat.size,
        createdAt: timestamp,
      }
      db.exec('BEGIN IMMEDIATE')
      try {
        if (existing) {
          updateManagedItemStmt.run(item.type, item.title, item.sourcePath, item.relativePath, item.mimeType, item.byteSize, timestamp, item.id)
        } else {
          insertItemStmt.run(item.id, item.type, item.storageMode, item.title, item.sourcePath, item.relativePath, item.sourceUrl, item.normalizedUrl, item.mimeType, item.byteSize, timestamp, timestamp)
        }
        db.exec('COMMIT')
        added.push(item)
      } catch (error) {
        db.exec('ROLLBACK')
        await fsp.rm(copyResult.finalPath, { force: true })
        if (String(error.message).includes('UNIQUE')) duplicates.push(item.id)
        else throw error
      }
    }

    for (const rawUrl of url) {
      let guifanWangzhi
      try {
        guifanWangzhi = normalizeUrl(rawUrl)
      } catch {
        continue
      }
      if (!guifanWangzhi) continue

      const existing = findItemStmt.get('', guifanWangzhi)
      if (existing) {
        duplicates.push(existing.id)
        continue
      }

      const urlObject = new URL(guifanWangzhi)
      const timestamp = Date.now()
      const item = {
        id: randomUUID(),
        type: 'url',
        storageMode: 'bookmark',
        title: urlObject.hostname,
        sourcePath: null,
        sourceUrl: rawUrl,
        normalizedUrl: guifanWangzhi,
        mimeType: null,
        byteSize: null,
        createdAt: timestamp,
      }
      db.exec('BEGIN IMMEDIATE')
      try {
        insertItemStmt.run(item.id, item.type, item.storageMode, item.title, item.sourcePath, null, item.sourceUrl, item.normalizedUrl, item.mimeType, item.byteSize, timestamp, timestamp)
        db.exec('COMMIT')
        added.push(item)
      } catch (error) {
        db.exec('ROLLBACK')
        if (String(error.message).includes('UNIQUE')) duplicates.push(item.id)
        else throw error
      }
    }

    return { added, duplicates }
  }

  // 读取条目时同步受管副本或本地引用状态，避免显示失效文件为正常状态
  function getItemList() {
    return readItemsStmt.all().map((item) => {
      if (item.storageMode === 'reference' || item.storageMode === 'managed') {
        const localPath = item.storageMode === 'managed' ? resolveManagedPath(item) : item.sourcePath
        const exists = Boolean(localPath && fs.existsSync(localPath))
        return { ...item, status: exists ? 'ready' : 'missing' }
      }
      return item
    })
  }

  // 主进程按条目 ID 读取来源，避免信任渲染层提交的任意路径
  function getItemDetail(id) {
    return readItemStmt.get(id) ?? null
  }

  function getItemLocalPath(item) {
    if (item?.storageMode === 'managed') return resolveManagedPath(item)
    return item?.storageMode === 'reference' ? item.sourcePath : ''
  }

  // 删除条目：先删除数据库记录，成功后再清理本地受管副本，避免删了文件却入库失败
  async function deleteItem(id) {
    const item = readItemStmt.get(id)
    if (!item) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
    const localPath = getItemLocalPath(item)
    db.exec('BEGIN IMMEDIATE')
    try {
      deleteItemStmt.run(id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    // 入库删除已成功，本地副本清理失败只静默忽略，不回滚已删除的记录
    if (localPath) {
      try { await fsp.rm(localPath, { force: true }) } catch {}
    }
    return { chenggong: true }
  }

  function close() {
    db.close()
  }

  return { getConfig, getCollapsedAnimation, setCollapsedAnimation, setRootdir, importContent, getItemList, getItemDetail, getItemLocalPath, deleteItem, close }
}

module.exports = { createLibrary }
