<template>
  <section class="library-page" aria-label="资料库">
    <div class="library-status">
      <span
        class="library-connection"
        :class="libraryAvailable ? 'library-connection--normal' : 'library-connection--abnormal'"
      >{{ libraryAvailable ? '资料库已连接' : '资料库暂不可用' }}</span>
    </div>

    <section class="expanded-top" aria-label="窗口工具栏">
      <label class="expanded-search">
        <img :src="searchLensIcon" alt="" aria-hidden="true" draggable="false">
        <input v-model="searchKeyword" type="search" placeholder="搜索" aria-label="搜索资料">
      </label>
      <button class="expanded-settings" type="button" aria-label="打开设置" @click.stop="emit('open-settings')">
        <img :src="settingsIcon" alt="" aria-hidden="true" draggable="false">
      </button>
    </section>

    <nav class="folder-panel" aria-label="资料分类">
      <button
        v-for="category in fenleiList"
        :key="category.id"
        class="folder-card"
        :class="[`folder-card--${category.id}`, { 'folder-card--selected': currentCategory === category.id }]"
        type="button"
        @click.stop="xuanzeCategory(category.id)"
      >
        <img :src="category.icon" alt="" aria-hidden="true" draggable="false">
        <span>
          <strong>{{ category.name }}</strong>
          <small>{{ categoryCounts[category.id] }} 项</small>
        </span>
        <i>{{ category.caption }}</i>
      </button>
    </nav>

    <button
      v-if="currentCategory === 'application' && categoryCounts.application"
      class="application-sync"
      type="button"
      :disabled="isYingyongSyncing"
      @click.stop="emit('sync-applications')"
    >
      <span aria-hidden="true">↻</span>
      {{ isYingyongSyncing ? '扫描中' : '重新扫描' }}
    </button>

    <section
      class="library-list"
      aria-label="资料库内容"
      :style="{ '--switch-direction': switchDirection }"
      @wheel.prevent="chuliShelfWheel"
    >
      <div class="library-shelf-aura" aria-hidden="true"></div>
      <div class="library-shelf-backdrop" aria-hidden="true"></div>
      <Transition name="data-switch" mode="out-in">
        <div
          v-if="currentItems.length"
          :key="currentCategory"
          class="library-shelf"
        >
          <article
            v-for="{ item, offset, index, cardInfo } in carouselCards"
            :key="item.id"
            class="library-shelf-card"
            :class="[
              `library-shelf-card--${item.type}`,
              {
                'library-shelf-card--center': offset === 0,
                'library-shelf-card--missing': item.status !== 'ready',
              },
            ]"
            :style="huoquCardStyle(offset)"
          >
            <button class="library-shelf-main" type="button" @click.stop="offset === 0 ? emit('open-item', item) : tiaozhuanCarousel(index)">
              <div class="library-shelf-view" :class="{ 'library-shelf-view--pending': cardInfo.iconPending }" aria-hidden="true">
                <img
                  v-if="cardInfo.preview"
                  class="library-shelf-preview"
                  :src="cardInfo.preview"
                  :srcset="cardInfo.previewSrcset"
                  :fetchpriority="offset === 0 ? 'high' : 'auto'"
                  alt=""
                  draggable="false"
                  @error="biaojiPreviewFailed(item)"
                >
                <img
                  v-else-if="cardInfo.icon"
                  class="library-shelf-icon"
                  :src="cardInfo.icon"
                  alt=""
                  draggable="false"
                  @error="item.type === 'url' && biaojiWangzhiIconFailed(item)"
                >
                <span v-else class="library-shelf-icon-skeleton"></span>
              </div>
              <span class="library-shelf-cover">
                <strong>{{ huoquCardName(item) }}</strong>
                <small :class="{ 'library-shelf-status--missing': item.status !== 'ready' }">
                  {{ item.type === 'application' ? huoquApplicationStatus(item) : geshiCardTime(item.createdAt) }}
                </small>
              </span>
            </button>
            <div
              v-if="offset === 0"
              class="library-shelf-actions"
              :class="{ 'library-shelf-actions--triple': item.type !== 'application' && item.storageMode !== 'bookmark' && item.status !== 'shortcut_missing' }"
              aria-label="卡片操作"
            >
              <button
                v-if="item.storageMode !== 'bookmark' && item.status !== 'shortcut_missing'"
                class="library-shelf-action library-shelf-enter"
                type="button"
                aria-label="在文件夹中定位"
                @click.stop="emit('locate-item', item)"
              >
                <img :src="enterIcon" alt="" aria-hidden="true" draggable="false">
              </button>
              <button
                v-if="item.type !== 'application'"
                class="library-shelf-action library-shelf-rename"
                type="button"
                aria-label="重命名"
                @click.stop="kaishiRename(item)"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m5 16-1 4 4-1L19 8l-3-3L5 16Z" />
                  <path d="m14.5 6.5 3 3" />
                </svg>
              </button>
              <button class="library-shelf-action library-shelf-delete" type="button" aria-label="删除" @click.stop="emit('delete-item', item)">
                <img :src="deleteIcon" alt="" aria-hidden="true" draggable="false">
              </button>
            </div>
            <form
              v-if="renamingItemId === item.id"
              class="library-rename-editor"
              @click.stop
              @submit.prevent="tijiaoRename(item)"
            >
              <input
                v-model="renameValue"
                class="library-rename-input"
                maxlength="120"
                aria-label="新的资料名称"
                autofocus
                @blur="quxiaoRename"
                @keydown.esc.stop.prevent="quxiaoRename"
              >
            </form>
          </article>
        </div>
        <div v-else-if="currentCategory === 'application' && !categoryCounts.application" key="application-empty" class="application-empty">
          <img :src="yingyongIcon" alt="" aria-hidden="true" draggable="false">
          <strong class="kongzhuangtai-zifu-line">
            <span
              v-for="(zifu, index) in huoquZifuList('暂无已导入的应用程序')"
              :key="`application-title-${index}`"
              class="kongzhuangtai-zifu"
              :style="{ '--zifu-delay': `${index * 42}ms` }"
            >{{ zifu }}</span>
          </strong>
          <small class="kongzhuangtai-zifu-line">
            <span
              v-for="(zifu, index) in huoquZifuList('扫描桌面快捷方式，不会移动或修改原文件')"
              :key="`application-detail-${index}`"
              class="kongzhuangtai-zifu"
              :style="{ '--zifu-delay': `${160 + index * 28}ms` }"
            >{{ zifu }}</span>
          </small>
          <button type="button" :disabled="isYingyongSyncing" @click.stop="emit('sync-applications')">
            {{ isYingyongSyncing ? '正在扫描…' : '一键导入' }}
          </button>
        </div>
        <p v-else :key="`empty-${currentCategory}-${searchKeyword}`" class="library-empty">
          <span class="kongzhuangtai-zifu-line">
            <span
              v-for="(zifu, index) in huoquZifuList(kongzhuangtaiWenAn)"
              :key="`${zifu}-${index}`"
              class="kongzhuangtai-zifu"
              :style="{ '--zifu-delay': `${index * 42}ms` }"
            >{{ zifu }}</span>
          </span>
        </p>
      </Transition>
    </section>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, shallowRef, watch } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import searchLensIcon from '@/assets/icons/sousuo-lens.svg'
