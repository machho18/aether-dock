import { computed, shallowRef } from 'vue'

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
export function useZiliaokuLibrary(xianshiToast) {
  const categoryWindows = shallowRef(createCategoryWindows())
  const categoryCounts = shallowRef(Object.fromEntries(categoryIds.map((type) => [type, 0])))
  const currentCategory = shallowRef('document')
  const searchKeyword = shallowRef('')
  const searchState = shallowRef(createPageState())
  const libraryConfig = shallowRef({ rootdir: '', libraryId: '' })
  const currentCollapsedAnimation = shallowRef('kulian')
  const isImporting = shallowRef(false)
  const isYingyongSyncing = shallowRef(false)
  let searchRequestId = 0

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
    try {
      const bridge = huoquBridge()
      const [config, summary, animation] = await Promise.all([
        bridge?.getLibraryConfig(),
        bridge?.getLibrarySummary(),
        bridge?.getCollapsedAnimation(),
      ])
      if (config) libraryConfig.value = config
      if (summary) {
        categoryCounts.value = summary.counts
        categoryWindows.value = createCategoryWindows()
        shezhiPage(summary.defaultType, summary.defaultPage)
      }
      if (animation) currentCollapsedAnimation.value = animation
    } catch {
      xianshiToast('资料库暂时不可用', 'error')
    }
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

  async function shuaxinLibraryIndex() {
    const summary = await huoquBridge()?.getLibrarySummary()
    if (!summary) return
    categoryCounts.value = summary.counts
    categoryWindows.value = createCategoryWindows()
    shezhiPage(summary.defaultType, summary.defaultPage)
    if (searchKeyword.value) await sousuoLibrary(searchKeyword.value)
    else await jiazaiCategory(currentCategory.value)
  }

  async function xuanzeLibraryRootdir() {
    const result = await huoquBridge()?.selectLibraryRootdir()
    if (result?.quxiao || !result?.config) return false
    libraryConfig.value = result.config
    xianshiToast('资料库目录已设置', 'success')
    return true
  }

  async function quebaoLibrary() {
    return Boolean(libraryConfig.value.rootdir) || xuanzeLibraryRootdir()
  }

  async function daoruDragContent(dataTransfer) {
    if (isImporting.value) return []
    // DataTransfer 仅在 drop 事件周期内可靠，先同步提取网络地址再打开目录选择器。
    const draggedUrls = tiquDraggedUrls(dataTransfer)
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
      await shuaxinLibraryIndex()
      const downloadText = result.downloaded ? `，其中下载 ${result.downloaded} 项` : ''
      xianshiToast(`已添加 ${addedItems.length} 项${downloadText}`, 'success')
      return addedItems
    } catch {
      xianshiToast('导入失败，请稍后重试', 'error')
      return []
    } finally {
      isImporting.value = false
    }
  }

  async function dakaiLibraryItem(item) {
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
    huoquBridge()?.locateLibraryItem(item.id)
  }

  async function shanchuLibraryItem(item) {
    try {
      const result = await huoquBridge()?.deleteLibraryItem(item.id)
      if (!result?.chenggong) {
        xianshiToast(result?.xiaoxi || '删除失败', 'error')
        return false
      }
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

  async function tongbuDesktopApplications() {
    if (isYingyongSyncing.value) return false
    isYingyongSyncing.value = true
    try {
      const result = await huoquBridge()?.tongbuDesktopApplications()
      if (!result?.chenggong) {
        xianshiToast(result?.xiaoxi || '桌面程序扫描失败', 'error')
        return false
      }
      await shuaxinLibraryIndex()
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

  return {
    libraryItems,
    categoryCounts,
    currentCategory,
    libraryConfig,
    currentCollapsedAnimation,
    isImporting,
    isYingyongSyncing,
    jiazaiLibrary,
    xuanzeLibraryCategory,
    sousuoLibrary,
    jiazaiGengduo,
    xuanzeLibraryRootdir,
    daoruDragContent,
    dakaiLibraryItem,
    dingweiLibraryItem,
    shanchuLibraryItem,
    tongbuDesktopApplications,
    shezhiCollapsedAnimation,
  }
}

// 浏览器拖拽图片时优先使用 HTML 中的图片源，避免误收藏包裹图片的网页链接。
function tiquDraggedUrls(dataTransfer) {
  const html = dataTransfer?.getData('text/html') || ''
  if (html) {
    const htmlDocument = new DOMParser().parseFromString(html, 'text/html')
    const imageUrls = [...htmlDocument.querySelectorAll('img[src]')]
      .map((image) => image.getAttribute('src')?.trim())
      .filter((url) => /^https?:\/\//i.test(url || ''))
    if (imageUrls.length) return [...new Set(imageUrls)].slice(0, 20)
  }

  const rawText = dataTransfer?.getData('text/uri-list') || dataTransfer?.getData('text/plain') || ''
  return [...new Set(rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && /^https?:\/\//i.test(line)))]
    .slice(0, 20)
}
