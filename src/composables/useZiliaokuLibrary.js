import { computed, onBeforeUnmount, shallowRef } from 'vue'

const categoryIds = ['document', 'image', 'url', 'application']
const pageSize = 30
const maxWindowSize = 90

function createPageState() {
  return {
    items: [],
    previousCursor: null,
    nextCursor: null,
    hasPrevious: false,
    hasNext: false,
    loaded: false,
    loading: false,
  }
}

function createCategoryWindows() {
  return Object.fromEntries(categoryIds.map((type) => [type, createPageState()]))
}

// 渲染层仅保留当前分类附近的数据窗口，全量分类与搜索均交给 SQLite。
export function useZiliaokuLibrary(xianshiToast, xianshiMigrationReport) {
  const categoryWindows = shallowRef(createCategoryWindows())
  const categoryCounts = shallowRef(Object.fromEntries(categoryIds.map((type) => [type, 0])))
  const currentCategory = shallowRef('document')
  const searchKeyword = shallowRef('')
  const searchState = shallowRef(createPageState())
  const libraryConfig = shallowRef({ rootdir: '', libraryId: '' })
  const libraryAvailable = shallowRef(false)
  const currentCollapsedAnimation = shallowRef('kulian')
  const isImporting = shallowRef(false)
  const isYingyongSyncing = shallowRef(false)
  const isLibraryRootMigrating = shallowRef(false)
  let searchRequestId = 0
  let libraryRefreshPromise = null
  let forcedRefreshVersion = 0
  let libraryStateGeneration = 0

  const libraryItems = computed(() => (
    searchKeyword.value ? searchState.value.items : categoryWindows.value[currentCategory.value].items
  ))

  function huoquBridge() {
    return window.aetherDock
  }

  function gengxinCategoryState(type, patch) {
    categoryWindows.value = {
      ...categoryWindows.value,
      [type]: { ...categoryWindows.value[type], ...patch },
    }
  }

  function shezhiPage(type, page) {
    gengxinCategoryState(type, {
      items: page?.items ?? [],
      previousCursor: page?.previousCursor ?? null,
      nextCursor: page?.nextCursor ?? null,
      hasPrevious: Boolean(page?.hasPrevious),
      hasNext: Boolean(page?.hasNext),
      loaded: true,
      loading: false,
    })
  }

  async function jiazaiLibrary() {
    if (libraryRefreshPromise) return libraryRefreshPromise
    libraryRefreshPromise = (async () => {
      let success = false
      let completedVersion
      do {
        completedVersion = forcedRefreshVersion
        const requestGeneration = libraryStateGeneration
        try {
          const bridge = huoquBridge()
          const [config, summary, animation] = await Promise.all([
            bridge?.getLibraryConfig(),
            bridge?.getLibrarySummary(),
            bridge?.getCollapsedAnimation(),
          ])
          if (requestGeneration === libraryStateGeneration) {
            if (config) libraryConfig.value = config
            if (summary) {
              libraryAvailable.value = Boolean(summary.libraryAvailable)
              categoryCounts.value = summary.counts
              categoryWindows.value = createCategoryWindows()
              shezhiPage(summary.defaultType, summary.defaultPage)
            }
          }
          if (animation) currentCollapsedAnimation.value = animation
          success = true
        } catch {
          success = false
        }
      } while (completedVersion !== forcedRefreshVersion)
      if (!success) xianshiToast('资料库暂时不可用', 'error')
      return success
    })().finally(() => { libraryRefreshPromise = null })
    return libraryRefreshPromise
  }

  async function jiazaiCategory(type = currentCategory.value) {
    if (!categoryIds.includes(type)) return
    const state = categoryWindows.value[type]
    if (state.loaded || state.loading) return
    gengxinCategoryState(type, { loading: true })
    try {
      const page = await huoquBridge()?.getLibraryPage({ type, limit: pageSize })
      shezhiPage(type, page)
    } catch {
      gengxinCategoryState(type, { loading: false })
      xianshiToast('分类加载失败', 'error')
    }
  }

  async function xuanzeLibraryCategory(type) {
    if (!categoryIds.includes(type)) return
    currentCategory.value = type
    if (searchKeyword.value) {
      await sousuoLibrary(searchKeyword.value)
      return
    }
    await jiazaiCategory(type)
  }

  async function sousuoLibrary(rawKeyword) {
    const keyword = String(rawKeyword ?? '').trim()
    searchKeyword.value = keyword
    const requestId = ++searchRequestId
    if (!keyword) {
      searchState.value = createPageState()
      await jiazaiCategory()
      return
    }

    searchState.value = { ...createPageState(), loading: true }
    try {
      const page = await huoquBridge()?.searchLibrary({
        keyword,
        type: currentCategory.value,
        limit: pageSize,
      })
      if (requestId !== searchRequestId) return
      searchState.value = {
        items: page?.items ?? [],
        previousCursor: page?.previousCursor ?? null,
        nextCursor: page?.nextCursor ?? null,
        hasPrevious: Boolean(page?.hasPrevious),
        hasNext: Boolean(page?.hasNext),
        loaded: true,
        loading: false,
      }
    } catch {
      if (requestId === searchRequestId) searchState.value = createPageState()
      xianshiToast('搜索失败，请稍后重试', 'error')
    }
  }

  async function jiazaiGengduo(direction = 'next') {
    const loadDirection = direction === 'previous' ? 'previous' : 'next'
    const isSearch = Boolean(searchKeyword.value)
    const requestType = currentCategory.value
    const requestKeyword = searchKeyword.value
    const state = isSearch ? searchState.value : categoryWindows.value[requestType]
    const hasMore = loadDirection === 'previous' ? state.hasPrevious : state.hasNext
    const cursor = loadDirection === 'previous' ? state.previousCursor : state.nextCursor
    if (!hasMore || state.loading || !cursor) return

    if (isSearch) searchState.value = { ...state, loading: true }
    else gengxinCategoryState(currentCategory.value, { loading: true })
    try {
      const options = {
        type: requestType,
        cursor,
        direction: loadDirection,
        limit: pageSize,
      }
      const page = isSearch
        ? await huoquBridge()?.searchLibrary({ ...options, keyword: requestKeyword })
        : await huoquBridge()?.getLibraryPage(options)
      if (requestType !== currentCategory.value || requestKeyword !== searchKeyword.value) {
        if (!isSearch) gengxinCategoryState(requestType, { loading: false })
        return
      }
      const knownIds = new Set(state.items.map(({ id }) => id))
      const loadedItems = (page?.items ?? []).filter(({ id }) => !knownIds.has(id))
      const combinedItems = loadDirection === 'previous'
        ? [...loadedItems, ...state.items]
        : [...state.items, ...loadedItems]
      const didTrim = combinedItems.length > maxWindowSize
      const nextItems = loadDirection === 'previous'
        ? combinedItems.slice(0, maxWindowSize)
        : combinedItems.slice(-maxWindowSize)
      const nextState = {
        items: nextItems,
        previousCursor: nextItems.length ? { createdAt: nextItems[0].createdAt, id: nextItems[0].id } : null,
        nextCursor: nextItems.length ? { createdAt: nextItems.at(-1).createdAt, id: nextItems.at(-1).id } : null,
        hasPrevious: loadDirection === 'previous' ? Boolean(page?.hasPrevious) : state.hasPrevious || didTrim,
        hasNext: loadDirection === 'next' ? Boolean(page?.hasNext) : state.hasNext || didTrim,
        loaded: true,
        loading: false,
      }
      if (isSearch) searchState.value = nextState
      else gengxinCategoryState(requestType, nextState)
    } catch {
      if (isSearch) {
        if (requestType === currentCategory.value && requestKeyword === searchKeyword.value) {
          searchState.value = { ...state, loading: false }
        }
      } else {
        gengxinCategoryState(requestType, { loading: false })
      }
    }
  }

  async function shuaxinLibraryIndex(force = false) {
    if (force) forcedRefreshVersion += 1
    if (libraryRefreshPromise) return libraryRefreshPromise
    libraryRefreshPromise = (async () => {
      let success = false
      let completedVersion
      do {
        completedVersion = forcedRefreshVersion
        const requestGeneration = libraryStateGeneration
        try {
          const summary = await huoquBridge()?.getLibrarySummary()
          if (!summary || requestGeneration !== libraryStateGeneration) continue
          libraryAvailable.value = Boolean(summary.libraryAvailable)
          categoryCounts.value = summary.counts
          categoryWindows.value = createCategoryWindows()
          shezhiPage(summary.defaultType, summary.defaultPage)
          if (searchKeyword.value) await sousuoLibrary(searchKeyword.value)
          else await jiazaiCategory(currentCategory.value)
          success = true
        } catch {
          success = false
        }
      } while (completedVersion !== forcedRefreshVersion)
      return success
    })().finally(() => { libraryRefreshPromise = null })
    return libraryRefreshPromise
  }

  async function xuanzeLibraryRootdir(mode = 'migrate') {
    if (isLibraryRootMigrating.value) return false
    isLibraryRootMigrating.value = true
    try {
      const result = await huoquBridge()?.selectLibraryRootdir(mode)
      if (result?.quxiao) return false
      if (!result?.chenggong || !result.config) {
        xianshiToast(result?.xiaoxi || '资料库迁移失败', 'error')
        if (result?.conflictPath) {
          xianshiMigrationReport?.({
            title: '资料库迁移已停止',
            message: result.xiaoxi || '目标目录存在冲突：',
            tone: 'danger',
            items: [{ title: result.conflictPath.split(/[\\/]/).at(-1), relativePath: result.conflictPath, reason: result.xiaoxi }],
          })
        }
        return false
      }
      libraryStateGeneration += 1
      libraryConfig.value = result.config
      const refreshWarning = result.reconciliationWarning || !(await shuaxinLibraryIndex(true))
      const migration = result.migration ?? {}
      if (migration.kind === 'noop') {
        xianshiToast(refreshWarning ? '当前已使用此目录 · 索引将在稍后刷新' : '当前已使用此目录', 'info')
      } else if (migration.kind === 'migrated') {
        const migratedCount = Number(migration.copied || 0) + Number(migration.reused || 0)
        const details = [`资料库已迁移 · ${migratedCount} 项`]
        if (migration.missing) {
          const missingNames = (migration.missingItems ?? []).slice(0, 3).map(({ title }) => title).filter(Boolean)
          const remainingCount = Math.max(0, Number(migration.missing) - missingNames.length)
          const missingDetail = missingNames.length ? `缺失：${missingNames.join('、')}` : `${migration.missing} 项缺失`
          details.push(remainingCount ? `${missingDetail} 等 ${migration.missing} 项` : missingDetail)
        }
        if (migration.cleanupWarnings) details.push('旧目录有副本未清理')
        else if (migration.oldRootRemoved === false) details.push('旧目录包含其他文件，已保留')
        if (refreshWarning) details.push('索引将在稍后刷新')
        xianshiToast(details.join(' · '), migration.missing || migration.cleanupWarnings || refreshWarning ? 'info' : 'success')
        if (migration.missingItems?.length) {
          xianshiMigrationReport?.({
            title: `迁移完成 · ${migration.missing} 项缺失`,
            message: '以下资源在原目录和目标目录中均未找到：',
            reason: '源文件缺失',
            items: migration.missingItems,
          })
        }
      } else if (migration.kind === 'switched') {
        const details = ['已切换至新资料库 · 旧资料库未迁移']
        if (migration.rebuilt) details.push(`已识别 ${migration.rebuilt} 项已有内容`)
        if (migration.skipped) details.push(`跳过 ${migration.skipped} 个无法识别的文件`)
        if (refreshWarning) details.push('索引将在稍后刷新')
        xianshiToast(details.join(' · '), refreshWarning ? 'info' : 'success')
      } else if (migration.kind === 'initialized' && migration.rebuilt) {
        const details = [`已恢复资料库索引 · ${migration.rebuilt} 项`]
        if (migration.skipped) details.push(`跳过 ${migration.skipped} 个无法识别的文件`)
        if (refreshWarning) details.push('索引将在稍后刷新')
        xianshiToast(details.join(' · '), refreshWarning ? 'info' : 'success')
      } else {
        xianshiToast(refreshWarning ? '资料库目录已设置 · 索引将在稍后刷新' : '资料库目录已设置', refreshWarning ? 'info' : 'success')
      }
      return true
    } catch {
      xianshiToast('资料库迁移失败', 'error')
      return false
    } finally {
      isLibraryRootMigrating.value = false
    }
  }

  async function quebaoLibrary() {
    return Boolean(libraryConfig.value.rootdir) || xuanzeLibraryRootdir()
  }

  async function daoruDragContent(dataTransfer) {
    if (isLibraryRootMigrating.value) {
      xianshiToast('资料库正在迁移，请稍候', 'info')
      return []
    }
    if (isImporting.value) return []
    // DataTransfer 仅在 drop 事件周期内可靠，先同步提取网络地址再打开目录选择器。
    const draggedUrls = tiquDraggedResources(dataTransfer)
    if (!(await quebaoLibrary())) return []
    isImporting.value = true
    try {
      const result = await huoquBridge()?.importDragContent({
        document: dataTransfer?.files,
        url: draggedUrls,
      })
      const addedItems = result?.added ?? []
      if (!addedItems.length) {
        xianshiToast('未发现可导入的新内容', 'info')
        return []
      }
      libraryStateGeneration += 1
      await shuaxinLibraryIndex(true)
      xianshiToast(`归档完成 · ${addedItems.length} 项`, 'success')
      return addedItems
    } catch {
      xianshiToast('导入失败，请稍后重试', 'error')
      return []
    } finally {
      isImporting.value = false
    }
  }

  // 捕获内容由主进程读取，避免渲染层因系统剪贴板权限而出现不一致。
  async function buhuoJiantiebanContent() {
    if (isLibraryRootMigrating.value || isImporting.value) return []
    if (!(await quebaoLibrary())) return []
    isImporting.value = true
    try {
      const result = await huoquBridge()?.captureClipboardContent()
      const addedItems = result?.added ?? []
      if (!addedItems.length) {
        xianshiToast(result?.xiaoxi || '未发现可捕获的新内容', 'info')
        return []
      }
      libraryStateGeneration += 1
      await shuaxinLibraryIndex(true)
      xianshiToast(`已捕获${result.captureType || '内容'}`, 'success')
      return addedItems
    } catch {
      xianshiToast('剪贴板捕获失败，请稍后重试', 'error')
      return []
    } finally {
      isImporting.value = false
    }
  }

  async function dakaiLibraryItem(item) {
    if (isLibraryRootMigrating.value) {
      xianshiToast('资料库正在迁移，请稍候', 'info')
      return
    }
    if (item.status !== 'ready') {
      const statusXiaoxi = {
        shortcut_missing: '桌面快捷方式已消失，请重新扫描',
        target_missing: '目标程序可能已卸载',
        offline: '程序所在设备或网络暂不可用',
        unreadable: '快捷方式暂时无法读取',
        missing: '来源文件已不可用',
      }
      xianshiToast(statusXiaoxi[item.status] || '该条目暂时不可用', 'error')
      return
    }
    const result = await huoquBridge()?.openLibraryItem(item.id)
    if (!result?.chenggong) xianshiToast(result?.xiaoxi || '打开失败', 'error')
  }

  function dingweiLibraryItem(item) {
    if (isLibraryRootMigrating.value) {
      xianshiToast('资料库正在迁移，请稍候', 'info')
      return
    }
    huoquBridge()?.locateLibraryItem(item.id)
  }

  async function fenxiangLibraryItem(item) {
    try {
      const result = await huoquBridge()?.shareLibraryItem(item.id)
      xianshiToast(result?.xiaoxi || '分享失败，请稍后重试', result?.chenggong ? 'success' : 'error')
      return Boolean(result?.chenggong)
    } catch {
      xianshiToast('分享失败，请稍后重试', 'error')
      return false
    }
  }

  async function chongmingmingLibraryItem(item, title) {
    if (isLibraryRootMigrating.value) {
      xianshiToast('资料库正在迁移，请稍候', 'info')
      return false
    }
    try {
      const result = await huoquBridge()?.renameLibraryItem(item.id, title)
      if (!result?.chenggong) {
        xianshiToast(result?.xiaoxi || '重命名失败', 'error')
        return false
      }
      libraryStateGeneration += 1
      // 同步卡片变更字段，触发时间展示与依赖更新时间的缓存刷新。
      const gengxinKapian = (currentItem) => currentItem.id === item.id
        ? {
            ...currentItem,
            title: result.title,
            relativePath: result.relativePath ?? currentItem.relativePath,
            updatedAt: result.updatedAt ?? currentItem.updatedAt,
          }
        : currentItem
      categoryWindows.value = Object.fromEntries(categoryIds.map((type) => [
        type,
        { ...categoryWindows.value[type], items: categoryWindows.value[type].items.map(gengxinKapian) },
      ]))
      searchState.value = { ...searchState.value, items: searchState.value.items.map(gengxinKapian) }
      xianshiToast('已重命名', 'success')
      return true
    } catch {
      xianshiToast('重命名失败', 'error')
      return false
    }
  }

  async function shanchuLibraryItem(item) {
    if (isLibraryRootMigrating.value) {
      xianshiToast('资料库正在迁移，请稍候', 'info')
      return false
    }
    try {
      const result = await huoquBridge()?.deleteLibraryItem(item.id)
      if (!result?.chenggong) {
        xianshiToast(result?.xiaoxi || '删除失败', 'error')
        return false
      }
      libraryStateGeneration += 1
      categoryWindows.value = Object.fromEntries(categoryIds.map((type) => [
        type,
        { ...categoryWindows.value[type], items: categoryWindows.value[type].items.filter(({ id }) => id !== item.id) },
      ]))
      searchState.value = { ...searchState.value, items: searchState.value.items.filter(({ id }) => id !== item.id) }
      categoryCounts.value = {
        ...categoryCounts.value,
        [item.type]: Math.max(0, categoryCounts.value[item.type] - 1),
      }
      xianshiToast('已删除', 'success')
      return true
    } catch {
      xianshiToast('删除失败', 'error')
      return false
    }
  }

  // 批量删除统一完成后再刷新索引，避免多次更新轮播窗口造成界面跳动。
  async function shanchuLibraryItems(items) {
    if (isLibraryRootMigrating.value) {
      xianshiToast('资料库正在迁移，请稍候', 'info')
      return 0
    }
    const validItems = [...new Map((items ?? []).filter((item) => item?.id).map((item) => [item.id, item])).values()]
    if (!validItems.length) return 0
    let deletedCount = 0
    for (const item of validItems) {
      const result = await huoquBridge()?.deleteLibraryItem(item.id)
      if (result?.chenggong) deletedCount += 1
    }
    if (!deletedCount) {
      xianshiToast('删除失败，请稍后重试', 'error')
      return 0
    }
    libraryStateGeneration += 1
    await shuaxinLibraryIndex(true)
    xianshiToast(`已删除 ${deletedCount} 项`, 'success')
    return deletedCount
  }

  async function tongbuDesktopApplications() {
    if (isLibraryRootMigrating.value) {
      xianshiToast('资料库正在迁移，请稍候', 'info')
      return false
    }
    if (isYingyongSyncing.value) return false
    isYingyongSyncing.value = true
    try {
      const result = await huoquBridge()?.tongbuDesktopApplications()
      if (!result?.chenggong) {
        xianshiToast(result?.xiaoxi || '桌面程序扫描失败', 'error')
        return false
      }
      libraryStateGeneration += 1
      await shuaxinLibraryIndex(true)
      const changeCount = result.added + result.updated + result.recovered + result.missing
      if (!result.scanned && !changeCount) {
        xianshiToast('桌面未发现程序快捷方式', 'info')
        return true
      }
      const resultParts = []
      if (result.added) resultParts.push(`新增 ${result.added}`)
      if (result.updated) resultParts.push(`更新 ${result.updated}`)
      if (result.recovered) resultParts.push(`恢复 ${result.recovered}`)
      if (result.missing) resultParts.push(`失效 ${result.missing}`)
      if (!resultParts.length) resultParts.push(`已同步 ${result.scanned} 个程序`)
      xianshiToast(resultParts.join(' · '), result.missing ? 'info' : 'success')
      return true
    } catch {
      xianshiToast('桌面程序扫描失败', 'error')
      return false
    } finally {
      isYingyongSyncing.value = false
    }
  }

  async function shezhiCollapsedAnimation(animationId) {
    try {
      const result = await huoquBridge()?.setCollapsedAnimation(animationId)
      if (result) currentCollapsedAnimation.value = result
    } catch {
      xianshiToast('动画设置未保存', 'error')
    }
  }

  const stopLibraryChangedListener = huoquBridge()?.onLibraryChanged?.(() => {
    void shuaxinLibraryIndex(true)
  })
  onBeforeUnmount(() => stopLibraryChangedListener?.())

  return {
    libraryItems,
    categoryCounts,
    currentCategory,
    libraryConfig,
    libraryAvailable,
    currentCollapsedAnimation,
    isImporting,
    isYingyongSyncing,
    isLibraryRootMigrating,
    jiazaiLibrary,
    xuanzeLibraryCategory,
    sousuoLibrary,
    jiazaiGengduo,
    shuaxinLibraryIndex,
    xuanzeLibraryRootdir,
    daoruDragContent,
    buhuoJiantiebanContent,
    dakaiLibraryItem,
    dingweiLibraryItem,
    fenxiangLibraryItem,
    chongmingmingLibraryItem,
    shanchuLibraryItem,
    shanchuLibraryItems,
    tongbuDesktopApplications,
    shezhiCollapsedAnimation,
  }
}