import settingsIcon from '@/assets/icons/shezhi-orbit.svg'
import folderIcon from '@/assets/icons/wenjian-folder.svg'
import imageFolderIcon from '@/assets/icons/tupian-folder.svg'
import urlIcon from '@/assets/icons/wangzhi-link.svg'
import yingyongIcon from '@/assets/icons/yingyongchengxu.svg'
import enterIcon from '@/assets/icons/enter.svg'
import deleteIcon from '@/assets/icons/delete.svg'
import { geshiCardTime, huoquApplicationStatus, huoquCardInfo, huoquCardName } from '@/utils/ziliaokuItem'

const props = defineProps({
  items: { type: Array, default: () => [] },
  categoryCounts: {
    type: Object,
    default: () => ({ document: 0, image: 0, url: 0, application: 0 }),
  },
  libraryConfig: { type: Object, default: () => ({ rootdir: '' }) },
  libraryAvailable: { type: Boolean, default: false },
  initialCategory: { type: String, default: 'document' },
  isYingyongSyncing: { type: Boolean, default: false },
  isAnimationBusy: { type: Boolean, default: false },
})

const emit = defineEmits(['open-settings', 'select-category', 'search', 'load-more', 'open-item', 'locate-item', 'rename-item', 'delete-item', 'sync-applications'])
const searchKeyword = shallowRef('')
const currentCategory = shallowRef(props.initialCategory)
const carouselIndex = shallowRef(0)
const switchDirection = shallowRef(1)
const yulanFailedKeys = reactive(new Map())
const yulanRecoveryIds = new Set()
const yingyongIconMap = shallowRef({})
const yingyongIconRequestKeyMap = shallowRef({})
const wangzhiIconMap = shallowRef({})
const wangzhiIconRequestKeyMap = shallowRef({})
const wangzhiIconFailedIds = reactive(new Set())
const wangzhiIconRecoveryIds = new Set()
const tupianThumbnailMap = shallowRef({})
const tupianThumbnailRequestKeyMap = shallowRef({})
const renamingItemId = shallowRef('')
const renameValue = shallowRef('')
let yingyongIconRenwu = 0
let wangzhiIconRenwu = 0
const wangzhiIconIdleTasks = new Set()
let isUnmounted = false

const fenleiList = [
  { id: 'document', name: '文档', caption: 'DOC · PDF · TXT', icon: folderIcon },
  { id: 'image', name: '图片', caption: 'JPG · PNG · RAW', icon: imageFolderIcon },
  { id: 'url', name: '网址', caption: 'WEB · URL', icon: urlIcon },
  { id: 'application', name: '应用程序', caption: 'APP · EXE', icon: yingyongIcon },
]

// 根据当前分类生成更明确的空状态提示。
const kongzhuangtaiWenAn = computed(() => {
  const currentFenlei = fenleiList.find(({ id }) => id === currentCategory.value)
  const fenleiName = currentFenlei?.name ?? '内容'

  if (searchKeyword.value.trim()) return `未找到匹配的${fenleiName}`

  const kongzhuangtaiMap = {
    document: '暂无文档，拖入文件即可开始整理',
    image: '暂无图片，拖入图片即可开始整理',
    url: '暂无网址，拖入链接即可开始收藏',
  }
  return kongzhuangtaiMap[currentCategory.value] ?? `暂无${fenleiName}`
})

const currentItems = computed(() => props.items)

const keshikapianRange = 4

function huoquThumbnailRequestKey(item) {
  return [item.libraryId, item.id, item.updatedAt, item.relativePath].join('\0')
}

