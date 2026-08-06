const { DatabaseSync } = require('node:sqlite')
const { createHash, randomUUID } = require('node:crypto')
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
const managedCategoryDirs = Object.freeze({ image: 'images', document: 'documents' })
const managedFullScanInterval = 5 * 60 * 1000
const itemSummaryColumns = 'id, type, storageMode, title, sourcePath, relativePath, sourceUrl, libraryId, status, iconCacheKey, iconStatus, thumbnailCacheKey, thumbnailStatus, createdAt, updatedAt'

// 创建资料库持久层，所有数据库读写仅在主进程执行
function createLibrary(dbPath) {
  const db = new DatabaseSync(dbPath)
  let isClosed = false
  let managedRootGeneration = 0
  let managedWatchRevision = 0
  let managedSnapshotDirty = true
  let managedWatcherHealthy = false
  let managedWatchedKey = ''
  let managedLastScanAt = 0
  let managedLastAvailable = false
  let invalidateAllImageThumbnails = false
  const changedManagedKeys = new Set()
  let managedWatchers = []
  let managedDirtyCallback = null
  let managedDirtyTimer = null
  let managedActiveOperations = 0
  let managedDrainResolve = null
  let managedMigrationGate = null
  let managedMigrationRelease = null
  let managedOperationTail = Promise.resolve()
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
      libraryId TEXT,
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
      'id', 'type', 'storageMode', 'title', 'sourcePath', 'relativePath', 'libraryId', 'sourceUrl',
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
  if (!itemsZiduan.has('libraryId')) {
    db.exec('ALTER TABLE items ADD COLUMN libraryId TEXT')
  }
  db.exec("UPDATE items SET libraryId = (SELECT value FROM settings WHERE key = 'ziliaoKuId') WHERE storageMode = 'managed' AND libraryId IS NULL")
  db.exec(`
    UPDATE items
    SET iconCacheKey = shortcutFingerprint, iconStatus = 'pending'
    WHERE type = 'application' AND shortcutFingerprint IS NOT NULL AND iconCacheKey IS NULL
  `)
  // 书签全局去重，受管下载仅在各自资料库内去重。
  db.exec(`
    UPDATE items SET normalizedUrl = NULL
    WHERE storageMode = 'bookmark' AND normalizedUrl IS NOT NULL AND rowid NOT IN (
      SELECT MIN(rowid) FROM items WHERE storageMode = 'bookmark' AND normalizedUrl IS NOT NULL GROUP BY normalizedUrl
    );
    UPDATE items SET normalizedUrl = NULL
    WHERE storageMode = 'managed' AND normalizedUrl IS NOT NULL AND rowid NOT IN (
      SELECT MIN(rowid) FROM items
      WHERE storageMode = 'managed' AND normalizedUrl IS NOT NULL
      GROUP BY normalizedUrl, libraryId
    )
  `)

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_reference_source_path
      ON items(sourcePath)
      WHERE storageMode = 'reference' AND sourcePath IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_bookmark_normalized_url
      ON items(normalizedUrl)
      WHERE storageMode = 'bookmark' AND normalizedUrl IS NOT NULL;
    DROP INDEX IF EXISTS idx_items_normalized_url;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_managed_normalized_url
      ON items(normalizedUrl, libraryId)
      WHERE storageMode = 'managed' AND normalizedUrl IS NOT NULL AND libraryId IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_items_managed_library
      ON items(libraryId)
      WHERE storageMode = 'managed';
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
  const findItemBySourceStmt = db.prepare("SELECT * FROM items WHERE sourcePath = ? AND storageMode = 'managed' AND libraryId = ? LIMIT 1")
  const findManagedItemByRelativePathStmt = db.prepare("SELECT id FROM items WHERE storageMode = 'managed' AND libraryId = ? AND relativePath = ? COLLATE NOCASE LIMIT 1")
  const findItemByUrlStmt = db.prepare("SELECT * FROM items WHERE normalizedUrl = ? AND (storageMode != 'managed' OR libraryId = ?) ORDER BY storageMode = 'bookmark' DESC LIMIT 1")
  const insertItemStmt = db.prepare(`
    INSERT INTO items (id, type, storageMode, title, sourcePath, relativePath, libraryId, sourceUrl, normalizedUrl, mimeType, byteSize, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)
  `)
  const updateManagedItemStmt = db.prepare(`
    UPDATE items SET type = ?, storageMode = 'managed', title = ?, sourcePath = ?, relativePath = ?, libraryId = ?, mimeType = ?, byteSize = ?,
      status = 'ready', missingReason = NULL, thumbnailCacheKey = NULL,
      thumbnailStatus = CASE WHEN ? = 'image' THEN 'pending' ELSE thumbnailStatus END, updatedAt = ? WHERE id = ?
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
  const visibleItemCondition = "(storageMode != 'managed' OR (libraryId = ? AND status != 'missing'))"
  const readItemCountsStmt = db.prepare(`SELECT type, COUNT(*) AS count FROM items WHERE ${visibleItemCondition} GROUP BY type`)
  const readLatestUpdateStmt = db.prepare(`SELECT MAX(updatedAt) AS updatedAt FROM items WHERE ${visibleItemCondition}`)
  const readManagedItemsStmt = db.prepare("SELECT id, type, title, relativePath, status, thumbnailCacheKey FROM items WHERE storageMode = 'managed' AND libraryId = ?")
  const countManagedItemsByLibraryStmt = db.prepare("SELECT COUNT(*) AS count FROM items WHERE storageMode = 'managed' AND libraryId = ?")
  const markManagedMissingStmt = db.prepare(`
    UPDATE items SET status = 'missing', missingReason = 'missing', lastCheckedAt = ?, updatedAt = ?,
      thumbnailCacheKey = NULL, thumbnailStatus = CASE WHEN type = 'image' THEN 'missing' ELSE thumbnailStatus END
    WHERE id = ? AND storageMode = 'managed' AND libraryId = ? AND relativePath = ? AND status = ?
  `)
  const markManagedReadyStmt = db.prepare(`
    UPDATE items SET status = 'ready', missingReason = NULL, lastCheckedAt = ?, updatedAt = ?,
      thumbnailCacheKey = NULL, thumbnailStatus = CASE WHEN type = 'image' THEN 'pending' ELSE thumbnailStatus END
    WHERE id = ? AND storageMode = 'managed' AND libraryId = ? AND relativePath = ? AND status = ?
  `)
  const invalidateManagedImageThumbnailStmt = db.prepare(`
    UPDATE items SET thumbnailCacheKey = NULL, thumbnailStatus = 'pending', updatedAt = ?
    WHERE id = ? AND storageMode = 'managed' AND libraryId = ? AND relativePath = ? AND status = 'ready' AND type = 'image'
  `)
  const readApplicationCacheItemsStmt = db.prepare("SELECT id, type, iconCacheKey, iconStatus FROM items WHERE type = 'application'")
  const readIconCacheItemsStmt = db.prepare("SELECT id, type, iconCacheKey, iconStatus FROM items WHERE type IN ('application', 'url')")
  const updateApplicationIconStmt = db.prepare(`
    UPDATE items SET iconCacheKey = ?, iconStatus = ?
    WHERE id = ? AND type = 'application'
  `)
  const updateWebsiteIconStmt = db.prepare(`
    UPDATE items SET iconCacheKey = ?, iconStatus = ?
    WHERE id = ? AND type = 'url'
  `)
  const updateImageThumbnailStmt = db.prepare(`
    UPDATE items SET thumbnailCacheKey = ?, thumbnailStatus = ?
    WHERE id = ? AND type = 'image' AND storageMode = 'managed' AND libraryId = ?
      AND relativePath = ? AND updatedAt = ? AND status = 'ready'
  `)
  const readItemStmt = db.prepare('SELECT * FROM items WHERE id = ?')
  const renameItemStmt = db.prepare(`
    UPDATE items SET title = ?, relativePath = ?, updatedAt = ?,
      status = CASE WHEN storageMode = 'managed' THEN 'ready' ELSE status END,
      missingReason = CASE WHEN storageMode = 'managed' THEN NULL ELSE missingReason END
    WHERE id = ? AND type != 'application'
  `)
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

  function createMigrationError(code, message, conflictPath = '') {
    const error = new Error(message)
    error.code = code
    error.conflictPath = conflictPath
    return error
  }

  async function isEmptyLibraryTarget(rootdir, libraryId) {
    if (Number(countManagedItemsByLibraryStmt.get(libraryId)?.count ?? 0)) return false
    for (const directory of Object.values(managedCategoryDirs)) {
      try {
        if ((await fsp.readdir(path.join(rootdir, directory))).length) return false
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    return true
  }

  async function replaceLibraryMarker(markerPath, markerContent) {
    const temporaryPath = `${markerPath}.${randomUUID()}.tmp`
    const backupPath = `${markerPath}.${randomUUID()}.bak`
    let handle
    try {
      handle = await fsp.open(temporaryPath, 'wx')
      await handle.writeFile(markerContent, 'utf8')
      await handle.sync()
      await handle.close()
      handle = null
      await fsp.rename(markerPath, backupPath)
      try {
        await fsp.rename(temporaryPath, markerPath)
      } catch (error) {
        await fsp.rename(backupPath, markerPath).catch(() => {})
        throw error
      }
      await fsp.rm(backupPath, { force: true }).catch(() => {})
    } finally {
      await handle?.close().catch(() => {})
      await fsp.rm(temporaryPath, { force: true }).catch(() => {})
    }
  }

  async function prepareLibraryTarget(rootdir, expectedLibraryId = '') {
    const resolvedRootdir = path.resolve(rootdir)
    await fsp.mkdir(resolvedRootdir, { recursive: true })
    const rootStat = await fsp.lstat(resolvedRootdir)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw createMigrationError('invalid_target', '目标目录不可用')
    const markerPath = path.join(resolvedRootdir, '.aetherdock-library.json')
    let marker = null
    let createdMarker = false
    let replacedMarkerContent = ''
    try {
      const markerStat = await fsp.lstat(markerPath)
      if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size > 64 * 1024) throw new Error('资料库标记无效')
      const markerContent = await fsp.readFile(markerPath, 'utf8')
      marker = JSON.parse(markerContent)
      if (typeof marker.libraryId !== 'string' || !marker.libraryId) throw new Error('资料库标记无效')
      if (expectedLibraryId && marker.libraryId !== expectedLibraryId) {
        if (!(await isEmptyLibraryTarget(resolvedRootdir, marker.libraryId))) {
          throw createMigrationError('target_library_conflict', '目标目录属于另一个资料库')
        }
        replacedMarkerContent = markerContent
        marker = { ...marker, libraryId: expectedLibraryId, migratedAt: Date.now() }
        await replaceLibraryMarker(markerPath, `${JSON.stringify(marker, null, 2)}\n`)
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        if (error?.code === 'target_library_conflict') throw error
        throw createMigrationError('invalid_target', '目标资料库标记无效', markerPath)
      }
    }

    await Promise.all(Object.values(managedCategoryDirs).concat('.staging').map((directory) => (
      fsp.mkdir(path.join(resolvedRootdir, directory), { recursive: true })
    )))
    if (!marker) {
      marker = { libraryId: expectedLibraryId || randomUUID(), createdAt: Date.now(), version: 1 }
      let markerHandle
      let ownsMarker = false
      try {
        markerHandle = await fsp.open(markerPath, 'wx')
        ownsMarker = true
        await markerHandle.writeFile(`${JSON.stringify(marker, null, 2)}\n`, 'utf8')
        await markerHandle.sync()
        createdMarker = true
      } catch (error) {
        await markerHandle?.close().catch(() => {})
        markerHandle = null
        if (ownsMarker) await fsp.rm(markerPath, { force: true }).catch(() => {})
        throw error
      } finally {
        await markerHandle?.close().catch(() => {})
      }
    }
    try {
      const config = { rootdir: resolvedRootdir, libraryId: marker.libraryId }
      if (!(await validateLibraryConfig(config))) throw createMigrationError('invalid_target', '目标目录校验失败')
      if (createdMarker) {
        await syncFile(markerPath)
        await syncDirectory(resolvedRootdir)
      }
      return { config, markerPath, createdMarker, replacedMarkerContent }
    } catch (error) {
      if (createdMarker) await fsp.rm(markerPath, { force: true }).catch(() => {})
      else if (replacedMarkerContent) await replaceLibraryMarker(markerPath, replacedMarkerContent).catch(() => {})
      throw error
    }
  }

  async function hashFile(filePath) {
    const hash = createHash('sha256')
    await pipeline(fs.createReadStream(filePath), new Transform({
      transform(chunk, encoding, callback) {
        hash.update(chunk)
        callback()
      },
    }))
    return hash.digest('hex')
  }

  async function inspectMigrationFile(filePath) {
    try {
      const stat = await fsp.lstat(filePath)
      if (!stat.isFile() || stat.isSymbolicLink()) throw createMigrationError('unsafe_file', '资料库包含不安全的文件', filePath)
      return { exists: true, size: stat.size, hash: await hashFile(filePath) }
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return { exists: false, size: 0, hash: '' }
      throw error
    }
  }

  function pathsOverlap(firstPath, secondPath) {
    const relative = path.relative(firstPath, secondPath)
    return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  }

  async function removeEmptyDirectory(directoryPath) {
    try {
      await fsp.rmdir(directoryPath)
      return true
    } catch (error) {
      if (error?.code === 'ENOENT') return true
      return false
    }
  }

  async function setRootdir(rootdir) {
    await beginManagedMigration()
    const createdFiles = []
    let target = null
    const sourceConfig = getConfig()
    try {
      const resolvedTarget = path.resolve(rootdir)
      if (!sourceConfig.rootdir || !sourceConfig.libraryId) {
        target = await prepareLibraryTarget(resolvedTarget)
        const saomiaoResult = await saomiaoXianyouManagedFiles(target.config)
        const timestamp = Date.now()
        runTransaction(() => {
          writeSettingStmt.run('ziliaoKuGenMulu', target.config.rootdir, timestamp)
          writeSettingStmt.run('ziliaoKuId', target.config.libraryId, timestamp)
          for (const item of saomiaoResult.items) {
            if (findManagedItemByRelativePathStmt.get(item.libraryId, item.relativePath)) continue
            insertItemStmt.run(
              item.id, item.type, item.storageMode, item.title, item.sourcePath, item.relativePath,
              item.libraryId, item.sourceUrl, item.normalizedUrl, item.mimeType, item.byteSize,
              item.createdAt, item.updatedAt,
            )
          }
        })
        if (saomiaoResult.items.length) {
          managedSnapshotDirty = true
          invalidateAllImageThumbnails = true
        }
        startManagedWatchers(target.config)
        return {
          config: target.config,
          migration: {
            kind: 'initialized', copied: 0, reused: 0, missing: 0, missingItems: [], cleanupWarnings: 0,
            rebuilt: saomiaoResult.items.length, skipped: saomiaoResult.skipped,
          },
        }
      }

      if (!(await validateLibraryConfig(sourceConfig))) throw createMigrationError('source_unavailable', '原资料库目录暂时不可用')
      const [sourceRealPath, targetRealPath] = await Promise.all([
        fsp.realpath(sourceConfig.rootdir),
        fsp.mkdir(resolvedTarget, { recursive: true }).then(() => fsp.realpath(resolvedTarget)),
      ])
      if (process.platform === 'win32' ? sourceRealPath.toLowerCase() === targetRealPath.toLowerCase() : sourceRealPath === targetRealPath) {
        return { config: sourceConfig, migration: { kind: 'noop', copied: 0, reused: 0, missing: 0, missingItems: [], cleanupWarnings: 0 } }
      }
      if (pathsOverlap(sourceRealPath, targetRealPath) || pathsOverlap(targetRealPath, sourceRealPath)) {
        throw createMigrationError('invalid_target', '新旧资料库目录不能互相嵌套')
      }

      closeManagedWatchers()
      managedRootGeneration += 1
      target = await prepareLibraryTarget(targetRealPath, sourceConfig.libraryId)
      const items = readManagedItemsStmt.all(sourceConfig.libraryId)
      const migratedFiles = []
      let copied = 0
      let reused = 0
      let missing = 0
      const missingItems = []

      for (const item of items) {
        const relativeKey = managedRelativeKey(item.type, item.relativePath)
        if (!relativeKey) throw createMigrationError('unsafe_file', '资料库文件路径无效', item.relativePath)
        const sourcePath = resolveManagedPathForRoot(item, sourceConfig.rootdir)
        const targetPath = resolveManagedPathForRoot(item, target.config.rootdir)
        const [sourceFile, targetFile] = await Promise.all([
          inspectMigrationFile(sourcePath),
          inspectMigrationFile(targetPath),
        ])
        if (!sourceFile.exists && !targetFile.exists) {
          missing += 1
          missingItems.push({ id: item.id, title: item.title || path.basename(item.relativePath), relativePath: item.relativePath })
          continue
        }
        if (sourceFile.exists && targetFile.exists) {
          if (sourceFile.size !== targetFile.size || sourceFile.hash !== targetFile.hash) {
            throw createMigrationError('file_conflict', '目标目录存在同名但内容不同的文件', targetPath)
          }
          reused += 1
          migratedFiles.push({ sourcePath, targetPath, size: targetFile.size, hash: targetFile.hash })
          continue
        }
        if (targetFile.exists) {
          throw createMigrationError('file_conflict', '源文件缺失，无法验证目标文件', targetPath)
        }

        const stagingPath = path.join(target.config.rootdir, '.staging', `${item.id}.${randomUUID()}.migrate`)
        try {
          await fsp.copyFile(sourcePath, stagingPath, fs.constants.COPYFILE_EXCL)
          const stagedFile = await inspectMigrationFile(stagingPath)
          if (stagedFile.size !== sourceFile.size || stagedFile.hash !== sourceFile.hash) {
            throw createMigrationError('copy_verification_failed', '资源复制校验失败', sourcePath)
          }
          await syncFile(stagingPath)
          await publishManagedFile(stagingPath, targetPath)
          createdFiles.push({ path: targetPath, size: sourceFile.size, hash: sourceFile.hash })
          await syncFile(targetPath)
          const publishedFile = await inspectMigrationFile(targetPath)
          if (publishedFile.size !== sourceFile.size || publishedFile.hash !== sourceFile.hash) {
            throw createMigrationError('copy_verification_failed', '目标资源校验失败', targetPath)
          }
        } finally {
          await fsp.rm(stagingPath, { force: true }).catch(() => {})
        }
        migratedFiles.push({ sourcePath, targetPath, size: sourceFile.size, hash: sourceFile.hash })
        copied += 1
      }

      if (!(await validateLibraryConfig(sourceConfig)) || !(await validateLibraryConfig(target.config))) {
        throw createMigrationError('source_changed', '迁移期间资料库状态发生变化')
      }
      await Promise.all(migratedFiles.map(({ targetPath }) => syncFile(targetPath)))
      await Promise.all(Object.values(managedCategoryDirs).map((directory) => (
        syncDirectory(path.join(target.config.rootdir, directory))
      )))
      await syncDirectory(target.config.rootdir)
      const timestamp = Date.now()
      runTransaction(() => {
        writeSettingStmt.run('ziliaoKuGenMulu', target.config.rootdir, timestamp)
        writeSettingStmt.run('ziliaoKuId', sourceConfig.libraryId, timestamp)
      })
      startManagedWatchers(target.config)

      let cleanupWarnings = 0
      for (const migratedFile of migratedFiles) {
        try {
          const [currentSource, currentTarget] = await Promise.all([
            inspectMigrationFile(migratedFile.sourcePath),
            inspectMigrationFile(migratedFile.targetPath),
          ])
          const sourceMatches = currentSource.exists && currentSource.size === migratedFile.size && currentSource.hash === migratedFile.hash
          const targetMatches = currentTarget.exists && currentTarget.size === migratedFile.size && currentTarget.hash === migratedFile.hash
          if (!sourceMatches || !targetMatches) {
            if (currentSource.exists) cleanupWarnings += 1
            continue
          }
          const quarantinePath = path.join(sourceConfig.rootdir, '.staging', `${randomUUID()}.migrated`)
          await fsp.rename(migratedFile.sourcePath, quarantinePath)
          const [quarantinedSource, verifiedTarget] = await Promise.all([
            inspectMigrationFile(quarantinePath),
            inspectMigrationFile(migratedFile.targetPath),
          ])
          if (quarantinedSource.hash === migratedFile.hash && verifiedTarget.exists
            && verifiedTarget.size === migratedFile.size && verifiedTarget.hash === migratedFile.hash) {
            await fsp.rm(quarantinePath)
          } else {
            await publishManagedFile(quarantinePath, migratedFile.sourcePath).catch(() => {})
            cleanupWarnings += 1
          }
        } catch {
          cleanupWarnings += 1
        }
      }
      let canRemoveOldRoot = true
      await fsp.rm(path.join(sourceConfig.rootdir, '.aetherdock-library.json'), { force: true }).catch(() => {
        cleanupWarnings += 1
        canRemoveOldRoot = false
      })
      for (const directory of ['.staging', ...Object.values(managedCategoryDirs)]) {
        if (!(await removeEmptyDirectory(path.join(sourceConfig.rootdir, directory)))) {
          cleanupWarnings += 1
          canRemoveOldRoot = false
        }
      }
      const oldRootRemoved = canRemoveOldRoot && await removeEmptyDirectory(sourceConfig.rootdir)
      return { config: target.config, migration: { kind: 'migrated', copied, reused, missing, missingItems, cleanupWarnings, oldRootRemoved } }
    } catch (error) {
      await Promise.all(createdFiles.map(async (createdFile) => {
        try {
          const currentFile = await inspectMigrationFile(createdFile.path)
          if (currentFile.exists && currentFile.size === createdFile.size && currentFile.hash === createdFile.hash) {
            await fsp.rm(createdFile.path, { force: true })
          }
        } catch {}
      }))
      if (target?.createdMarker) await fsp.rm(target.markerPath, { force: true }).catch(() => {})
      else if (target?.replacedMarkerContent) await replaceLibraryMarker(target.markerPath, target.replacedMarkerContent).catch(() => {})
      if (sourceConfig.rootdir && sourceConfig.libraryId) startManagedWatchers(sourceConfig)
      throw error
    } finally {
      endManagedMigration()
    }
  }

  // 基于扩展名与浏览器 MIME 初步归类本地文件
  function classifyLocalFile(file) {
    const ext = path.extname(file.name ?? file.path).toLowerCase()
    if (file.type?.startsWith('image/') || imageExts.has(ext)) return { type: 'image', mimeType: file.type || null }
    if (documentExts.has(ext)) return { type: 'document', mimeType: file.type || null }
    return null
  }

  // 新数据库连接既有资料库时，仅扫描受管目录中的常规文件并重建可恢复索引。
  async function saomiaoXianyouManagedFiles(config) {
    const items = []
    let skipped = 0
    for (const [type, directory] of Object.entries(managedCategoryDirs)) {
      const directoryPath = path.join(config.rootdir, directory)
      const entries = await fsp.readdir(directoryPath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) {
          skipped += 1
          continue
        }
        const filePath = path.join(directoryPath, entry.name)
        let stat
        let sourcePath
        try {
          ;[stat, sourcePath] = await Promise.all([fsp.stat(filePath), fsp.realpath(filePath)])
        } catch {
          skipped += 1
          continue
        }
        if (!stat.isFile()) {
          skipped += 1
          continue
        }
        const classification = classifyLocalFile({ name: entry.name })
        if (!classification || classification.type !== type) {
          skipped += 1
          continue
        }
        const updatedAt = Math.max(0, Math.round(stat.mtimeMs || Date.now()))
        items.push({
          id: randomUUID(),
          type,
          storageMode: 'managed',
          title: entry.name,
          sourcePath,
          relativePath: path.join(directory, entry.name),
          libraryId: config.libraryId,
          sourceUrl: null,
          normalizedUrl: null,
          mimeType: classification.mimeType,
          byteSize: stat.size,
          createdAt: Math.max(0, Math.round(stat.birthtimeMs || updatedAt)),
          updatedAt,
        })
      }
    }
    return { items, skipped }
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

  async function publishManagedFile(stagingPath, finalPath) {
    try {
      await fsp.link(stagingPath, finalPath)
    } catch (error) {
      if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(error?.code)) throw error
      await fsp.copyFile(stagingPath, finalPath, fs.constants.COPYFILE_EXCL)
    }
    await fsp.rm(stagingPath, { force: true }).catch(() => {})
  }

  async function syncFile(filePath) {
    const handle = await fsp.open(filePath, 'r+')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  async function syncDirectory(directoryPath) {
    let handle
    try {
      handle = await fsp.open(directoryPath, 'r')
      await handle.sync()
    } catch (error) {
      if (!['EINVAL', 'EPERM', 'EISDIR', 'ENOTSUP'].includes(error?.code)) throw error
    } finally {
      await handle?.close().catch(() => {})
    }
  }

  function canFallbackFromLink(error) {
    return ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(error?.code)
  }

  async function copyManagedFileNoReplace(sourcePath, targetPath) {
    const sourceFile = await inspectMigrationFile(sourcePath)
    await fsp.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL)
    try {
      await syncFile(targetPath)
      const targetFile = await inspectMigrationFile(targetPath)
      if (!sourceFile.exists || targetFile.size !== sourceFile.size || targetFile.hash !== sourceFile.hash) {
        throw new Error('文件复制校验失败')
      }
    } catch (error) {
      await fsp.rm(targetPath, { force: true }).catch(() => {})
      throw error
    }
  }

  function migrationFileMatches(file, expected) {
    return file.exists && file.size === expected.size && file.hash === expected.hash
  }

  async function removeFileIfMatches(filePath, expected) {
    const file = await inspectMigrationFile(filePath).catch(() => ({ exists: false }))
    if (migrationFileMatches(file, expected)) await fsp.rm(filePath, { force: true })
  }

  async function restoreQuarantinedFile(quarantinePath, originalPath) {
    try {
      await fsp.link(quarantinePath, originalPath)
    } catch (error) {
      if (!canFallbackFromLink(error)) throw error
      await copyManagedFileNoReplace(quarantinePath, originalPath)
    }
    await fsp.rm(quarantinePath, { force: true }).catch(() => {})
  }

  async function renameManagedFileNoReplace(currentPath, nextPath) {
    const expected = await inspectMigrationFile(currentPath)
    try {
      await fsp.link(currentPath, nextPath)
    } catch (error) {
      if (!canFallbackFromLink(error)) throw error
      await copyManagedFileNoReplace(currentPath, nextPath)
    }
    const quarantinePath = path.join(path.dirname(path.dirname(currentPath)), '.staging', `.aetherdock-rename-${randomUUID()}.tmp`)
    try {
      await fsp.rename(currentPath, quarantinePath)
      const [quarantined, published] = await Promise.all([
        inspectMigrationFile(quarantinePath),
        inspectMigrationFile(nextPath),
      ])
      if (!migrationFileMatches(quarantined, expected) || !migrationFileMatches(published, expected)) {
        throw new Error('重命名期间文件发生变化')
      }
      await fsp.rm(quarantinePath, { force: true })
    } catch (error) {
      if (await inspectMigrationFile(quarantinePath).then((file) => file.exists, () => false)) {
        await restoreQuarantinedFile(quarantinePath, currentPath).catch(() => {})
      }
      await removeFileIfMatches(nextPath, expected).catch(() => {})
      throw error
    }
  }

  async function runManagedOperation(action) {
    const run = async () => {
      while (managedMigrationGate) await managedMigrationGate
      managedActiveOperations += 1
      try {
        return await action()
      } finally {
        managedActiveOperations -= 1
        if (!managedActiveOperations && managedDrainResolve) {
          managedDrainResolve()
          managedDrainResolve = null
        }
      }
    }
    const result = managedOperationTail.then(run, run)
    managedOperationTail = result.catch(() => {})
    return result
  }

  async function beginManagedMigration() {
    if (managedMigrationGate) throw new Error('资料库正在迁移')
    managedMigrationGate = new Promise((resolve) => { managedMigrationRelease = resolve })
    if (managedActiveOperations) await new Promise((resolve) => { managedDrainResolve = resolve })
  }

  function endManagedMigration() {
    const release = managedMigrationRelease
    managedMigrationGate = null
    managedMigrationRelease = null
    release?.()
  }

  async function renameManagedFileCaseOnly(currentPath, nextPath) {
    const temporaryPath = path.join(path.dirname(path.dirname(currentPath)), '.staging', `.aetherdock-rename-${randomUUID()}.tmp`)
    const expected = await inspectMigrationFile(currentPath)
    await fsp.rename(currentPath, temporaryPath)
    try {
      const quarantined = await inspectMigrationFile(temporaryPath)
      if (!migrationFileMatches(quarantined, expected)) throw new Error('重命名期间文件发生变化')
      try {
        await fsp.link(temporaryPath, nextPath)
      } catch (error) {
        if (!canFallbackFromLink(error)) throw error
        await copyManagedFileNoReplace(temporaryPath, nextPath)
      }
      const published = await inspectMigrationFile(nextPath)
      if (!migrationFileMatches(published, expected)) throw new Error('重命名校验失败')
      await fsp.rm(temporaryPath, { force: true })
    } catch (error) {
      await restoreQuarantinedFile(temporaryPath, currentPath).catch(() => {})
      await removeFileIfMatches(nextPath, expected).catch(() => {})
      throw error
    }
  }

  // 将本地文件先复制到同卷暂存区，再原子移动至资料库正式目录
  async function copyToManagedDir(yuanLujing, type, id, rootdir = getConfig().rootdir) {
    if (!rootdir) throw new Error('请先设置资料库目录')
    const categoryDir = type === 'image' ? 'images' : 'documents'
    const relativePath = path.join(categoryDir, generateManagedFilename(yuanLujing, id))
    const finalPath = path.resolve(rootdir, relativePath)
    const stagingPath = path.join(rootdir, '.staging', `${id}.${randomUUID()}.part`)
    try {
      await fsp.copyFile(yuanLujing, stagingPath, fs.constants.COPYFILE_EXCL)
      await publishManagedFile(stagingPath, finalPath)
      return { relativePath, finalPath }
    } catch (error) {
      await fsp.rm(stagingPath, { force: true }).catch(() => {})
      throw error
    }
  }

  function managedRelativeKey(type, relativePath) {
    const categoryDir = managedCategoryDirs[type]
    if (!categoryDir || typeof relativePath !== 'string' || path.isAbsolute(relativePath)) return ''
    const parts = relativePath.split(/[\\/]+/)
    if (parts.length !== 2 || parts[0] !== categoryDir || !parts[1] || ['.', '..'].includes(parts[1])) return ''
    const key = `${categoryDir}/${parts[1]}`
    return process.platform === 'win32' ? key.toLowerCase() : key
  }

  // 只解析资料库内的相对路径，防止渲染层伪造路径访问任意文件
  function resolveManagedPathForRoot(item, rootdir) {
    const key = managedRelativeKey(item?.type, item?.relativePath)
    return key && rootdir ? path.join(rootdir, ...key.split('/')) : ''
  }

  function resolveManagedPath(item) {
    return resolveManagedPathForRoot(item, getConfig().rootdir)
  }

  async function validateLibraryConfig(config = getConfig()) {
    if (!config.rootdir || !config.libraryId) return false
    try {
      const normalizeFsPath = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
      const rootStat = await fsp.lstat(config.rootdir)
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return false
      const rootRealPath = await fsp.realpath(config.rootdir)
      const markerPath = path.join(config.rootdir, '.aetherdock-library.json')
      const markerStat = await fsp.lstat(markerPath)
      if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size > 64 * 1024) return false
      for (const directory of [...Object.values(managedCategoryDirs), '.staging']) {
        const directoryPath = path.join(config.rootdir, directory)
        const directoryStat = await fsp.lstat(directoryPath)
        if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return false
        const directoryRealPath = await fsp.realpath(directoryPath)
        if (normalizeFsPath(directoryRealPath) !== normalizeFsPath(path.join(rootRealPath, directory))) return false
      }
      const marker = JSON.parse(await fsp.readFile(markerPath, 'utf8'))
      return marker.libraryId === config.libraryId
    } catch {
      return false
    }
  }

  function closeManagedWatchers() {
    for (const watcher of managedWatchers) watcher.close()
    managedWatchers = []
    managedWatcherHealthy = false
    managedWatchedKey = ''
  }

  function markManagedSnapshotDirty(type, filename) {
    managedSnapshotDirty = true
    managedWatchRevision += 1
    const categoryDir = managedCategoryDirs[type]
    if (!categoryDir || !filename) {
      invalidateAllImageThumbnails = true
    } else {
      const key = `${categoryDir}/${String(filename)}`
      changedManagedKeys.add(process.platform === 'win32' ? key.toLowerCase() : key)
    }
    if (managedDirtyCallback && !managedDirtyTimer) {
      managedDirtyTimer = setTimeout(() => {
        managedDirtyTimer = null
        managedDirtyCallback?.()
      }, 180)
      managedDirtyTimer.unref()
    }
  }

  function onManagedFilesDirty(callback) {
    managedDirtyCallback = typeof callback === 'function' ? callback : null
    return () => {
      if (managedDirtyCallback === callback) managedDirtyCallback = null
    }
  }

  function startManagedWatchers(config = getConfig()) {
    const previousWatchKey = managedWatchedKey
    closeManagedWatchers()
    managedRootGeneration += 1
    managedSnapshotDirty = true
    managedWatchRevision += 1
    const watchKey = `${config.libraryId}\0${config.rootdir}`
    if (previousWatchKey !== watchKey) {
      changedManagedKeys.clear()
      invalidateAllImageThumbnails = false
    }
    if (!config.rootdir || !config.libraryId || isClosed) return

    try {
      for (const [type, categoryDir] of Object.entries(managedCategoryDirs)) {
        const watcher = fs.watch(path.join(config.rootdir, categoryDir), { persistent: false }, (_, filename) => {
          markManagedSnapshotDirty(type, filename)
        })
        watcher.on('error', () => {
          managedWatcherHealthy = false
          markManagedSnapshotDirty()
        })
        managedWatchers.push(watcher)
      }
      const rootWatcher = fs.watch(config.rootdir, { persistent: false }, (_, filename) => {
        if (!filename || ['images', 'documents', '.aetherdock-library.json'].includes(String(filename))) {
          if (!filename || ['images', 'documents'].includes(String(filename))) managedWatcherHealthy = false
          markManagedSnapshotDirty()
        }
      })
      rootWatcher.on('error', () => {
        managedWatcherHealthy = false
        markManagedSnapshotDirty()
      })
      managedWatchers.push(rootWatcher)
      managedWatcherHealthy = true
      managedWatchedKey = watchKey
    } catch {
      closeManagedWatchers()
      managedSnapshotDirty = true
    }
  }

  async function readManagedDirectorySnapshots(config) {
    const snapshots = new Map()
    for (const [type, categoryDir] of Object.entries(managedCategoryDirs)) {
      const entries = await fsp.readdir(path.join(config.rootdir, categoryDir), { withFileTypes: true })
      const keys = new Set()
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const key = `${categoryDir}/${entry.name}`
        keys.add(process.platform === 'win32' ? key.toLowerCase() : key)
      }
      snapshots.set(type, keys)
    }
    return snapshots
  }

  async function reconcileManagedFilesUnlocked({ force = false } = {}) {
    const config = getConfig()
    const watchKey = `${config.libraryId}\0${config.rootdir}`
    const shouldStartWatchers = watchKey !== managedWatchedKey || !managedWatcherHealthy
    const now = Date.now()
    const needsScan = force || managedSnapshotDirty || shouldStartWatchers || now - managedLastScanAt >= managedFullScanInterval
    if (!needsScan) {
      return { available: managedLastAvailable, missing: 0, recovered: 0, staleThumbnailKeys: [] }
    }
    if (!(await validateLibraryConfig(config))) {
      managedLastAvailable = false
      managedLastScanAt = Date.now()
      return { available: false, missing: 0, recovered: 0, staleThumbnailKeys: [] }
    }
    if (shouldStartWatchers) startManagedWatchers(config)
    const generation = managedRootGeneration
    const revision = managedWatchRevision
    const changedKeys = new Set(changedManagedKeys)
    const invalidateImages = invalidateAllImageThumbnails

    let snapshots
    try {
      snapshots = await readManagedDirectorySnapshots(config)
    } catch {
      if (generation === managedRootGeneration) {
        managedLastAvailable = false
        managedLastScanAt = Date.now()
      }
      return { available: false, missing: 0, recovered: 0, staleThumbnailKeys: [] }
    }
    const items = readManagedItemsStmt.all(config.libraryId)
    const currentConfig = getConfig()
    if (isClosed || generation !== managedRootGeneration
      || currentConfig.rootdir !== config.rootdir || currentConfig.libraryId !== config.libraryId) {
      return { available: false, missing: 0, recovered: 0, staleThumbnailKeys: [] }
    }
    const timestamp = Date.now()
    const summary = { available: true, missing: 0, recovered: 0, updated: 0, staleThumbnailKeys: [] }
    const operations = items.flatMap((item) => {
      const relativeKey = managedRelativeKey(item.type, item.relativePath)
      const isPresent = Boolean(relativeKey && snapshots.get(item.type)?.has(relativeKey))
      const nextStatus = isPresent ? 'ready' : 'missing'
      if (nextStatus !== item.status) return [{ kind: nextStatus, item }]
      if (isPresent && item.type === 'image' && (invalidateImages || changedKeys.has(relativeKey))) {
        return [{ kind: 'invalidate-thumbnail', item }]
      }
      return []
    })
    if (operations.length) {
      runTransaction(() => {
        for (const { kind, item } of operations) {
          if (kind !== 'invalidate-thumbnail') {
            const updateResult = kind === 'missing'
              ? markManagedMissingStmt.run(timestamp, timestamp, item.id, config.libraryId, item.relativePath, item.status)
              : markManagedReadyStmt.run(timestamp, timestamp, item.id, config.libraryId, item.relativePath, item.status)
            if (!updateResult.changes) continue
            if (item.thumbnailCacheKey) summary.staleThumbnailKeys.push(item.thumbnailCacheKey)
            if (kind === 'missing') summary.missing += 1
            else summary.recovered += 1
            continue
          }
          const updateResult = invalidateManagedImageThumbnailStmt.run(timestamp, item.id, config.libraryId, item.relativePath)
          if (!updateResult.changes) continue
          if (item.thumbnailCacheKey) summary.staleThumbnailKeys.push(item.thumbnailCacheKey)
          summary.updated += 1
        }
      })
    }
    managedLastAvailable = true
    managedLastScanAt = Date.now()
    if (generation === managedRootGeneration && revision === managedWatchRevision) {
      managedSnapshotDirty = false
      changedManagedKeys.clear()
      invalidateAllImageThumbnails = false
    }
    summary.pending = managedSnapshotDirty
    return summary
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
  async function importContentUnlocked({ file = [], url = [] }) {
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
      const libraryConfig = getConfig()
      const libraryId = libraryConfig.libraryId
      if (!(await validateLibraryConfig(libraryConfig))) continue
      const existing = findItemBySourceStmt.get(realPath, libraryId)
      if (existing?.storageMode === 'managed' && existing.status !== 'missing') {
        duplicates.push(existing.id)
        continue
      }

      const id = existing?.id ?? randomUUID()
      let copyResult
      try {
        copyResult = await copyToManagedDir(realPath, type.type, id, libraryConfig.rootdir)
      } catch (error) {
        if (error?.code === 'EEXIST' && existing) duplicates.push(existing.id)
        continue
      }
      const item = {
        id,
        type: type.type,
        storageMode: 'managed',
        title: path.basename(realPath),
        sourcePath: realPath,
        relativePath: copyResult.relativePath,
        libraryId,
        sourceUrl: null,
        normalizedUrl: null,
        mimeType: type.mimeType,
        byteSize: stat.size,
        createdAt: timestamp,
      }
      try {
        const currentConfig = getConfig()
        if (currentConfig.rootdir !== libraryConfig.rootdir || currentConfig.libraryId !== libraryConfig.libraryId
          || !(await validateLibraryConfig(libraryConfig))) {
          throw new Error('资料库目录已更改')
        }
        runTransaction(() => {
          if (existing) {
            updateManagedItemStmt.run(item.type, item.title, item.sourcePath, item.relativePath, item.libraryId, item.mimeType, item.byteSize, item.type, timestamp, item.id)
          } else {
            insertItemStmt.run(item.id, item.type, item.storageMode, item.title, item.sourcePath, item.relativePath, item.libraryId, item.sourceUrl, item.normalizedUrl, item.mimeType, item.byteSize, timestamp, timestamp)
          }
        })
        markManagedSnapshotDirty(item.type, path.basename(item.relativePath))
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

      const existing = findItemByUrlStmt.get(guifanWangzhi, getConfig().libraryId)
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
          insertItemStmt.run(item.id, item.type, item.storageMode, item.title, item.sourcePath, null, null, item.sourceUrl, item.normalizedUrl, item.mimeType, item.byteSize, timestamp, timestamp)
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
  async function importRemoteContentUnlocked({ sourceUrl, filename, mimeType, contentLength, body, maxBytes }) {
    const normalizedUrl = normalizeUrl(sourceUrl)
    if (!normalizedUrl || !body) return { added: [], duplicates: [] }
    const libraryConfig = getConfig()
    const { rootdir, libraryId } = libraryConfig
    const existing = findItemByUrlStmt.get(normalizedUrl, libraryId)
    const canRecover = existing?.storageMode === 'managed' && existing.libraryId === libraryId && existing.status === 'missing'
    if (existing && !canRecover) {
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

    if (!rootdir || !libraryId || !(await validateLibraryConfig(libraryConfig))) {
      if (typeof body.cancel === 'function') await body.cancel().catch(() => {})
      else body.destroy?.()
      throw new Error('请先设置资料库目录')
    }
    const id = canRecover ? existing.id : randomUUID()
    const categoryDir = classification.type === 'image' ? 'images' : 'documents'
    const relativePath = path.join(categoryDir, generateManagedFilename(safeFilename, id))
    const finalPath = path.resolve(rootdir, relativePath)
    const stagingPath = path.join(rootdir, '.staging', `${id}.${randomUUID()}.download`)
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
      await publishManagedFile(stagingPath, finalPath)
    } catch (error) {
      await fsp.rm(stagingPath, { force: true }).catch(() => {})
      if (error?.code === 'EEXIST') {
        markManagedSnapshotDirty(classification.type, path.basename(relativePath))
        return { added: [], duplicates: existing ? [existing.id] : [] }
      }
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
      libraryId,
      sourceUrl,
      normalizedUrl,
      mimeType: mimeType || classification.mimeType,
      byteSize,
      createdAt: timestamp,
    }
    try {
      const currentConfig = getConfig()
      if (currentConfig.rootdir !== rootdir || currentConfig.libraryId !== libraryId
        || !(await validateLibraryConfig(libraryConfig))) throw new Error('资料库目录已更改')
      item.libraryId = libraryId
      runTransaction(() => {
        if (canRecover) {
          updateManagedItemStmt.run(
            item.type, item.title, item.sourcePath, item.relativePath, item.libraryId, item.mimeType, item.byteSize, item.type, timestamp, item.id,
          )
        } else {
          insertItemStmt.run(
            item.id, item.type, item.storageMode, item.title, item.sourcePath, item.relativePath,
            item.libraryId, item.sourceUrl, item.normalizedUrl, item.mimeType, item.byteSize, timestamp, timestamp,
          )
        }
      })
      if (canRecover && existing.relativePath !== item.relativePath) {
        markManagedSnapshotDirty(existing.type, path.basename(existing.relativePath))
      }
      markManagedSnapshotDirty(item.type, path.basename(item.relativePath))
      return { added: [item], duplicates: [] }
    } catch (error) {
      await fsp.rm(finalPath, { force: true }).catch(() => {})
      if (String(error.message).includes('UNIQUE')) {
        const duplicate = findItemByUrlStmt.get(normalizedUrl, item.libraryId)
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
    const params = [type, getConfig().libraryId]
    const conditions = ['type = ?', visibleItemCondition]
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
    const libraryId = getConfig().libraryId
    const counts = Object.fromEntries(itemTypes.map((type) => [type, 0]))
    for (const row of readItemCountsStmt.all(libraryId)) counts[row.type] = Number(row.count)
    return {
      counts,
      updatedAt: Number(readLatestUpdateStmt.get(libraryId)?.updatedAt ?? 0),
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

  function getIconCacheItems() {
    return readIconCacheItemsStmt.all()
  }

  function getItemByUrl(rawUrl) {
    try {
      const normalizedUrl = normalizeUrl(rawUrl)
      const item = normalizedUrl ? findItemByUrlStmt.get(normalizedUrl, getConfig().libraryId) ?? null : null
      return item?.storageMode === 'managed' && item.status === 'missing' ? null : item
    } catch {
      return null
    }
  }

  function setApplicationIconCache(id, cacheKey, status) {
    if (!['pending', 'ready', 'failed'].includes(status)) throw new Error('不支持的图标缓存状态')
    updateApplicationIconStmt.run(cacheKey, status, id)
  }

  function setWebsiteIconCache(id, cacheKey, status) {
    if (!['pending', 'ready', 'failed'].includes(status)) throw new Error('不支持的图标缓存状态')
    updateWebsiteIconStmt.run(cacheKey, status, id)
  }

  function setImageThumbnailCache(item, cacheKey, status) {
    if (!['pending', 'ready', 'failed'].includes(status)) throw new Error('不支持的缩略图缓存状态')
    return Boolean(updateImageThumbnailStmt.run(
      cacheKey, status, item.id, item.libraryId, item.relativePath, item.updatedAt,
    ).changes)
  }

  // 主进程按条目 ID 读取来源，避免信任渲染层提交的任意路径
  function getItemDetail(id) {
    return readItemStmt.get(id) ?? null
  }

  function getItemLocalPath(item) {
    if (item?.storageMode === 'managed') {
      return item.libraryId === getConfig().libraryId ? resolveManagedPath(item) : ''
    }
    if (item?.storageMode === 'shortcut') return item.sourcePath || ''
    return item?.storageMode === 'reference' ? item.sourcePath : ''
  }

  async function getValidatedItemLocalPath(item) {
    if (item?.storageMode !== 'managed') return getItemLocalPath(item)
    const config = getConfig()
    if (item.libraryId !== config.libraryId || !(await validateLibraryConfig(config))) return ''
    const localPath = resolveManagedPathForRoot(item, config.rootdir)
    try {
      const stat = await fsp.lstat(localPath)
      return stat.isFile() && !stat.isSymbolicLink() ? localPath : ''
    } catch {
      return ''
    }
  }

  function generateRenamedFilename(rawTitle, originalExtension, directory, currentPath) {
    let title = path.basename(rawTitle)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()
    if (!title) throw new Error('名称不能为空')
    if (originalExtension) {
      const requestedExtension = path.extname(title)
      title = `${path.basename(title, requestedExtension)}${originalExtension}`
    }
    const extension = path.extname(title)
    let basename = path.basename(title, extension).slice(0, 80).replace(/[. ]+$/g, '') || 'untitled'
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(basename)) basename = `_${basename}`
    let filename = `${basename}${extension.toLowerCase()}`
    for (let suffix = 2; fs.existsSync(path.join(directory, filename)) && path.join(directory, filename).toLowerCase() !== currentPath.toLowerCase(); suffix += 1) {
      filename = `${basename} (${suffix})${extension.toLowerCase()}`
    }
    return filename
  }

  async function renameItemUnlocked(id, rawTitle) {
    const item = readItemStmt.get(id)
    if (!item) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
    if (item.type === 'application') return { chenggong: false, xiaoxi: '应用程序不支持重命名' }
    let title = String(rawTitle ?? '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!title) return { chenggong: false, xiaoxi: '名称不能为空' }

    let nextRelativePath = item.relativePath
    let currentPath = ''
    let nextPath = ''
    let didRenameFile = false
    let isCaseOnlyRename = false
    let managedConfig = null
    const operationGeneration = managedRootGeneration
    if (item.storageMode === 'managed' && ['document', 'image'].includes(item.type)) {
      const config = getConfig()
      if (item.libraryId !== config.libraryId || !(await validateLibraryConfig(config))) {
        return { chenggong: false, xiaoxi: '资料库目录暂时不可用' }
      }
      managedConfig = config
      currentPath = resolveManagedPathForRoot(item, config.rootdir)
      if (!currentPath) return { chenggong: false, xiaoxi: '资料库文件不存在' }
      const currentStat = await fsp.lstat(currentPath).catch(() => null)
      if (!currentStat?.isFile() || currentStat.isSymbolicLink()) return { chenggong: false, xiaoxi: '资料库文件不存在' }
      const directory = path.dirname(currentPath)
      const originalExtension = path.extname(currentPath)
      title = generateRenamedFilename(title, originalExtension, directory, currentPath)
      nextRelativePath = path.join(path.dirname(item.relativePath), title)
      nextPath = path.join(directory, title)
      if (nextPath !== currentPath) {
        isCaseOnlyRename = process.platform === 'win32' && nextPath.toLowerCase() === currentPath.toLowerCase()
        if (isCaseOnlyRename) {
          await renameManagedFileCaseOnly(currentPath, nextPath)
        } else {
          await renameManagedFileNoReplace(currentPath, nextPath)
        }
        didRenameFile = true
      }
    }

    try {
      if (managedConfig) {
        const currentConfig = getConfig()
        if (operationGeneration !== managedRootGeneration || currentConfig.rootdir !== managedConfig.rootdir
          || currentConfig.libraryId !== managedConfig.libraryId || !(await validateLibraryConfig(managedConfig))) {
          throw new Error('资料库目录已更改')
        }
      }
      // 卡片内容变更时推进更新时间，确保渲染层能立即失效旧缓存并刷新状态。
      const updatedAt = Math.max(Date.now(), Number(item.updatedAt ?? 0) + 1)
      renameItemStmt.run(title, nextRelativePath, updatedAt, id)
      if (didRenameFile) {
        markManagedSnapshotDirty(item.type, path.basename(item.relativePath))
        markManagedSnapshotDirty(item.type, path.basename(nextRelativePath))
      }
      return { chenggong: true, title, relativePath: nextRelativePath, updatedAt }
    } catch (error) {
      if (didRenameFile) {
        const rollback = isCaseOnlyRename ? renameManagedFileCaseOnly : renameManagedFileNoReplace
        await rollback(nextPath, currentPath).catch(() => {})
      }
      throw error
    }
  }

  // 受管文件先移入同卷暂存区，数据库提交失败时可原位恢复。
  async function deleteItemUnlocked(id) {
    const item = readItemStmt.get(id)
    if (!item) return { chenggong: false, xiaoxi: '未找到该资料库条目' }
    let localPath = ''
    let stagingPath = ''
    let managedConfig = null
    const operationGeneration = managedRootGeneration
    if (item.storageMode === 'managed') {
      const config = getConfig()
      if (item.libraryId !== config.libraryId || !(await validateLibraryConfig(config))) {
        return { chenggong: false, xiaoxi: '资料库目录暂时不可用' }
      }
      managedConfig = config
      localPath = resolveManagedPathForRoot(item, config.rootdir)
      if (!localPath) return { chenggong: false, xiaoxi: '资料库文件路径无效' }
      const localStat = await fsp.lstat(localPath).catch(() => null)
      if (localStat && (!localStat.isFile() || localStat.isSymbolicLink())) {
        return { chenggong: false, xiaoxi: '资料库文件无法删除' }
      }
      const stagingDir = path.join(config.rootdir, '.staging')
      await fsp.mkdir(stagingDir, { recursive: true })
      stagingPath = path.join(stagingDir, `${item.id}.${randomUUID()}.delete`)
      try {
        await fsp.rename(localPath, stagingPath)
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) return { chenggong: false, xiaoxi: '资料库文件无法删除' }
        try {
          await fsp.lstat(localPath)
          return { chenggong: false, xiaoxi: '资料库文件无法删除' }
        } catch (sourceError) {
          if (!['ENOENT', 'ENOTDIR'].includes(sourceError?.code)) return { chenggong: false, xiaoxi: '资料库文件无法删除' }
        }
        const currentConfig = getConfig()
        if (operationGeneration !== managedRootGeneration || currentConfig.rootdir !== config.rootdir
          || currentConfig.libraryId !== config.libraryId || !(await validateLibraryConfig(config))) {
          return { chenggong: false, xiaoxi: '资料库目录已更改' }
        }
        runTransaction(() => deleteItemStmt.run(item.id))
        markManagedSnapshotDirty(item.type, path.basename(item.relativePath))
        return { chenggong: true }
      }
    }
    try {
      if (managedConfig) {
        const currentConfig = getConfig()
        if (operationGeneration !== managedRootGeneration || currentConfig.rootdir !== managedConfig.rootdir
          || currentConfig.libraryId !== managedConfig.libraryId || !(await validateLibraryConfig(managedConfig))) {
          throw new Error('资料库目录已更改')
        }
      }
      runTransaction(() => deleteItemStmt.run(id))
    } catch (error) {
      if (stagingPath) await fsp.rename(stagingPath, localPath).catch(() => {})
      throw error
    }
    if (stagingPath) await fsp.rm(stagingPath, { force: true }).catch(() => {})
    if (item.storageMode === 'managed') markManagedSnapshotDirty(item.type, path.basename(item.relativePath))
    return { chenggong: true }
  }

  function reconcileManagedFiles(options) {
    return runManagedOperation(() => reconcileManagedFilesUnlocked(options))
  }

  function importContent(payload) {
    return runManagedOperation(() => importContentUnlocked(payload))
  }

  function importRemoteContent(payload) {
    return runManagedOperation(() => importRemoteContentUnlocked(payload))
  }

  function renameItem(id, rawTitle) {
    return runManagedOperation(() => renameItemUnlocked(id, rawTitle))
  }

  function deleteItem(id) {
    return runManagedOperation(() => deleteItemUnlocked(id))
  }

  function close() {
    if (isClosed) return
    isClosed = true
    managedRootGeneration += 1
    if (managedDirtyTimer) clearTimeout(managedDirtyTimer)
    managedDirtyTimer = null
    managedDirtyCallback = null
    closeManagedWatchers()
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
    getIconCacheItems,
    reconcileManagedFiles,
    onManagedFilesDirty,
    getItemByUrl,
    setApplicationIconCache,
    setWebsiteIconCache,
    setImageThumbnailCache,
    getItemDetail,
    getItemLocalPath,
    getValidatedItemLocalPath,
    renameItem,
    deleteItem,
    close,
  }
}

module.exports = { createLibrary }