// 浏览器拖拽图片时优先使用 HTML 中的图片源，避免误收藏包裹图片的网页链接。
function tiquDraggedResources(dataTransfer) {
  const rawText = dataTransfer?.getData('text/uri-list') || dataTransfer?.getData('text/plain') || ''
  const transferUrls = [...new Set(rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && /^https?:\/\//i.test(line)))]
  const html = dataTransfer?.getData('text/html') || ''
  if (html) {
    const htmlDocument = new DOMParser().parseFromString(html, 'text/html')
    const images = [...htmlDocument.querySelectorAll('img')]
    const resources = images.flatMap((image, imageIndex) => {
      const associatedTransferUrls = images.length === 1
        ? transferUrls
        : transferUrls[imageIndex] ? [transferUrls[imageIndex]] : []
      const attributeCandidates = ['data-objurl', 'data-original', 'data-imgurl', 'data-src', 'src', 'data-thumburl']
        .map((attribute) => image.getAttribute(attribute)?.trim())
      const srcsetCandidates = (image.getAttribute('srcset') || '')
        .split(',')
        .map((source) => source.trim().split(/\s+/)[0])
        .reverse()
      const candidates = [...new Set([...attributeCandidates.slice(0, 4), ...srcsetCandidates, ...attributeCandidates.slice(4), ...associatedTransferUrls]
        .filter((url) => /^https?:\/\//i.test(url || '')))]
      if (!candidates.length) return []
      const anchorUrl = image.closest('a[href]')?.getAttribute('href')?.trim()
      const referer = /^https?:\/\//i.test(anchorUrl || '') ? anchorUrl : ''
      return [{ sourceUrl: associatedTransferUrls[0] || referer || candidates[0], referer: referer || associatedTransferUrls[0] || '', candidates: candidates.slice(0, 8) }]
    })
    if (resources.length) return resources.slice(0, 20)
  }

  return transferUrls
    .map((url) => ({ sourceUrl: url, referer: '', candidates: [url] }))
    .slice(0, 20)
}