// 两端保留透明缓冲卡，让可见卡淡出后再卸载，避免轮播边缘突现或突消。
const carouselCards = computed(() => {
  const startIndex = Math.max(carouselIndex.value - keshikapianRange, 0)
  const endIndex = Math.min(carouselIndex.value + keshikapianRange + 1, currentItems.value.length)

  return currentItems.value.slice(startIndex, endIndex).map((item, visibleIndex) => {
    const index = startIndex + visibleIndex
    const offset = index - carouselIndex.value
    const mappedIcon = yingyongIconMap.value[item.id]
    const validMappedIcon = mappedIcon && (!item.iconCacheKey || mappedIcon.includes(item.iconCacheKey)) ? mappedIcon : ''
    const mappedWebsiteIcon = wangzhiIconMap.value[item.id]
    const websiteIconFailed = wangzhiIconFailedIds.has(item.id)
    const validMappedWebsiteIcon = !websiteIconFailed && mappedWebsiteIcon && (!item.iconCacheKey || mappedWebsiteIcon.includes(item.iconCacheKey)) ? mappedWebsiteIcon : ''
    const mappedThumbnail = tupianThumbnailMap.value[item.id]
    const validMappedThumbnail = mappedThumbnail
      && tupianThumbnailRequestKeyMap.value[item.id] === huoquThumbnailRequestKey(item)
      ? mappedThumbnail
      : ''
    return {
      item,
      index,
      offset,
      cardInfo: huoquCardInfo({
        ...item,
        iconStatus: websiteIconFailed && item.type === 'url' ? 'failed' : item.iconStatus,
        yingyongIcon: validMappedIcon,
        wangzhiIcon: validMappedWebsiteIcon,
        thumbnailKey: validMappedThumbnail,
      }, yulanFailedKeys),
    }
  })
})

// 分页窗口裁剪后按条目 ID 恢复中心卡，避免续载时轮播跳回开头。
watch(currentItems, (items, previousItems) => {
  const previousById = new Map(previousItems.map((item) => [item.id, item]))
  const nextThumbnailMap = { ...tupianThumbnailMap.value }
  const nextRequestKeyMap = { ...tupianThumbnailRequestKeyMap.value }
  let didResetThumbnail = false
  for (const item of items) {
    const previousItem = previousById.get(item.id)
    if (!previousItem) continue
    const sourceChanged = previousItem.libraryId !== item.libraryId
      || previousItem.updatedAt !== item.updatedAt
      || previousItem.status !== item.status
      || previousItem.thumbnailCacheKey !== item.thumbnailCacheKey
    if (!sourceChanged) continue
    delete nextThumbnailMap[item.id]
    delete nextRequestKeyMap[item.id]
    yulanFailedKeys.delete(item.id)
    yulanRecoveryIds.delete(item.id)
    didResetThumbnail = true
  }
  if (didResetThumbnail) {
    tupianThumbnailMap.value = nextThumbnailMap
    tupianThumbnailRequestKeyMap.value = nextRequestKeyMap
  }
  const currentId = previousItems[carouselIndex.value]?.id
  const preservedIndex = currentId ? items.findIndex(({ id }) => id === currentId) : -1
  carouselIndex.value = preservedIndex >= 0 ? preservedIndex : Math.min(carouselIndex.value, Math.max(items.length - 1, 0))
}, { flush: 'post' })

watch([carouselIndex, () => currentItems.value.length], ([index, length]) => {
  if (!length) return
  if (index <= 6) emit('load-more', 'previous')
  if (length - index <= 7) emit('load-more', 'next')
}, { flush: 'post' })

let searchTimer = 0
watch(searchKeyword, (keyword) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => emit('search', keyword), 180)
})
onBeforeUnmount(() => {
  isUnmounted = true
  wangzhiIconRenwu += 1
  window.clearTimeout(searchTimer)
  for (const taskId of wangzhiIconIdleTasks) {
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(taskId)
    else window.clearTimeout(taskId)
  }
  wangzhiIconIdleTasks.clear()
})

watch(() => props.initialCategory, (category) => {
  if (fenleiList.some(({ id }) => id === category)) {
    currentCategory.value = category
    carouselIndex.value = 0
    wangzhiIconRenwu += 1
    quxiaoRename()
  }
})

// 应用图标仅在空闲期读取，展开动画期间延后任务，避免影响关键动画帧。
watch([carouselCards, () => props.isAnimationBusy], ([cards, isAnimationBusy]) => {
  if (currentCategory.value !== 'application') return
  if (isAnimationBusy) return
  const missingItems = [...cards]
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))
    .map(({ item }) => item)
    .filter((item) => {
      if (item.iconStatus === 'ready' && item.iconCacheKey) return false
      const mappedIcon = yingyongIconMap.value[item.id]
      if (mappedIcon && (!item.iconCacheKey || mappedIcon.includes(item.iconCacheKey))) return false
      return yingyongIconRequestKeyMap.value[item.id] !== (item.iconCacheKey || item.id)
    })
  if (!missingItems.length) return

  const renwuId = ++yingyongIconRenwu
  const duquIcons = async () => {
    if (renwuId !== yingyongIconRenwu || props.isAnimationBusy) return
    let iconMap
    try {
      iconMap = await window.aetherDock?.getApplicationIcons(missingItems.map(({ id }) => id))
    } catch {
      return
    }
    if (iconMap) {
      yingyongIconMap.value = { ...yingyongIconMap.value, ...iconMap }
      yingyongIconRequestKeyMap.value = {
        ...yingyongIconRequestKeyMap.value,
        ...Object.fromEntries(missingItems.map((item) => [item.id, item.iconCacheKey || item.id])),
      }
    }
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(duquIcons, { timeout: 1000 })
  } else {
    window.setTimeout(duquIcons, 120)
  }
}, { immediate: true })

