import { shallowRef } from 'vue'

// 封装渲染层的资料库桥接调用，让页面组件只负责展示与派发意图。
export function useZiliaokuLibrary(xianshiToast) {
  const libraryItems = shallowRef([])
  const libraryConfig = shallowRef({ rootdir: '', libraryId: '' })
  const currentCollapsedAnimation = shallowRef('kulian')
  const isImporting = shallowRef(false)

  function huoquBridge() {
    return window.aetherDock
  }

  async function jiazaiLibrary() {
    try {
      const bridge = huoquBridge()
      const [config, items, animation] = await Promise.all([
        bridge?.getLibraryConfig(),
        bridge?.getLibraryItems(),
        bridge?.getCollapsedAnimation(),
      ])
      if (config) libraryConfig.value = config
      if (items) libraryItems.value = items
      if (animation) currentCollapsedAnimation.value = animation
    } catch {
      xianshiToast('资料库暂时不可用', 'error')
    }
  }

  async function xuanzeLibraryRootdir() {
    const result = await huoquBridge()?.selectLibraryRootdir()
    if (result?.quxiao) return false
    if (!result?.config) return false

    libraryConfig.value = result.config
    xianshiToast('资料库目录已设置', 'success')
    return true
  }

  async function quebaoLibrary() {
    return Boolean(libraryConfig.value.rootdir) || xuanzeLibraryRootdir()
  }

  async function daoruDragContent(dataTransfer) {
    if (isImporting.value || !(await quebaoLibrary())) return []

    isImporting.value = true
    try {
      const result = await huoquBridge()?.importDragContent({
        document: dataTransfer?.files,
        url: tiquDraggedUrls(dataTransfer),
      })
      const addedItems = result?.added ?? []
      if (!addedItems.length) {
        xianshiToast('未发现可导入的新内容', 'info')
        return []
      }
      xianshiToast(`已添加 ${addedItems.length} 项`, 'success')
      await jiazaiLibrary()
      return addedItems
    } catch {
      xianshiToast('导入失败，请稍后重试', 'error')
      return []
    } finally {
      isImporting.value = false
    }
  }

  async function dakaiLibraryItem(item) {
    if (item.status === 'missing') {
      xianshiToast('来源文件已不可用', 'error')
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
      libraryItems.value = libraryItems.value.filter((currentItem) => currentItem.id !== item.id)
      xianshiToast('已删除', 'success')
      return true
    } catch {
      xianshiToast('删除失败', 'error')
      return false
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
    libraryConfig,
    currentCollapsedAnimation,
    isImporting,
    jiazaiLibrary,
    xuanzeLibraryRootdir,
    daoruDragContent,
    dakaiLibraryItem,
    dingweiLibraryItem,
    shanchuLibraryItem,
    shezhiCollapsedAnimation,
  }
}

// 从拖放文本中提取网址，并忽略 URI 列表里的注释行。
function tiquDraggedUrls(dataTransfer) {
  const rawText = dataTransfer?.getData('text/uri-list') || dataTransfer?.getData('text/plain') || ''
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}
