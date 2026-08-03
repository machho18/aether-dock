const { DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const imageExts = new Set(['.avif', '.bmp', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const documentExts = new Set(['.csv', '.doc', '.docx', '.md', '.odp', '.ods', '.odt', '.pdf', '.ppt', '.pptx', '.rtf', '.txt', '.xls', '.xlsx'])
const availableAnimations = new Set(['kulian', 'daxiao', 'aixin'])
const itemTypes = ['document', 'image', 'url', 'application']
const itemTypeSet = new Set(itemTypes)
const itemSummaryColumns = 'id, type, storageMode, title, sourcePath, sourceUrl, status, iconCacheKey, iconStatus, thumbnailCacheKey, thumbnailStatus, createdAt, updatedAt'

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

  const itemsBiaoSchema = `
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('document', 'image', 'url', 'application')),
      storageMode TEXT NOT NULL CHECK(storageMode IN ('reference', 'managed', 'bookmark', 'shortcut')),
      title TEXT NOT NULL,
      sourcePath TEXT,
      relativePath TEXT,
      sourceUrl TEXT,
      normalizedUrl TEXT,
      mimeType TEXT,
      byteSize INTEGER,
      targetPath TEXT,
      launchArgs TEXT,
      workingDirectory TEXT,
      shortcutFingerprint TEXT,
      iconCacheKey TEXT,
      iconStatus TEXT,
      thumbnailCacheKey TEXT,
      thumbnailStatus TEXT,
      sourceScope TEXT,
      lastSeenAt INTEGER,
      lastCheckedAt INTEGER,
      missingReason TEXT,
      status TEXT NOT NULL DEFAULT 'ready',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `
  const itemsTable = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'").get()
  // 表约束无法通过 ALTER 修改；发现旧结构时事务内重建并仅复制双方共有字段。
  if (itemsTable?.sql && (!itemsTable.sql.includes("'application'") || !itemsTable.sql.includes("'shortcut'") || !itemsTable.sql.includes('targetPath'))) {
    const legacyZiduan = new Set(db.prepare('PRAGMA table_info(items)').all().map(({ name }) => name))
    const currentZiduan = [
      'id', 'type', 'storageMode', 'title', 'sourcePath', 'relativePath', 'sourceUrl',
      'normalizedUrl', 'mimeType', 'byteSize', 'status', 'createdAt', 'updatedAt',
    ].filter((column) => legacyZiduan.has(column))
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(`
        DROP INDEX IF EXISTS idx_items_reference_source_path;
        DROP INDEX IF EXISTS idx_items_bookmark_normalized_url;
        DROP INDEX IF EXISTS idx_items_shortcut_source_path;
        ALTER TABLE items RENAME TO items_legacy;
        ${itemsBiaoSchema}
        INSERT INTO items (${currentZiduan.join(', ')}) SELECT ${currentZiduan.join(', ')} FROM items_legacy;
        DROP TABLE items_legacy;
      `)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  } else if (!itemsTable) {
    db.exec(itemsBiaoSchema)
  }

  const itemsZiduan = new Set(db.prepare('PRAGMA table_info(items)').all().map(({ name }) => name))
  if (!itemsZiduan.has('iconCacheKey')) db.exec('ALTER TABLE items ADD COLUMN iconCacheKey TEXT')
  if (!itemsZiduan.has('iconStatus')) db.exec('ALTER TABLE items ADD COLUMN iconStatus TEXT')
  if (!itemsZiduan.has('thumbnailCacheKey')) db.exec('ALTER TABLE items ADD COLUMN thumbnailCacheKey TEXT')
  if (!itemsZiduan.has('thumbnailStatus')) db.exec('ALTER TABLE items ADD COLUMN thumbnailStatus TEXT')
  db.exec(`
    UPDATE items
    SET iconCacheKey = shortcutFingerprint, iconStatus = 'pending'
    WHERE type = 'application' AND shortcutFingerprint IS NOT NULL AND iconCacheKey IS NULL
  `)
  // 旧版本没有全局 URL 唯一约束；保留首条记录并解除其余重复项的去重键。
  db.exec(`
    UPDATE items SET normalizedUrl = NULL
    WHERE normalizedUrl IS NOT NULL AND rowid NOT IN (
      SELECT MIN(rowid) FROM items WHERE normalizedUrl IS NOT NULL GROUP BY normalizedUrl
    )
  `)

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_reference_source_path
      ON items(sourcePath)
      WHERE storageMode = 'reference' AND sourcePath IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_bookmark_normalized_url
      ON items(normalizedUrl)
      WHERE storageMode = 'bookmark' AND normalizedUrl IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_normalized_url
      ON items(normalizedUrl)
      WHERE normalizedUrl IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_shortcut_source_path
      ON items(sourcePath COLLATE NOCASE)
      WHERE storageMode = 'shortcut' AND sourcePath IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_items_type_created
      ON items(type, createdAt DESC, id);
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
  const readShortcutByPathStmt = db.prepare("SELECT * FROM items WHERE storageMode = 'shortcut' AND sourcePath = ? COLLATE NOCASE LIMIT 1")
  const readShortcutByFingerprintStmt = db.prepare("SELECT * FROM items WHERE storageMode = 'shortcut' AND shortcutFingerprint = ? LIMIT 1")
  const insertShortcutStmt = db.prepare(`
    INSERT INTO items (
      id, type, storageMode, title, sourcePath, mimeType, targetPath, launchArgs,
      workingDirectory, shortcutFingerprint, iconCacheKey, iconStatus, sourceScope, lastSeenAt, lastCheckedAt,
      missingReason, status, createdAt, updatedAt
    ) VALUES (?, 'application', 'shortcut', ?, ?, 'application/x-ms-shortcut', ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateShortcutStmt = db.prepare(`
    UPDATE items SET
      title = ?, sourcePath = ?, targetPath = ?, launchArgs = ?, workingDirectory = ?,
      shortcutFingerprint = ?, iconCacheKey = ?,
      iconStatus = CASE WHEN iconCacheKey = ? AND iconStatus = 'ready' THEN 'ready' ELSE 'pending' END,
      sourceScope = ?, lastSeenAt = ?, lastCheckedAt = ?,
      missingReason = ?, status = ?, updatedAt = ?
    WHERE id = ?
  `)
  const markMissingShortcutsStmt = db.prepare(`
    UPDATE items SET status = 'shortcut_missing', missingReason = 'shortcut_missing', lastCheckedAt = ?, updatedAt = ?
    WHERE storageMode = 'shortcut' AND sourceScope = ? AND (lastSeenAt IS NULL OR lastSeenAt < ?) AND status != 'shortcut_missing'
  `)
  const readItemCountsStmt = db.prepare('SELECT type, COUNT(*) AS count FROM items GROUP BY type')
  const readLatestUpdateStmt = db.prepare('SELECT MAX(updatedAt) AS updatedAt FROM items')
  const readApplicationCacheItemsStmt = db.prepare("SELECT id, type, iconCacheKey, iconStatus FROM items WHERE type = 'application'")
  const updateApplicationIconStmt = db.prepare(`
    UPDATE items SET iconCacheKey = ?, iconStatus = ?
    WHERE id = ? AND type = 'application'
  `)
  const updateImageThumbnailStmt = db.prepare(`
    UPDATE items SET thumbnailCacheKey = ?, thumbnailStatus = ?
    WHERE id = ? AND type = 'image'
  `)
  const readItemStmt = db.prepare('SELECT * FROM items WHERE id = ?')
  const deleteItemStmt = db.prepare('DELETE FROM items WHERE id = ?')

  // 数据库写入统一使用事务包装，保证异常时始终回滚。
  function runTransaction(action) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = action()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

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
      try {
        runTransaction(() => {
          if (existing) {
            updateManagedItemStmt.run(item.type, item.title, item.sourcePath, item.relativePath, item.mimeType, item.byteSize, timestamp, item.id)
          } else {
            insertItemStmt.run(item.id, item.type, item.storageMode, item.title, item.sourcePath, item.relativePath, item.sourceUrl, item.normalizedUrl, item.mimeType, item.byteSize, timestamp, timestamp)
          }
        })
        added.push(item)
      } catch (error) {
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
      try {
        runTransaction(() => {
          insertItemStmt.run(item.id, item.type, item.storageMode, item.title, item.sourcePath, null, item.sourceUrl, item.normalizedUrl, item.mimeType, item.byteSize, timestamp, timestamp)
        })
        added.push(item)
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) duplicates.push(item.id)
        else throw error
      }
    }

    return { added, duplicates }
  }

  // 网络资源直接流入资料库暂存区，完成大小校验后再原子提交。
  async function importRemoteContent({ sourceUrl, filename, mimeType, contentLength, body, maxBytes }) {
    const normalizedUrl = normalizeUrl(sourceUrl)
    if (!normalizedUrl || !body) return { added: [], duplicates: [] }
    const existing = findItemStmt.get('', normalizedUrl)
    if (existing) {
      if (typeof body.cancel === 'function') await body.cancel().catch(() => {})
      else body.destroy?.()
      return { added: [], duplicates: [existing.id] }
    }

    const safeFilename = path.basename(filename || 'download')
    const classification = classifyLocalFile({ name: safeFilename, path: safeFilename, type: mimeType })
    if (!classification) {
      if (typeof body.cancel === 'function') await body.cancel().catch(() => {})
      else body.destroy?.()
      return { added: [], duplicates: [] }
    }
    if (contentLength > maxBytes) {
      if (typeof body.cancel === 'function') await body.cancel().catch(() => {})
      else body.destroy?.()
      throw new Error('网络资源超过允许大小')
    }

    const { rootdir } = getConfig()
    if (!rootdir) {
      if (typeof body.cancel === 'function') await body.cancel().catch(() => {})
      else body.destroy?.()
      throw new Error('请先设置资料库目录')
    }
    const id = randomUUID()
    const categoryDir = classification.type === 'image' ? 'images' : 'documents'
    const relativePath = path.join(categoryDir, generateManagedFilename(safeFilename, id))
    const finalPath = path.resolve(rootdir, relativePath)
    const stagingPath = path.join(rootdir, '.staging', `${id}.download`)
    let byteSize = 0
    const sizeLimiter = new Transform({
      transform(chunk, encoding, callback) {
        byteSize += chunk.length
        callback(byteSize > maxBytes ? new Error('网络资源超过允许大小') : null, chunk)
      },
    })

    try {
      await pipeline(
        typeof body.getReader === 'function' ? Readable.fromWeb(body) : body,
        sizeLimiter,
        fs.createWriteStream(stagingPath, { flags: 'wx' }),
      )
      if (!byteSize) throw new Error('网络资源为空')
      await fsp.rename(stagingPath, finalPath)
    } catch (error) {
      await fsp.rm(stagingPath, { force: true }).catch(() => {})
      throw error
    }

    const timestamp = Date.now()
    const item = {
      id,
      type: classification.type,
      storageMode: 'managed',
      title: safeFilename,
      sourcePath: null,
      relativePath,
      sourceUrl,
      normalizedUrl,
      mimeType: mimeType || classification.mimeType,
      byteSize,
      createdAt: timestamp,
    }
    try {
      runTransaction(() => {
        insertItemStmt.run(
          item.id, item.type, item.storageMode, item.title, item.sourcePath, item.relativePath,
          item.sourceUrl, item.normalizedUrl, item.mimeType, item.byteSize, timestamp, timestamp,
        )
      })
      return { added: [item], duplicates: [] }
    } catch (error) {
      await fsp.rm(finalPath, { force: true }).catch(() => {})
      if (String(error.message).includes('UNIQUE')) {
        const duplicate = findItemStmt.get('', normalizedUrl)
        return { added: [], duplicates: duplicate ? [duplicate.id] : [] }
      }
      throw error
    }
  }

  // 将桌面扫描结果幂等同步到资料库；快捷方式移动时通过目标指纹复用原条目。
  function tongbuDesktopShortcuts({ shortcuts = [], scannedScopes = [], scannedAt = Date.now() }) {
    const result = { added: 0, updated: 0, recovered: 0, missing: 0, skipped: 0, unreadable: 0 }
    runTransaction(() => {
      for (const shortcut of shortcuts) {
        const existingByPath = readShortcutByPathStmt.get(shortcut.sourcePath)
        const existingByFingerprint = shortcut.shortcutFingerprint
          ? readShortcutByFingerprintStmt.get(shortcut.shortcutFingerprint)
          : null
        const existing = existingByPath ?? existingByFingerprint
        const status = shortcut.status || 'ready'
        const missingReason = status === 'ready' ? null : status

        if (!existing) {
          const id = randomUUID()
          insertShortcutStmt.run(
            id, shortcut.title, shortcut.sourcePath, shortcut.targetPath, shortcut.launchArgs,
            shortcut.workingDirectory, shortcut.shortcutFingerprint, shortcut.shortcutFingerprint, shortcut.sourceScope,
            scannedAt, scannedAt, missingReason, status, scannedAt, scannedAt,
          )
          result.added += 1
          if (status === 'unreadable') result.unreadable += 1
          continue
        }

        const changed = existing.title !== shortcut.title
          || existing.sourcePath.toLowerCase() !== shortcut.sourcePath.toLowerCase()
          || existing.targetPath !== shortcut.targetPath
          || existing.launchArgs !== shortcut.launchArgs
          || existing.workingDirectory !== shortcut.workingDirectory
          || existing.shortcutFingerprint !== shortcut.shortcutFingerprint
          || existing.status !== status
        if (existing.status !== 'ready' && status === 'ready') result.recovered += 1
        else if (changed) result.updated += 1
        else result.skipped += 1
        if (status === 'unreadable') result.unreadable += 1
        updateShortcutStmt.run(
          shortcut.title, shortcut.sourcePath, shortcut.targetPath, shortcut.launchArgs,
          shortcut.workingDirectory, shortcut.shortcutFingerprint, shortcut.shortcutFingerprint,
          shortcut.shortcutFingerprint, shortcut.sourceScope,
          scannedAt, scannedAt, missingReason, status, scannedAt, existing.id,
        )
      }

      for (const scope of scannedScopes) {
        const updateResult = markMissingShortcutsStmt.run(scannedAt, scannedAt, scope, scannedAt)
        result.missing += Number(updateResult.changes ?? 0)
      }
    })
    return result
  }

  function normalizePageOptions(options = {}) {
    const type = itemTypeSet.has(options.type) ? options.type : 'document'
    const direction = options.direction === 'previous' ? 'previous' : 'next'
    const limit = Math.max(1, Math.min(Number(options.limit) || 30, 50))
    const createdAt = Number(options.cursor?.createdAt)
    const cursor = Number.isFinite(createdAt) && typeof options.cursor?.id === 'string'
      ? { createdAt, id: options.cursor.id }
      : null
    return { type, direction, limit, cursor }
  }

  // 以 createdAt + id 作为稳定游标，避免大数据量下 OFFSET 随页码线性退化。
  function queryItemPage(options = {}, keyword = '') {
    const { type, direction, limit, cursor } = normalizePageOptions(options)
    const params = [type]
    const conditions = ['type = ?']
    if (keyword) {
      conditions.push("(title LIKE ? ESCAPE '\\' OR sourcePath LIKE ? ESCAPE '\\' OR sourceUrl LIKE ? ESCAPE '\\')")
      const pattern = `%${keyword.replace(/[\\%_]/g, '\\$&')}%`
      params.push(pattern, pattern, pattern)
    }
    if (cursor) {
      const operator = direction === 'previous' ? '>' : '<'
      const idOperator = direction === 'previous' ? '<' : '>'
      conditions.push(`(createdAt ${operator} ? OR (createdAt = ? AND id ${idOperator} ?))`)
      params.push(cursor.createdAt, cursor.createdAt, cursor.id)
    }

    const order = direction === 'previous' ? 'createdAt ASC, id DESC' : 'createdAt DESC, id ASC'
    const rows = db.prepare(`
      SELECT ${itemSummaryColumns} FROM items
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${order}
      LIMIT ?
    `).all(...params, limit + 1)
    const hasMore = rows.length > limit
    if (hasMore) rows.pop()
    if (direction === 'previous') rows.reverse()

    return {
      items: rows,
      previousCursor: rows.length ? { createdAt: rows[0].createdAt, id: rows[0].id } : null,
      nextCursor: rows.length ? { createdAt: rows.at(-1).createdAt, id: rows.at(-1).id } : null,
      hasPrevious: direction === 'previous' ? hasMore : Boolean(cursor),
      hasNext: direction === 'next' ? hasMore : Boolean(cursor),
    }
  }

  function getLibrarySummary() {
    const counts = Object.fromEntries(itemTypes.map((type) => [type, 0]))
    for (const row of readItemCountsStmt.all()) counts[row.type] = Number(row.count)
    return {
      counts,
      updatedAt: Number(readLatestUpdateStmt.get()?.updatedAt ?? 0),
      defaultType: 'document',
      defaultPage: queryItemPage({ type: 'document', limit: 30 }),
    }
  }

  function getLibraryPage(options) {
    return queryItemPage(options)
  }

  function searchLibrary(options = {}) {
    const keyword = typeof options.keyword === 'string' ? options.keyword.trim().slice(0, 200) : ''
    if (!keyword) return queryItemPage(options)
    return queryItemPage(options, keyword)
  }

  function getApplicationCacheItems() {
    return readApplicationCacheItemsStmt.all()
  }

  function getItemByUrl(rawUrl) {
    try {
      const normalizedUrl = normalizeUrl(rawUrl)
      return normalizedUrl ? findItemStmt.get('', normalizedUrl) ?? null : null
    } catch {
      return null
    }
  }

  function setApplicationIconCache(id, cacheKey, status) {
    if (!['pending', 'ready', 'failed'].includes(status)) throw new Error('不支持的图标缓存状态')
    updateApplicationIconStmt.run(cacheKey, status, id)
  }

  function setImageThumbnailCache(id, cacheKey, status) {
    if (!['pending', 'ready', 'failed'].includes(status)) throw new Error('不支持的缩略图缓存状态')
    updateImageThumbnailStmt.run(cacheKey, status, id)
  }

  // 主进程按条目 ID 读取来源，避免信任渲染层提交的任意路径
  function getItemDetail(id) {
    return readItemStmt.get(id) ?? null
  }

  function getItemLocalPath(item) {
    if (item?.storageMode === 'managed') return resolveManagedPath(item)
    if (item?.storageMode === 'shortcut') return item.sourcePath || ''
    return item?.storageMode === 'reference' ? item.sourcePath : ''
  }

  // 删除条目：先删除数据库记录，成功后再清理本地受管副本，避免删了文件却入库失败
  async function deleteItem(id) {
    const item = readItemStmt.get(id)
    if (!item) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
    const localPath = item.storageMode === 'managed' ? resolveManagedPath(item) : ''
    runTransaction(() => deleteItemStmt.run(id))
    // 入库删除已成功，本地副本清理失败只静默忽略，不回滚已删除的记录
    if (localPath) {
      try { await fsp.rm(localPath, { force: true }) } catch {}
    }
    return { chenggong: true }
  }

  function close() {
    db.close()
  }

  return {
    getConfig,
    getCollapsedAnimation,
    setCollapsedAnimation,
    setRootdir,
    importContent,
    importRemoteContent,
    tongbuDesktopShortcuts,
    getLibrarySummary,
    getLibraryPage,
    searchLibrary,
    getApplicationCacheItems,
    getItemByUrl,
    setApplicationIconCache,
    setImageThumbnailCache,
    getItemDetail,
    getItemLocalPath,
    deleteItem,
    close,
  }
}

module.exports = { createLibrary }