// 网址图标按可见卡片懒加载，历史收藏也会自动补齐本地缓存。
watch([carouselCards, () => props.isAnimationBusy], ([cards, isAnimationBusy]) => {
  if (currentCategory.value !== 'url' || isAnimationBusy) return
  const missingItems = [...cards]
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))
    .map(({ item }) => item)
    .filter((item) => {
      if (item.iconStatus === 'ready' && item.iconCacheKey && !wangzhiIconFailedIds.has(item.id)) return false
      const mappedIcon = wangzhiIconMap.value[item.id]
      if (!wangzhiIconFailedIds.has(item.id) && mappedIcon && (!item.iconCacheKey || mappedIcon.includes(item.iconCacheKey))) return false
      return wangzhiIconRequestKeyMap.value[item.id] !== (item.iconCacheKey || item.id)
    })
  if (!missingItems.length) return

  const requestKeys = Object.fromEntries(missingItems.map((item) => [item.id, item.iconCacheKey || item.id]))
  wangzhiIconRequestKeyMap.value = { ...wangzhiIconRequestKeyMap.value, ...requestKeys }
  const renwuId = wangzhiIconRenwu
  let idleTaskId = 0
  const duquIcons = async () => {
    wangzhiIconIdleTasks.delete(idleTaskId)
    if (isUnmounted || renwuId !== wangzhiIconRenwu || currentCategory.value !== 'url' || props.isAnimationBusy) {
      const nextRequestKeyMap = { ...wangzhiIconRequestKeyMap.value }
      for (const [itemId, requestKey] of Object.entries(requestKeys)) {
        if (nextRequestKeyMap[itemId] === requestKey) delete nextRequestKeyMap[itemId]
      }
      wangzhiIconRequestKeyMap.value = nextRequestKeyMap
      return
    }
    try {
      const iconMap = await window.aetherDock?.getWebsiteIcons(missingItems.map(({ id }) => id))
      if (iconMap) {
        wangzhiIconMap.value = { ...wangzhiIconMap.value, ...iconMap }
        for (const [itemId, icon] of Object.entries(iconMap)) {
          if (icon) wangzhiIconFailedIds.delete(itemId)
        }
      }
    } catch {}
  }
  if ('requestIdleCallback' in window) {
    idleTaskId = window.requestIdleCallback(duquIcons, { timeout: 1000 })
  } else {
    idleTaskId = window.setTimeout(duquIcons, 120)
  }
  wangzhiIconIdleTasks.add(idleTaskId)
}, { immediate: true })

// 缩略图仅在空闲期生成，中心卡及相邻卡优先于窗口边缘卡。
watch([carouselCards, () => props.isAnimationBusy], ([cards, isAnimationBusy]) => {
  if (currentCategory.value !== 'image' || isAnimationBusy) return
  const missingItems = [...cards]
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))
    .map(({ item }) => item)
    .filter((item) => {
      const mappedThumbnail = tupianThumbnailMap.value[item.id]
      const requestKey = huoquThumbnailRequestKey(item)
      const hasCurrentMappedThumbnail = mappedThumbnail && tupianThumbnailRequestKeyMap.value[item.id] === requestKey
      if (hasCurrentMappedThumbnail) return false
      return tupianThumbnailRequestKeyMap.value[item.id] !== requestKey
    })
  if (!missingItems.length) return

  const requestKeys = Object.fromEntries(missingItems.map((item) => [item.id, huoquThumbnailRequestKey(item)]))
  const duquThumbnails = async () => {
    if (props.isAnimationBusy) return
    tupianThumbnailRequestKeyMap.value = { ...tupianThumbnailRequestKeyMap.value, ...requestKeys }
    let thumbnailMap
    try {
      thumbnailMap = await window.aetherDock?.getImageThumbnails(missingItems.map(({ id }) => id))
    } catch {
      return
    }
    if (thumbnailMap) tupianThumbnailMap.value = { ...tupianThumbnailMap.value, ...thumbnailMap }
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(duquThumbnails, { timeout: 1000 })
  } else {
    window.setTimeout(duquThumbnails, 120)
  }
}, { immediate: true })

function xuanzeCategory(categoryId) {
  if (categoryId === currentCategory.value) return
  const currentIndex = fenleiList.findIndex(({ id }) => id === currentCategory.value)
  const nextIndex = fenleiList.findIndex(({ id }) => id === categoryId)
  switchDirection.value = nextIndex >= currentIndex ? 1 : -1
  currentCategory.value = categoryId
  emit('select-category', categoryId)
}

function tiaozhuanCarousel(index) {
  if (index >= 0 && index < currentItems.value.length) carouselIndex.value = index
}

function qianyiCard() {
  tiaozhuanCarousel(carouselIndex.value - 1)
}

function houyiCard() {
  tiaozhuanCarousel(carouselIndex.value + 1)
}

let gunlunLeijiweiyi = 0
let gunlunSuoding = false
let gunlunZhenRenwu = 0

// 合并高精度触控板的连续滚轮输入，一帧至多移动一次卡片。
function chuliShelfWheel(event) {
  gunlunLeijiweiyi += event.deltaY
  if (gunlunZhenRenwu) return
  gunlunZhenRenwu = window.requestAnimationFrame(() => {
    gunlunZhenRenwu = 0
    if (gunlunSuoding) {
      gunlunLeijiweiyi = 0
      return
    }
    if (Math.abs(gunlunLeijiweiyi) < 36) return
    const direction = Math.sign(gunlunLeijiweiyi)
    gunlunLeijiweiyi = 0
    gunlunSuoding = true
    if (direction > 0) houyiCard()
    else qianyiCard()
    window.setTimeout(() => { gunlunSuoding = false }, 100)
  })
}

function huoquCardStyle(offset) {
  const distance = Math.abs(offset)
  const angle = offset === 0 ? 0 : (offset < 0 ? 1 : -1) * Math.min(32 + distance * 12, 62)
  return {
    transform: `translateX(calc(-50% + ${offset * 184}px)) translateZ(${-distance * 55}px) rotateY(${angle}deg) scale(${Math.max(1 - distance * .12, .72)})`,
    opacity: Math.max(1 - distance * .25, 0),
    zIndex: 10 - distance,
    pointerEvents: distance <= 2 ? 'auto' : 'none',
  }
}

function biaojiPreviewFailed(item) {
  const failedKey = tupianThumbnailMap.value[item.id] || item.thumbnailCacheKey || ''
  yulanFailedKeys.set(item.id, failedKey)
  if (yulanRecoveryIds.has(item.id)) return
  yulanRecoveryIds.add(item.id)
  const nextThumbnailMap = { ...tupianThumbnailMap.value }
  const nextRequestKeyMap = { ...tupianThumbnailRequestKeyMap.value }
  delete nextThumbnailMap[item.id]
  delete nextRequestKeyMap[item.id]
  tupianThumbnailMap.value = nextThumbnailMap
  tupianThumbnailRequestKeyMap.value = nextRequestKeyMap
}

function biaojiWangzhiIconFailed(item) {
  wangzhiIconFailedIds.add(item.id)
  if (wangzhiIconRecoveryIds.has(item.id)) return
  wangzhiIconRecoveryIds.add(item.id)
  const nextIconMap = { ...wangzhiIconMap.value }
  const nextRequestKeyMap = { ...wangzhiIconRequestKeyMap.value }
  delete nextIconMap[item.id]
  delete nextRequestKeyMap[item.id]
  wangzhiIconMap.value = nextIconMap
  wangzhiIconRequestKeyMap.value = nextRequestKeyMap
}

function kaishiRename(item) {
  if (item.type === 'application') return
  renamingItemId.value = item.id
  renameValue.value = item.title || ''
  nextTick(() => {
    const input = document.querySelector('.library-rename-input')
    input?.focus()
    input?.select()
  })
}

function quxiaoRename() {
  renamingItemId.value = ''
  renameValue.value = ''
}

function tijiaoRename(item) {
  const title = renameValue.value.trim()
  if (!title || title === item.title) {
    quxiaoRename()
    return
  }
  emit('rename-item', item, title)
  quxiaoRename()
}

// 将提示文本拆分为可独立执行动画的字符。
function huoquZifuList(text) {
  return Array.from(text)
}

onKeyStroke('ArrowLeft', (event) => {
  if (event.target instanceof HTMLInputElement) return
  event.preventDefault()
  qianyiCard()
})
onKeyStroke('ArrowRight', (event) => {
  if (event.target instanceof HTMLInputElement) return
  event.preventDefault()
  houyiCard()
})
</script>

<style scoped>
.library-page {
  position: absolute;
  z-index: 2;
  /* 与内层玻璃共用 1px 内缩和 18px 圆角，避免背景越过外框。 */
  inset: 1px;
  overflow: hidden;
  border-radius: 18px;
  /* 分割线上方使用统一的浅灰背景。 */
  background: linear-gradient(to bottom, #ececec 0 154px, transparent 154px);
  color-scheme: light;
}

.library-status {
  position: absolute;
  z-index: 3;
  top: 29px;
  left: 31px;
  display: flex;
  min-height: 20px;
  align-items: center;
  gap: 10px;
  color: var(--ink-muted);
  font: 11px var(--font-body);
  letter-spacing: .08em;
  text-shadow: 0 1px rgba(255, 255, 255, .7);
}

.library-connection {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.library-connection::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  content: "";
}

.library-connection--normal { color: var(--accent-deep); }
.library-connection--normal::before { background: var(--success); box-shadow: 0 0 7px rgba(99, 254, 19, .42); }
.library-connection--abnormal { color: var(--danger-deep); }
.library-connection--abnormal::before { background: var(--danger); box-shadow: 0 0 7px rgba(232, 93, 93, .34); }

.expanded-top {
  position: absolute;
  z-index: 2;
  top: 25px;
  right: 34px;
  left: 34px;
  height: 46px;
  pointer-events: none;
  -webkit-app-region: no-drag;
}

.expanded-search {
  position: absolute;
  top: 0;
  left: 50%;
  display: flex;
  width: 260px;
  height: 44px;
  align-items: center;
  gap: 10px;
  padding: 0 15px 0 11px;
  border: 1px solid var(--border-ink);
  border-radius: 22px;
  background: rgba(255, 255, 255, .48);
  box-shadow: inset 0 1px rgba(255, 255, 255, .76), 0 7px 18px rgba(38, 38, 38, .08);
  pointer-events: auto;
  transform: translateX(-50%);
  -webkit-app-region: no-drag;
}

.expanded-search:focus-within { border-color: rgba(99, 254, 19, .72); box-shadow: inset 0 1px rgba(255, 255, 255, .82), 0 0 0 3px rgba(99, 254, 19, .1), 0 7px 18px rgba(38, 38, 38, .1); }
.expanded-search img { width: 28px; height: 28px; flex: 0 0 auto; filter: brightness(0); opacity: .72; -webkit-user-drag: none; user-select: none; }
.expanded-search input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--ink); font: 500 16px var(--font-display); letter-spacing: .04em; }
.expanded-search input::placeholder { color: var(--ink-faint); }

.expanded-settings {
  position: absolute;
  right: 0;
  top: 1px;
  display: grid;
  width: 42px;
  height: 42px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  place-items: center;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.expanded-settings img { width: 30px; height: 30px; filter: brightness(0); opacity: .72; transition: opacity 180ms ease, transform 220ms var(--motion-easing); -webkit-user-drag: none; user-select: none; }
.expanded-settings:hover img { opacity: 1; transform: rotate(18deg); }

.folder-panel {
  position: absolute;
  z-index: 2;
  top: 84px;
  right: auto;
  left: 30px;
  display: flex;
  width: max-content;
  gap: 3px;
  padding: 4px;
  border: 1px solid rgba(38, 38, 38, .1);
  border-radius: 18px;
  background: rgba(255, 255, 255, .34);
  box-shadow: inset 0 1px rgba(255, 255, 255, .68);
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.folder-card {
  position: relative;
  display: grid;
  width: 48px;
  min-height: 48px;
  padding: 0;
  place-items: center;
  overflow: visible;
  border: 1px solid transparent;
  border-radius: 13px;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
  transition: background 220ms ease, border-color 220ms ease, box-shadow 220ms ease, transform 220ms var(--motion-easing);
  -webkit-app-region: no-drag;
}

.folder-card:hover { border-color: transparent; background: rgba(255, 255, 255, .54); transform: none; }
.folder-card--selected { border-color: rgba(99, 254, 19, .34); background: linear-gradient(145deg, rgba(242, 255, 230, .9), rgba(216, 255, 181, .42)); box-shadow: inset 0 1px rgba(255, 255, 255, .82), 0 3px 10px rgba(38, 38, 38, .08); transform: none; }
.folder-card--selected::after { position: absolute; right: 0; bottom: 3px; left: 0; width: 17px; height: 2px; margin-inline: auto; border-radius: 999px; background: var(--accent); box-shadow: 0 0 7px rgba(99, 254, 19, .48); content: ""; }
.folder-card img { width: 30px; height: 30px; margin: 0; filter: brightness(0); opacity: .48; transform: scale(.94); transition: filter 220ms ease, opacity 220ms ease, transform 220ms var(--motion-easing); -webkit-user-drag: none; user-select: none; }
.folder-card--selected img { filter: brightness(0); opacity: .88; transform: translateY(-3px) scale(1); }
/* 程序图标保留 SVG 内定义的灰色背景与白色几何前景。 */
.folder-card--application img { filter: none; opacity: .72; }
.folder-card--application.folder-card--selected img { filter: grayscale(1) contrast(100); opacity: 1; }
.folder-card span { display: none; }
.folder-card strong { font: 600 14px var(--font-body); }
.folder-card small { color: var(--ink-faint); font: 11px var(--font-mono); }
.folder-card i { display: none; }

.application-sync {
  position: absolute;
  z-index: 3;
  top: 92px;
  right: 31px;
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 13px;
  border: 1px solid rgba(38, 38, 38, .14);
  border-radius: 17px;
  background: rgba(255, 255, 255, .56);
  box-shadow: inset 0 1px rgba(255, 255, 255, .76), 0 4px 10px rgba(38, 38, 38, .07);
  color: var(--ink-muted);
  cursor: pointer;
  font: 600 11px var(--font-body);
  letter-spacing: .04em;
  transition: border-color 180ms ease, color 180ms ease, transform 180ms var(--motion-easing);
  -webkit-app-region: no-drag;
}

.application-sync span { font: 17px/1 var(--font-mono); transition: transform 260ms var(--motion-easing); }
.application-sync:hover { border-color: rgba(99, 254, 19, .52); color: var(--ink); transform: translateY(-1px); }
.application-sync:hover span { transform: rotate(45deg); }
.application-sync:disabled { cursor: wait; opacity: .56; transform: none; }

.library-list {
  position: absolute;
  z-index: 2;
  top: 154px;
  right: 30px;
  bottom: 28px;
  left: 30px;
  overflow: hidden;
  border-top: 1px solid rgba(38, 38, 38, .12);
  padding-top: 12px;
  -webkit-app-region: no-drag;
}

.library-shelf-aura {
  position: absolute;
  z-index: 0;
  inset: 0;
  background: radial-gradient(ellipse at 29% 48%, rgba(190, 255, 140, .22), rgba(190, 255, 140, 0) 38%), radial-gradient(ellipse at 62% 50%, rgba(140, 140, 140, .16), rgba(140, 140, 140, 0) 44%), linear-gradient(180deg, rgba(255, 255, 255, .3), rgba(217, 217, 217, .22));
  pointer-events: none;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 5%, #000 95%, transparent 100%), linear-gradient(180deg, transparent 0, #000 11%, #000 89%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(90deg, transparent 0, #000 5%, #000 95%, transparent 100%), linear-gradient(180deg, transparent 0, #000 11%, #000 89%, transparent 100%);
  mask-composite: intersect;
}

.library-shelf-backdrop {
  position: absolute;
  z-index: 1;
  inset: 0;
  /* 使用静态半透明层替代实时背景模糊，避免首次展开创建高开销合成层。 */
  background: linear-gradient(180deg, rgba(255, 255, 255, .72), rgba(240, 240, 240, .58));
  box-shadow: inset 0 1px rgba(255, 255, 255, .58), inset 0 -1px rgba(38, 38, 38, .06);
  pointer-events: none;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 5%, #000 95%, transparent 100%), linear-gradient(180deg, transparent 0, #000 11%, #000 89%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(90deg, transparent 0, #000 5%, #000 95%, transparent 100%), linear-gradient(180deg, transparent 0, #000 11%, #000 89%, transparent 100%);
  mask-composite: intersect;
}

.library-shelf { position: relative; z-index: 2; width: 100%; height: 100%; overflow: hidden; perspective: 820px; perspective-origin: 50% 58%; transform-style: preserve-3d; -webkit-app-region: no-drag; mask: linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%); }

.library-shelf-card {
  position: absolute;
  z-index: 1;
  top: auto;
  bottom: 32px;
  left: 50%;
  width: 142px;
  height: 150px;
  margin-left: 0;
  overflow: visible;
  border: 1px solid rgba(191, 191, 191, .42);
  border-radius: 14px;
  background: linear-gradient(165deg, rgba(48, 50, 49, .97), rgba(15, 17, 16, .98) 58%, rgba(30, 33, 31, .96));
  box-shadow: inset 0 1px rgba(255, 255, 255, .08), 0 16px 28px rgba(15, 17, 16, .32);
  transform-style: preserve-3d;
  transform-origin: 50% 100%;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  will-change: transform, opacity;
  transition: transform 420ms var(--motion-easing), opacity 360ms ease, box-shadow 260ms ease, border-color 260ms ease;
}

.library-shelf-card::before {
  position: absolute;
  z-index: 2;
  inset: 0;
  border: 1px solid rgba(191, 191, 191, .42);
  border-radius: inherit;
  background: linear-gradient(165deg, rgba(48, 50, 49, .97), rgba(15, 17, 16, .98) 58%, rgba(30, 33, 31, .96));
  content: "";
  pointer-events: none;
  transform: translateZ(1px);
}

.library-shelf-card--center { border-color: rgba(99, 254, 19, .62); box-shadow: inset 0 1px rgba(255, 255, 255, .1), inset 0 0 0 1px rgba(99, 254, 19, .08), 0 0 22px rgba(99, 254, 19, .14), 0 22px 38px rgba(15, 17, 16, .42); }
.library-shelf-card--center::before { border-color: rgba(99, 254, 19, .62); }
.library-shelf-card--missing { filter: grayscale(.8); }
.library-shelf-main { position: relative; z-index: 3; display: flex; width: 100%; height: 100%; box-sizing: border-box; flex-direction: column; align-items: center; justify-content: flex-start; padding: 10px 10px 0; overflow: hidden; border: 0; border-radius: inherit; background: transparent; color: inherit; cursor: pointer; transform: translateZ(8px); transform-style: preserve-3d; -webkit-app-region: no-drag; }
/* 预览图与卡片边缘保持一致的 10px 留白。 */
.library-shelf-view { position: relative; display: flex; width: 100%; height: 78px; flex: none; align-items: center; justify-content: center; margin: 0; padding: 0; overflow: hidden; border: 0; background: transparent; }
.library-shelf-icon { position: relative; z-index: 2; width: 56px; height: 56px; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0, 0, 0, .55)); pointer-events: none; transform: translateZ(6px); }
.library-shelf-card--application .library-shelf-icon { animation: application-icon-in 120ms ease both; }
.library-shelf-card--application .library-shelf-icon { border-radius: 12px; }
.library-shelf-icon-skeleton { width: 52px; height: 52px; border: 1px solid rgba(255, 255, 255, .1); border-radius: 13px; background: linear-gradient(110deg, rgba(255, 255, 255, .07) 20%, rgba(255, 255, 255, .16) 42%, rgba(255, 255, 255, .07) 64%); background-size: 220% 100%; box-shadow: inset 0 1px rgba(255, 255, 255, .08); animation: application-icon-pending 1.4s ease-in-out infinite; }
.library-shelf-preview { position: relative; z-index: 2; width: 100%; height: 78px; flex: none; object-fit: cover; border-radius: 10px; filter: drop-shadow(0 3px 7px rgba(0, 0, 0, .6)); pointer-events: none; transform: translateZ(6px); }
.library-shelf-cover { display: flex; width: 100%; flex: none; flex-direction: column; align-items: center; justify-content: flex-start; gap: 7px; margin: 0; padding: 10px 2px 0; border: 0; background: transparent; text-align: center; }
.library-shelf-cover strong { overflow: hidden; width: 100%; color: var(--text-on-ink); font: 600 13px/1.35 var(--font-body); letter-spacing: .02em; text-overflow: ellipsis; text-shadow: 0 1px 3px rgba(0, 0, 0, .9); white-space: nowrap; }
.library-shelf-cover small { overflow: hidden; width: 100%; color: var(--text-on-ink-muted); font: 11px/1.3 var(--font-mono); letter-spacing: .04em; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0, 0, 0, .8); white-space: nowrap; }
.library-shelf-cover .library-shelf-status--missing { color: #ff9f9f; }

.library-shelf-actions {
  position: absolute;
  z-index: 1;
  bottom: -24px;
  left: 50%;
  display: flex;
  height: 24px;
  align-items: flex-start;
  gap: 22px;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(-50%, -22px, -12px);
  transition: opacity 130ms ease, transform 240ms var(--motion-easing);
}

.library-shelf-actions::before {
  position: absolute;
  z-index: -1;
  top: -3px;
  left: 50%;
  width: 76px;
  height: 9px;
  border-radius: 50%;
  background: linear-gradient(90deg, transparent, rgba(99, 254, 19, .26), transparent);
  filter: blur(4px);
  content: "";
  transform: translateX(-50%);
}

.library-shelf-actions--triple { gap: 10px; }

.library-shelf-action {
  position: relative;
  display: grid;
  width: 34px;
  height: 24px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, .14);
  border-top: 0;
  border-radius: 0 0 8px 8px;
  background: linear-gradient(180deg, rgba(24, 27, 25, .99), rgba(8, 10, 9, .99));
  box-shadow: inset 0 -1px rgba(255, 255, 255, .1), 0 8px 14px rgba(0, 0, 0, .34);
  cursor: pointer;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 200ms var(--motion-easing);
}

.library-shelf-action img { width: 14px; height: 14px; pointer-events: none; transition: filter 160ms ease, opacity 160ms ease; }
.library-shelf-action svg { width: 14px; height: 14px; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; pointer-events: none; }
.library-shelf-enter { border-color: rgba(99, 254, 19, .38); }
.library-shelf-enter img { filter: brightness(0) saturate(100%) invert(87%) sepia(100%) saturate(2148%) hue-rotate(40deg) brightness(104%) contrast(104%); }
.library-shelf-rename { border-color: rgba(91, 188, 255, .3); color: rgba(177, 222, 255, .76); }
.library-shelf-delete { border-color: rgba(232, 93, 93, .28); }
.library-shelf-delete img { filter: brightness(0) invert(1); opacity: .62; }
.library-shelf-card--center:hover .library-shelf-actions,
.library-shelf-card--center:focus-within .library-shelf-actions { opacity: 1; pointer-events: auto; transform: translate3d(-50%, 0, -12px) scale(1); }
.library-shelf-enter:hover { border-color: rgba(99, 254, 19, .82); box-shadow: inset 0 -1px rgba(255, 255, 255, .12), 0 9px 18px rgba(99, 254, 19, .2); }
.library-shelf-rename:hover { border-color: rgba(91, 188, 255, .78); box-shadow: inset 0 -1px rgba(255, 255, 255, .1), 0 9px 18px rgba(91, 188, 255, .18); color: #bde5ff; }
.library-shelf-delete:hover { border-color: rgba(232, 93, 93, .76); box-shadow: inset 0 -1px rgba(255, 255, 255, .1), 0 9px 18px rgba(232, 93, 93, .18); }
.library-shelf-delete:hover img { filter: brightness(0) saturate(100%) invert(52%) sepia(59%) saturate(1065%) hue-rotate(315deg) brightness(103%) contrast(82%); opacity: 1; }

.library-rename-editor {
  position: absolute;
  z-index: 6;
  right: 8px;
  bottom: 14px;
  left: 8px;
  display: flex;
  height: 31px;
  align-items: center;
  gap: 4px;
  padding: 3px 3px 3px 9px;
  border: 1px solid rgba(91, 188, 255, .5);
  border-radius: 10px;
  background: rgba(10, 12, 11, .97);
  box-shadow: 0 8px 18px rgba(0, 0, 0, .42), 0 0 14px rgba(91, 188, 255, .1);
  transform: translateZ(14px);
}

.library-rename-input { min-width: 0; height: 100%; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-on-ink); font: 11px var(--font-body); }

.library-shelf-card:hover { border-color: rgba(99, 254, 19, .34); box-shadow: inset 0 1px rgba(255, 255, 255, .09), 0 19px 32px rgba(15, 17, 16, .38); }
.library-shelf-card:hover::before { border-color: rgba(99, 254, 19, .34); }
.library-shelf-card--center:hover { border-color: rgba(99, 254, 19, .8); box-shadow: inset 0 1px rgba(255, 255, 255, .11), inset 0 0 0 1px rgba(99, 254, 19, .12), 0 0 28px rgba(99, 254, 19, .18), 0 22px 38px rgba(15, 17, 16, .46); }
.library-shelf-card--center:hover::before { border-color: rgba(99, 254, 19, .8); }

.application-empty {
  position: relative;
  z-index: 2;
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--ink);
  text-align: center;
}

.application-empty > img { width: 36px; height: 36px; margin-bottom: 2px; filter: grayscale(1); opacity: .78; }
.application-empty > strong { font: 650 14px var(--font-display); letter-spacing: .04em; }
.application-empty > small { color: var(--ink-muted); font: 10px var(--font-body); }
.kongzhuangtai-zifu-line { display: inline-flex; }
.kongzhuangtai-zifu { display: inline-block; animation: kongzhuangtai-zifu-rise 420ms var(--motion-easing) both; animation-delay: var(--zifu-delay, 0ms); }
.application-empty > button {
  height: 32px;
  margin-top: 5px;
  padding: 0 17px;
  border: 1px solid rgba(99, 254, 19, .55);
  border-radius: 16px;
  background: var(--ink);
  box-shadow: 0 5px 12px rgba(38, 38, 38, .16), inset 0 1px rgba(255, 255, 255, .12);
  color: var(--paper-white);
  cursor: pointer;
  font: 600 11px var(--font-body);
  letter-spacing: .06em;
  transition: box-shadow 180ms ease, transform 180ms var(--motion-easing);
}

.application-empty > button:hover { box-shadow: 0 7px 16px rgba(38, 38, 38, .2), 0 0 0 2px rgba(99, 254, 19, .12); transform: translateY(-1px); }
.application-empty > button:disabled { cursor: wait; opacity: .58; transform: none; }
.library-empty { position: relative; z-index: 2; display: grid; width: 100%; height: 100%; margin: 0; color: var(--ink-muted); font: 13px var(--font-body); place-items: center; text-align: center; }
.library-empty .kongzhuangtai-zifu { margin-inline: .02em; }

/* 空状态文字逐字由下向上浮现。 */
@keyframes kongzhuangtai-zifu-rise {
  from { opacity: 0; transform: translate3d(0, 9px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

@keyframes application-icon-in {
  from { opacity: 0; transform: translateZ(6px) scale(.92); }
  to { opacity: 1; transform: translateZ(6px) scale(1); }
}

@keyframes application-icon-pending {
  from { background-position: 120% 0; }
  to { background-position: -120% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .kongzhuangtai-zifu,
  .library-shelf-icon,
  .library-shelf-icon-skeleton { animation: none; }
}
.data-switch-enter-active,
.data-switch-leave-active {
  will-change: opacity, transform;
  transition: opacity 260ms ease, transform 360ms var(--motion-easing);
}

.data-switch-enter-from {
  opacity: 0;
  transform: translate3d(calc(var(--switch-direction, 1) * 52px), 0, 0);
}

.data-switch-leave-to {
  opacity: 0;
  transform: translate3d(calc(var(--switch-direction, 1) * -52px), 0, 0);
}

/* 展开时沿用重构前各分区依次上浮的节奏。 */
.glass-switch-enter-active .library-status,
.glass-switch-enter-active .expanded-top,
.glass-switch-enter-active .folder-panel,
.glass-switch-enter-active .library-list {
  animation: ziliaoku-content-rise 360ms var(--motion-easing) both;
}

.glass-switch-enter-active .expanded-top { animation-delay: 40ms; }
.glass-switch-enter-active .folder-panel { animation-delay: 80ms; }
.glass-switch-enter-active .library-list { animation-delay: 120ms; }

@keyframes ziliaoku-content-rise {
  from { opacity: 0; transform: translate3d(0, 16px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
</style>
