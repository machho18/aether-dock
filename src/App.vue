<template>
  <main
    class="root"
    @mousemove="gengxinMousePassthrough"
    @mouseleave="huifuMousePassthrough"
    @pointerdown.self="chuliRootPointerDown"
  >
    <QidongOverlay v-if="isStartupWindow && isStartingUp" @complete="wanchengStartup" />

    <section
      v-if="!isStartupWindow"
      class="lingdongchuangkou"
      :class="{
        'lingdongchuangkou--expanded': isExpanded,
        'lingdongchuangkou--drop': isDragging || isDropping || isDropImporting,
        'lingdongchuangkou--dropping': isDropping,
        'lingdongchuangkou--importing': isDropImporting && !isDropping,
        'lingdongchuangkou--moving': isMovingIsland,
        'lingdongchuangkou--pasting': isPastingTape,
        [`lingdongchuangkou--anchor-x-${islandAnchor.horizontal}`]: true,
        [`lingdongchuangkou--anchor-y-${islandAnchor.vertical}`]: true,
      }"
    >
        <CixiGuajianEffect
          v-show="isCixiGuajianVisible"
          :is-visible="isCixiGuajianVisible"
          :is-moving="isMovingIsland"
          :is-pasting="isPastingTape"
        />
        <div class="island-frame island-frame--expanded" aria-hidden="true"></div>
        <div class="island-frame island-frame--drop" aria-hidden="true"></div>
        <div
          ref="islandShell"
          class="island-shell"
          :aria-label="isExpanded ? 'AetherDock 资料库' : '展开 AetherDock'"
          tabindex="0"
          @mouseenter="chuliIslandEnter"
          @mouseleave="chuliIslandLeave"
          @click="chuliIslandClick"
          @pointerdown="kaishiYidongIsland"
          @pointermove="chuliYidongIsland"
          @pointerup="wanchengYidongIsland"
          @pointercancel="wanchengYidongIsland"
          @dragstart.prevent
          @dragenter="chuliDragEnter"
          @dragover="chuliDragOver"
          @dragleave="chuliDragLeave"
          @dragend="qingliDragState"
          @drop="chuliDrop"
          @keydown.enter.prevent="chuliIslandKeyboardOpen"
          @keydown.space.prevent="chuliIslandKeyboardOpen"
          @blur="chuliIslandBlur"
          @transitionrun="chuliShellTransitionRun"
          @transitionend="chuliShellTransitionEnd"
        >
          <div class="inner-glow"></div>
          <div class="collapsed-stage">
            <ShouqiStatus
              :animation-id="currentCollapsedAnimation"
              :hidden="isExpanded || (toastState.visible && !isDragging && !isDropping && !isDropImporting)"
              :moving="isMovingIsland"
              :pasting="isPastingTape"
              charm
            />
          </div>

          <div class="drop-hint" role="status" aria-live="polite">
            <span
              class="drop-preview"
              :class="{ 'drop-preview--single': dropPreviewItems.length === 1 && !dropPreviewExtraCount }"
              aria-hidden="true"
            >
              <span
                v-for="item in dropPreviewItems"
                :key="item.id"
                class="drop-preview-card"
                :class="`drop-preview-card--${item.tone}`"
              >
                <span class="drop-preview-glyph"></span>
                <span class="drop-preview-label">{{ item.label }}</span>
              </span>
              <span v-if="dropPreviewExtraCount" class="drop-preview-extra">+{{ dropPreviewExtraCount }}</span>
            </span>
            <span class="drop-copy">
              <strong>{{ dropFeedbackInfo.title }}</strong>
              <small>{{ dropFeedbackInfo.detail }}</small>
            </span>
          </div>

          <!-- 资料库始终挂载，在收起态完成数据与首屏资源预热。 -->
          <div
            class="library-stage"
            :class="{ 'library-stage--visible': isLibraryContentVisible && !isDragging && !isDropping && !isDropImporting && currentPage === 'library' }"
          >
            <ZiliaokuPage
              :items="libraryItems"
              :category-counts="categoryCounts"
              :library-config="libraryConfig"
              :library-available="libraryAvailable"
              :initial-category="currentZiliaokuCategory"
              :focus-item-id="jujiaoLibraryItemId"
              :is-yingyong-syncing="isYingyongSyncing"
              :is-animation-busy="isExpansionAnimating"
              :is-island-expanded="isExpanded"
              @capture-clipboard="buhuoJiantiebanContent"
              @open-settings="qiehuanSettings"
              @float-window="shouqiDaoYouceCapsule"
              @select-category="xuanzeZiliaokuCategory"
              @search="sousuoLibrary"
              @load-more="jiazaiGengduo"
              @open-item="dakaiLibraryItem"
              @locate-item="dingweiLibraryItem"
              @share-item="fenxiangLibraryItem"
              @rename-item="chongmingmingLibraryItem"
              @delete-item="qingqiuDeleteItem"
              @delete-items="qingqiuPiliangDelete"
              @sync-applications="tongbuDesktopApplications"
            />
          </div>

          <Transition name="glass-switch" mode="out-in">
            <ShezhiPage
              v-if="isExpanded && !isDragging && !isDropping && currentPage === 'settings'"
              key="settings"
              :animation-id="currentCollapsedAnimation"
              :rootdir="libraryConfig.rootdir"
              :is-rootdir-migrating="isLibraryRootMigrating"
              @back="fanhuiLibrary"
              @select-animation="shezhiCollapsedAnimation"
              @select-rootdir="qingqiuMigrateLibrary"
            />
          </Transition>

          <ConfirmDialog
            :visible="confirmState.visible"
            :title="confirmState.title"
            :message="confirmState.message"
            :detail="confirmState.detail"
            :confirm-text="confirmState.confirmText"
            :alternative-text="confirmState.alternativeText"
            :cancel-text="confirmState.cancelText"
            :show-alternative="confirmState.showAlternative"
            :show-cancel="confirmState.showCancel"
            :compact="confirmState.compact"
            :tone="confirmState.tone"
            @confirm="querenAction"
            @alternative="zhixingAlternativeAction"
            @cancel="guanbiConfirm"
          />
        </div>
        <div class="toast-layer">
          <ToastMessage
            :visible="toastState.visible && !isDragging && !isDropping && !isDropImporting"
            :text="toastState.text"
            :type="toastState.type"
            :compact="!isExpanded || toastState.text === '已删除'"
            :corner="isExpanded && toastState.text === '已删除'"
            :embedded="!isExpanded"
          />
        </div>
    </section>
  </main>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, shallowRef, useTemplateRef } from 'vue'
import { useEventListener, useTimeoutFn } from '@vueuse/core'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import QidongOverlay from '@/components/QidongOverlay.vue'
import ShezhiPage from '@/components/ShezhiPage.vue'
import ShouqiStatus from '@/components/ShouqiStatus.vue'
import ToastMessage from '@/components/ToastMessage.vue'
import ZiliaokuPage from '@/components/ZiliaokuPage.vue'
import { useFankuiFeedback } from '@/composables/useFankuiFeedback'
import { useZiliaokuLibrary } from '@/composables/useZiliaokuLibrary'

// 挂件动效独立为轻量组件，主界面无需承担持续动画开销。
const CixiGuajianEffect = defineAsyncComponent(() => import('@/components/CixiGuajianEffect.vue'))

const isStartupWindow = new URLSearchParams(window.location.search).get('startup') === '1'
const islandShell = useTemplateRef('islandShell')
const isStartingUp = shallowRef(isStartupWindow)
const isExpanded = shallowRef(false)
const isDragging = shallowRef(false)
const isDropping = shallowRef(false)
const isDropImporting = shallowRef(false)
const isMovingIsland = shallowRef(false)
const isPastingTape = shallowRef(false)
const islandAnchor = shallowRef({ horizontal: 'right', vertical: 'center' })
const dropNeirongSummary = shallowRef('文件、链接或文字')
const dropPreviewItems = shallowRef([{ id: 'file', label: 'FILE', tone: 'file' }])
const dropPreviewExtraCount = shallowRef(0)
const jujiaoLibraryItemId = shallowRef('')
const currentPage = shallowRef('library')
const isLibraryContentVisible = shallowRef(false)
const isExpansionAnimating = shallowRef(false)
const isCixiGuajianVisible = computed(() => !isExpanded.value && !isDragging.value && !isDropping.value && !isDropImporting.value)
let isPassthrough = true
let islandMoveContext = null
let tapePastingTimer = 0
let collapseShapeTimer = 0
let isIslandStateChanging = false
let shouldIgnoreIslandClick = false
let islandStateQingqiuVersion = 0

const dropFeedbackInfo = computed(() => {
  if (isDropping.value) return { title: '已接住', detail: dropNeirongSummary.value }
  if (isDropImporting.value) return { title: '正在整理', detail: '完成后自动归类' }
  return { title: '松手归档', detail: dropNeirongSummary.value }
})

const {
  toastState,
  confirmState,
  xianshiToast,
  qingqiuConfirm,
  guanbiConfirm,
  querenAction,
  zhixingAlternativeAction,
} = useFankuiFeedback()

const {
  libraryItems,
  categoryCounts,
  currentCategory: currentZiliaokuCategory,
  libraryConfig,
  libraryAvailable,
  currentCollapsedAnimation,
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
} = useZiliaokuLibrary(xianshiToast, xianshiMigrationReport)

function xianshiMigrationReport(report) {
  const items = Array.isArray(report.items) ? report.items : []
  const detail = items.map((item, index) => {
    const name = item.title || item.relativePath || '未知资源'
    const source = item.relativePath ? `\n   原位置：${item.relativePath}` : ''
    return `${index + 1}. ${name}\n   原因：${item.reason || report.reason || '迁移失败'}${source}`
  }).join('\n\n')
  qingqiuConfirm({
    title: report.title || '迁移明细',
    message: report.message || '以下资源未能完成迁移：',
    detail,
    confirmText: '知道了',
    showCancel: false,
    tone: report.tone || 'default',
  })
}

const { start: qidongCompleteTimer } = useTimeoutFn(
  () => window.aetherDock?.completeStartup(),
  280,
  { immediate: false },
)

onMounted(() => {
  if (!isStartupWindow) jiazaiLibrary()
})

useEventListener(window, 'blur', chuliWindowBlur)
useEventListener(window, 'pointerup', wanchengYidongIsland)
useEventListener(window, 'pointercancel', wanchengYidongIsland)

function wanchengStartup() {
  if (!isStartingUp.value) return
  isStartingUp.value = false
  qidongCompleteTimer()
}

function yingyongIslandAnchor(layout) {
  const anchor = layout?.anchor
  if (!['left', 'center', 'right'].includes(anchor?.horizontal)) return
  if (!['top', 'center', 'bottom'].includes(anchor?.vertical)) return
  islandAnchor.value = anchor
}

function tongbuIslandWindowShape(state, options) {
  const shapePromise = window.aetherDock?.setIslandWindowShape(state, options)
  if (!shapePromise) return Promise.resolve(null)
  return shapePromise.then((layout) => {
    yingyongIslandAnchor(layout)
    return layout
  }).catch(() => null)
}

async function qiehuanIslandState(expanded) {
  if (isMovingIsland.value || isDragging.value) return
  if (!expanded) {
    if (confirmState.value.visible) return
    const wasStateChanging = isIslandStateChanging
    const shouldFinishCollapse = isExpanded.value || isLibraryContentVisible.value || wasStateChanging
    islandStateQingqiuVersion += 1
    isIslandStateChanging = false
    isExpanded.value = false
    isLibraryContentVisible.value = false
    currentPage.value = 'library'
    if (shouldFinishCollapse) qingqiuCollapsedWindowShape(wasStateChanging ? 0 : 420)
    huifuMousePassthrough(true)
    return
  }

  if (isIslandStateChanging || isExpanded.value) return

  const qingqiuVersion = ++islandStateQingqiuVersion
  isIslandStateChanging = true
  window.clearTimeout(collapseShapeTimer)
  try {
    // 先按当前屏幕空间选择展开方向，再同步原生可见区域，挂件位置保持不变。
    let layout = null
    try {
      layout = await window.aetherDock?.setIslandWindowShape('expanded', { optimizeAnchor: true })
    } catch {
      // 原生边界更新失败时仍允许渲染层展开，避免入口失去响应。
    }
    if (qingqiuVersion !== islandStateQingqiuVersion) return
    yingyongIslandAnchor(layout)
    isExpanded.value = true
    isLibraryContentVisible.value = true
    void shuaxinLibraryIndex()
  } finally {
    // 窗口重定位会产生一次延迟的 mouseleave，保留到下一帧再结束切换锁。
    window.requestAnimationFrame(() => {
      if (qingqiuVersion === islandStateQingqiuVersion) isIslandStateChanging = false
    })
  }
}

function qingqiuCollapsedWindowShape(delay = 420) {
  window.clearTimeout(collapseShapeTimer)
  collapseShapeTimer = window.setTimeout(wanchengCollapsedWindowShape, delay)
}

function wanchengCollapsedWindowShape() {
  window.clearTimeout(collapseShapeTimer)
  if (isExpanded.value || isDragging.value || isDropping.value || isDropImporting.value || isPastingTape.value) return
  tongbuIslandWindowShape('collapsed')
}

function chuliShellTransitionRun(event) {
  if (event.target !== islandShell.value || event.propertyName !== 'clip-path') return
  isExpansionAnimating.value = true
  window.aetherDock?.setHeavyTasksPaused(true)
}

function chuliShellTransitionEnd(event) {
  if (event.target !== islandShell.value || event.propertyName !== 'clip-path') return
  isExpansionAnimating.value = false
  if (!isExpanded.value && !isDragging.value) wanchengCollapsedWindowShape()
  if (!isDragging.value && !isDropping.value) window.aetherDock?.setHeavyTasksPaused(false)
}

// 切换设置时隐藏资料库内容，但保留其组件状态供返回时复用。
function qiehuanSettings() {
  isLibraryContentVisible.value = false
  currentPage.value = 'settings'
}

function fanhuiLibrary() {
  currentPage.value = 'library'
  isLibraryContentVisible.value = true
}

// 展开面板收回右侧胶囊，避免切换至第二个入口窗口造成位置跳变。
function shouqiDaoYouceCapsule() {
  if (isDragging.value || isDropImporting.value || confirmState.value.visible) return
  qiehuanIslandState(false)
}

function chuliIslandEnter() {
  guanbiMousePassthrough(true)
}

// 收起态仅由明确的点击或键盘确认展开，避免拖动时的焦点事件误触发面板。
function chuliIslandClick() {
  if (shouldIgnoreIslandClick) {
    shouldIgnoreIslandClick = false
    return
  }
  if (!isExpanded.value) qiehuanIslandState(true)
}

function chuliIslandKeyboardOpen() {
  qiehuanIslandState(true)
}

function chuliIslandLeave() {
  if (isMovingIsland.value || isIslandStateChanging) return
  qingliDragState()
  // 展开态保持可见，真正点击窗口外部或失焦时再统一收起。
  huifuMousePassthrough()
}

// 点击原生矩形内的透明边缘时，按外部点击处理。
function chuliRootPointerDown() {
  if (!isExpanded.value || confirmState.value.visible) return
  void qiehuanIslandState(false)
}

// 收起态按下后由主进程直接跟随系统鼠标，渲染层只负责判断拖动意图与视觉反馈。
function kaishiYidongIsland(event) {
  if (event.button !== 0 || isExpanded.value || isDragging.value || isDropping.value || isDropImporting.value) return

  const islandElement = event.currentTarget
  const context = {
    pointerId: event.pointerId,
    islandElement,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    isNativeMoveReady: false,
    hasMoved: false,
  }
  islandMoveContext = context
  isPastingTape.value = false
  shouldIgnoreIslandClick = false
  window.clearTimeout(tapePastingTimer)
  islandElement.setPointerCapture?.(event.pointerId)
  guanbiMousePassthrough()

  const movePromise = window.aetherDock?.kaishiMainIslandMove()
  if (!movePromise) {
    wanchengYidongIsland(event)
    return
  }
  void movePromise.then((layout) => {
    if (islandMoveContext !== context) {
      window.aetherDock?.jieshuMainIslandMove()
      return
    }
    yingyongIslandAnchor(layout)
    context.isNativeMoveReady = true
    if (context.hasMoved) isMovingIsland.value = true
  }).catch(() => wanchengYidongIsland(event))
}

function chuliYidongIsland(event) {
  const context = islandMoveContext
  if (!context || event.pointerId !== context.pointerId) return
  if (Math.hypot(event.screenX - context.startScreenX, event.screenY - context.startScreenY) >= 4 && !context.hasMoved) {
    context.hasMoved = true
    if (context.isNativeMoveReady) isMovingIsland.value = true
  }
  if (context.hasMoved) event.preventDefault()
}

function wanchengYidongIsland(event) {
  const context = islandMoveContext
  if (!context || (event?.pointerId !== undefined && event.pointerId !== context.pointerId)) return

  if (Number.isFinite(event?.screenX) && Number.isFinite(event?.screenY)) {
    const deltaX = event.screenX - context.startScreenX
    const deltaY = event.screenY - context.startScreenY
    if (Math.hypot(deltaX, deltaY) >= 4) {
      context.hasMoved = true
    }
  }

  if (context.islandElement?.hasPointerCapture?.(context.pointerId)) {
    context.islandElement.releasePointerCapture(context.pointerId)
  }
  window.aetherDock?.jieshuMainIslandMove()
  islandMoveContext = null
  isMovingIsland.value = false
  shouldIgnoreIslandClick = context.hasMoved
  isPastingTape.value = context.hasMoved
  window.clearTimeout(tapePastingTimer)
  if (context.hasMoved) {
    tapePastingTimer = window.setTimeout(() => {
      isPastingTape.value = false
      tongbuIslandWindowShape('collapsed')
    }, 460)
  } else {
    // 等待随后派发的 click 决定是否展开，避免收起裁剪与展开裁剪相互覆盖。
    qingqiuCollapsedWindowShape(0)
  }
}

function chuliWindowBlur() {
  qingliDragState()
  wanchengYidongIsland()
  void qiehuanIslandState(false)
}

function baohanDragContent(event) {
  const types = Array.from(event.dataTransfer?.types ?? [])
  return types.some((type) => ['Files', 'text/uri-list', 'text/plain'].includes(type))
}

function huoquDropFileLabel(file) {
  const filename = file?.name ?? ''
  const extension = filename.includes('.') ? filename.split('.').pop() : ''
  const normalizedExtension = extension?.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()
  if (normalizedExtension) return normalizedExtension

  const typeLabels = { image: 'IMG', audio: 'AUD', video: 'VID', text: 'TXT' }
  return typeLabels[file?.type?.split('/')[0]] ?? 'FILE'
}

const wenjianToneExtensions = {
  image: new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'heic', 'avif']),
  pdf: new Set(['pdf']),
  sheet: new Set(['xls', 'xlsx', 'csv', 'ods']),
  archive: new Set(['zip', 'rar', '7z', 'tar', 'gz']),
  media: new Set(['mp3', 'wav', 'flac', 'aac', 'mp4', 'mov', 'mkv', 'webm']),
  document: new Set(['txt', 'md', 'doc', 'docx', 'rtf', 'ppt', 'pptx', 'json', 'js', 'ts', 'vue', 'css', 'html']),
}

// 依据文件类型生成克制的卡片材质，不读取文件内容。
function huoquDropFileTone(file, label) {
  const mimeType = file?.type ?? ''
  const extension = label.toLowerCase()
  if (mimeType.startsWith('image/') || wenjianToneExtensions.image.has(extension)) return 'image'
  if (mimeType === 'application/pdf' || wenjianToneExtensions.pdf.has(extension)) return 'pdf'
  if (wenjianToneExtensions.sheet.has(extension)) return 'sheet'
  if (wenjianToneExtensions.archive.has(extension)) return 'archive'
  if (mimeType.startsWith('audio/') || mimeType.startsWith('video/') || wenjianToneExtensions.media.has(extension)) return 'media'
  if (mimeType.startsWith('text/') || wenjianToneExtensions.document.has(extension)) return 'document'
  return 'file'
}

// 只展示文件类型与数量，不暴露或绘制完整文件名。
function huoquDragContentInfo(dataTransfer) {
  const fileItems = Array.from(dataTransfer?.items ?? []).filter((item) => item.kind === 'file')
  const itemFiles = fileItems.map((item) => item.getAsFile?.()).filter(Boolean)
  const availableFiles = itemFiles.length ? itemFiles : Array.from(dataTransfer?.files ?? [])
  const fileCount = Math.max(fileItems.length, availableFiles.length)
  if (fileCount) {
    const previewItems = Array.from({ length: Math.min(fileCount, 3) }, (_, index) => {
      const file = availableFiles[index]
      const label = huoquDropFileLabel(file)
      return {
        id: `file-${index}`,
        label,
        tone: huoquDropFileTone(file, label),
      }
    })
    return {
      summary: `${fileCount} 个文件`,
      previewItems,
      extraCount: Math.max(fileCount - previewItems.length, 0),
    }
  }

  const types = Array.from(dataTransfer?.types ?? [])
  const isUrl = types.includes('text/uri-list')
  return {
    summary: isUrl ? '网页链接' : '文字内容',
    previewItems: [{
      id: isUrl ? 'url' : 'text',
      label: isUrl ? 'URL' : 'TXT',
      tone: isUrl ? 'url' : 'document',
    }],
    extraCount: 0,
  }
}

function chuliDragEnter(event) {
  if (isMovingIsland.value || isDropping.value || isDropImporting.value || !baohanDragContent(event)) return
  event.preventDefault()
  if (isDragging.value) return
  const contentInfo = huoquDragContentInfo(event.dataTransfer)
  dropNeirongSummary.value = contentInfo.summary
  dropPreviewItems.value = contentInfo.previewItems
  dropPreviewExtraCount.value = contentInfo.extraCount
  isDragging.value = true
  isExpanded.value = false
  isLibraryContentVisible.value = false
}

function chuliDragOver(event) {
  if (isMovingIsland.value || !baohanDragContent(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

function chuliDragLeave(event) {
  if (isMovingIsland.value) return
  if (!isDragging.value) return
  if (!panduanMouseOverIsland(event.clientX, event.clientY)) qingliDragState()
}

async function chuliDrop(event) {
  if (isMovingIsland.value || isDropping.value || isDropImporting.value || !baohanDragContent(event)) return
  event.preventDefault()
  isDropping.value = true
  isDropImporting.value = true
  isDragging.value = true
  const importPromise = daoruDragContent(event.dataTransfer)
  const feedbackDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160
  try {
    if (feedbackDuration) await new Promise((resolve) => window.setTimeout(resolve, feedbackDuration))
    isDropping.value = false
    qingliDragState(true)

    const addedItems = await importPromise
    if (!addedItems.length) return

    const zuixinDaoruItem = addedItems.at(-1)
    await xuanzeLibraryCategory(zuixinDaoruItem?.type ?? 'document')
    // 导入完成后让资料库轮播将最新资源置于中心位置。
    jujiaoLibraryItemId.value = zuixinDaoruItem?.id ?? ''
    currentPage.value = 'library'
    isExpanded.value = false
  } finally {
    isDropping.value = false
    isDropImporting.value = false
    qingliDragState(true)
  }
}

function chuliIslandBlur(event) {
  if (isMovingIsland.value) return
  if (event.relatedTarget && islandShell.value?.contains(event.relatedTarget)) return
  void qiehuanIslandState(false)
}

// 记录用户选择的资料库 Tab，供下次展开时恢复。
function xuanzeZiliaokuCategory(category) {
  xuanzeLibraryCategory(category)
}

function qingliDragState(force = false) {
  if (isDropping.value && force !== true) return
  isDragging.value = false
  if (!isDropImporting.value && !isExpanded.value && !isPastingTape.value) qingqiuCollapsedWindowShape(340)
}

function qingqiuDeleteItem(item) {
  const isKuaijieShortcut = item.storageMode === 'shortcut'
  qingqiuConfirm({
    title: isKuaijieShortcut ? '移除程序' : '删除资料',
    message: isKuaijieShortcut ? '确定从程序列表移除？' : '确定删除该资料？',
    detail: isKuaijieShortcut
      ? '仅移除 AetherDock 记录，不会删除桌面快捷方式或目标程序。'
      : '将同时删除本地文件与资料库记录，此操作不可撤销。',
    confirmText: isKuaijieShortcut ? '移除' : '删除',
    tone: isKuaijieShortcut ? 'default' : 'danger',
  }, () => shanchuLibraryItem(item))
}

function qingqiuPiliangDelete(items) {
  const count = Array.isArray(items) ? items.length : 0
  if (!count) return
  qingqiuConfirm({
    title: `删除 ${count} 项资料`,
    message: '确定删除已选内容？',
    detail: '受管图片和文档会一并删除；应用程序仅移除 AetherDock 记录。此操作不可撤销。',
    confirmText: '删除',
    tone: 'danger',
  }, () => shanchuLibraryItems(items))
}

function qingqiuMigrateLibrary() {
  if (!libraryConfig.value.rootdir) {
    void xuanzeLibraryRootdir()
    return
  }
  qingqiuConfirm({
    title: '更换资料库目录',
    message: '请选择更换方式。默认新建资料库，不会移动现有内容。',
    detail: '新建资料库：旧资料库保持不变，后续内容保存到新目录。\n迁移资料库：先复制并校验资源，成功后再清理旧目录。\n两种方式都不会在失败时删除旧资料。',
    confirmText: '新建，不迁移',
    alternativeText: '迁移资料库',
    cancelText: '取消',
    showCancel: true,
    showAlternative: true,
    compact: true,
    tone: 'default',
  }, () => xuanzeLibraryRootdir('new'), () => xuanzeLibraryRootdir('migrate'))
}

function gengxinMousePassthrough(event) {
  if (isMovingIsland.value) return
  if (isExpanded.value || isIslandStateChanging || confirmState.value.visible) {
    guanbiMousePassthrough()
    return
  }
  shezhiMousePassthrough(!panduanMouseOverIsland(event.clientX, event.clientY))
}

function panduanMouseOverIsland(clientX, clientY) {
  const hitElement = document.elementFromPoint(clientX, clientY)
  return Boolean(hitElement && islandShell.value?.contains(hitElement))
}

function guanbiMousePassthrough(force = false) {
  shezhiMousePassthrough(false, force)
}

function huifuMousePassthrough(force = false) {
  if (isMovingIsland.value) return
  if (isExpanded.value || isIslandStateChanging || confirmState.value.visible) {
    guanbiMousePassthrough(force)
    return
  }
  shezhiMousePassthrough(true, force)
}

// 穿透调用失败后废弃本地缓存，下一次鼠标事件会主动重试。
function shezhiMousePassthrough(passthrough, force = false) {
  const nextPassthrough = Boolean(passthrough)
  if (!force && nextPassthrough === isPassthrough) return
  isPassthrough = nextPassthrough
  const request = window.aetherDock?.setIslandPassthrough(nextPassthrough)
  request?.catch(() => {
    if (isPassthrough === nextPassthrough) isPassthrough = null
  })
}
</script>

<style scoped>
.root {
  display: grid;
  width: 100vw;
  min-height: 100vh;
  place-items: center end;
  overflow: hidden;
  background: transparent;
  -webkit-app-region: no-drag;
}

.lingdongchuangkou {
  --shouqi-width: 104px;
  --shouqi-height: 116px;
  --shouqi-edge-offset: 28px;
  --drop-width: 232px;
  --drop-height: 116px;
  --drop-visual-height: 108px;
  --drop-visual-y: calc(var(--drop-y) + 4px);
  --drop-content-width: calc(var(--drop-width) - var(--shouqi-width));
  --drop-radius: 20px 34px 34px 20px;
  --drop-enter-x: 8px;
  --drop-light-x: 86%;
  --shouqi-x: calc(100% - var(--shouqi-width) - var(--shouqi-edge-offset));
  --shouqi-y: calc((100% - var(--shouqi-height)) / 2);
  --drop-x: calc(100% - var(--drop-width) - var(--shouqi-edge-offset));
  --drop-y: calc((100% - var(--drop-height)) / 2);
  --drop-content-x: var(--drop-x);
  position: relative;
  width: min(680px, calc(100vw - 40px));
  height: 380px;
  overflow: visible;
  cursor: default;
  isolation: isolate;
  pointer-events: none;
}

.lingdongchuangkou--anchor-x-left {
  --shouqi-x: var(--shouqi-edge-offset);
  --drop-x: var(--shouqi-edge-offset);
  --drop-content-x: calc(var(--drop-x) + var(--shouqi-width));
  --drop-enter-x: -8px;
  --drop-light-x: 14%;
  --drop-radius: 34px 20px 20px 34px;
}

.lingdongchuangkou--anchor-x-center {
  --shouqi-x: calc((100% - var(--shouqi-width)) / 2);
  --drop-x: calc(var(--shouqi-x) + var(--shouqi-width) - var(--drop-width));
  --drop-content-x: var(--drop-x);
}

.lingdongchuangkou--anchor-y-center {
  --shouqi-y: calc((100% - var(--shouqi-height)) / 2);
  --drop-y: calc((100% - var(--drop-height)) / 2);
}

.lingdongchuangkou--anchor-y-top {
  --shouqi-y: var(--shouqi-edge-offset);
  --drop-y: var(--shouqi-edge-offset);
}

.lingdongchuangkou--anchor-y-bottom {
  --shouqi-y: calc(100% - var(--shouqi-height) - var(--shouqi-edge-offset));
  --drop-y: calc(100% - var(--drop-height) - var(--shouqi-edge-offset));
}

.island-frame {
  position: absolute;
  z-index: 3;
  top: 0;
  left: 50%;
  border: 1px solid transparent;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%);
  transition: opacity 100ms ease;
}

.island-frame--expanded {
  width: 100%;
  height: 100%;
  border-color: var(--border-ink);
  border-radius: 20px;
  box-shadow: inset 0 1px rgba(255, 255, 255, .72), 0 12px 32px rgba(0, 0, 0, .18);
}

.island-frame--drop {
  top: var(--drop-visual-y);
  left: var(--drop-x);
  width: var(--drop-width);
  height: var(--drop-visual-height);
  border-color: rgba(190, 207, 198, .32);
  border-radius: var(--drop-radius);
  box-shadow: inset 0 1px rgba(255, 255, 255, .08), 0 10px 24px rgba(0, 0, 0, .14);
  transform: none;
}

.toast-layer {
  position: absolute;
  z-index: 10;
  top: var(--shouqi-y);
  left: var(--shouqi-x);
  width: var(--shouqi-width);
  height: var(--shouqi-height);
  pointer-events: none;
}

.lingdongchuangkou--expanded .toast-layer {
  top: 0;
  left: 0;
  width: 100%;
}

.lingdongchuangkou--expanded .toast-layer { height: 380px; }
.lingdongchuangkou--drop .toast-layer {
  top: var(--drop-y);
  left: var(--drop-x);
  width: var(--drop-width);
  height: var(--drop-height);
}

.lingdongchuangkou--expanded .island-frame--expanded { opacity: 1; transition-delay: 260ms; }
.lingdongchuangkou--drop .island-frame--drop { opacity: 1; }

.island-shell {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: visible;
  clip-path: inset(
    var(--shouqi-y)
    calc(100% - var(--shouqi-x) - var(--shouqi-width))
    calc(100% - var(--shouqi-y) - var(--shouqi-height))
    var(--shouqi-x)
    round 38px
  );
  contain: layout style;
  pointer-events: auto;
  transform-origin:
    calc(var(--shouqi-x) + var(--shouqi-width) / 2)
    calc(var(--shouqi-y) + var(--shouqi-height) / 2);
  transition: clip-path 280ms var(--motion-easing), transform 210ms cubic-bezier(.16, 1, .3, 1);
  will-change: clip-path, transform;
  -webkit-app-region: no-drag;
}

.lingdongchuangkou:not(.lingdongchuangkou--expanded):not(.lingdongchuangkou--drop) .island-shell {
  cursor: grab;
  touch-action: none;
}

/* 移动中保持主体坐标不变，纵深仅由磁场和落影表达，避免鼠标抓取点错位。 */
.lingdongchuangkou--moving .island-shell {
  cursor: grabbing;
  transform: none;
  transition-duration: 120ms;
}

.lingdongchuangkou--moving .collapsed-stage::before { opacity: 0; }

/* 松开时略微压缩后回到接触面，避免悬停感突然消失。 */
.lingdongchuangkou--pasting .island-shell {
  animation: cixi-body-settle 420ms cubic-bezier(.16, 1, .3, 1) both;
}

.lingdongchuangkou--expanded .island-shell {
  clip-path: inset(0 round 20px);
  transition-duration: 360ms;
}

/* 收起态完全透明，仅由猫动画和自然落影构成视觉主体。 */
.lingdongchuangkou:not(.lingdongchuangkou--expanded):not(.lingdongchuangkou--drop) .inner-glow {
  background: transparent;
  box-shadow: none;
}

.collapsed-stage {
  position: absolute;
  z-index: 1;
  top: var(--shouqi-y);
  left: var(--shouqi-x);
  width: var(--shouqi-width);
  height: var(--shouqi-height);
}

.collapsed-stage::before {
  position: absolute;
  inset: 7px 5px 17px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(101, 143, 123, .16), rgba(101, 143, 123, .05) 46%, transparent 72%);
  content: '';
  opacity: 0;
  transform: scale(.84);
  transition: opacity 180ms ease, transform 220ms var(--motion-easing);
}

.island-shell:hover .collapsed-stage::before,
.island-shell:focus-visible .collapsed-stage::before {
  opacity: 1;
  transform: scale(1);
}

.island-shell:focus-visible { outline: none; }
.lingdongchuangkou--expanded .collapsed-stage::before,
.lingdongchuangkou--drop .collapsed-stage::before { opacity: 0; }

.library-stage {
  position: absolute;
  z-index: 2;
  inset: 0;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, 8px, 0);
  transition: opacity 130ms ease, transform 170ms var(--motion-easing), visibility 0s linear 170ms;
}

.library-stage--visible {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
  transform: translate3d(0, 0, 0);
  transition: opacity 160ms ease 190ms, transform 210ms var(--motion-easing) 170ms, visibility 0s linear;
}

.inner-glow {
  position: absolute;
  z-index: 0;
  inset: 0;
  border-radius: 20px;
  background: transparent;
}

.lingdongchuangkou--expanded .inner-glow {
  inset: 1px;
  border-radius: 18px;
  background: linear-gradient(155deg, rgba(255, 255, 255, .99), rgba(246, 246, 245, .98) 52%, rgba(239, 239, 236, .99));
  box-shadow: inset 0 1px rgba(255, 255, 255, .86), inset 0 -1px rgba(38, 38, 38, .08);
}

/* 上传态只在宠物周围展开轻量归档口袋，不移动原生窗口。 */
.lingdongchuangkou--drop {
  pointer-events: none;
}

.lingdongchuangkou--drop .island-shell {
  clip-path: inset(
    var(--drop-y)
    calc(100% - var(--drop-x) - var(--drop-width))
    calc(100% - var(--drop-y) - var(--drop-height))
    var(--drop-x)
    round var(--drop-radius)
  );
  pointer-events: auto;
  transition-duration: 160ms;
}

.lingdongchuangkou--drop .inner-glow {
  inset: auto;
  top: calc(var(--drop-visual-y) + 1px);
  left: calc(var(--drop-x) + 1px);
  width: calc(var(--drop-width) - 2px);
  height: calc(var(--drop-visual-height) - 2px);
  border-radius: var(--drop-radius);
  background:
    radial-gradient(circle at var(--drop-light-x) 44%, rgba(99, 254, 19, .085), transparent 31%),
    linear-gradient(145deg, rgba(38, 43, 40, .97), rgba(16, 19, 18, .99));
  box-shadow: inset 0 1px rgba(255, 255, 255, .06), inset 0 -1px rgba(0, 0, 0, .24);
}

.drop-hint {
  position: absolute;
  z-index: 2;
  top: var(--drop-visual-y);
  left: var(--drop-content-x);
  display: flex;
  width: var(--drop-content-width);
  height: var(--drop-visual-height);
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  color: var(--text-on-ink);
  opacity: 0;
  pointer-events: none;
  transform: translate3d(var(--drop-enter-x), 0, 0);
  transition: opacity 120ms ease, transform 160ms var(--motion-easing);
}

.drop-preview {
  position: relative;
  width: 40px;
  height: 50px;
  flex: 0 0 auto;
}

.drop-preview--single { width: 31px; }

.drop-preview-card {
  --drop-card-top: rgba(211, 224, 216, .2);
  --drop-card-bottom: rgba(72, 86, 79, .14);
  --drop-card-label: rgba(232, 239, 235, .76);
  position: absolute;
  top: 5px;
  left: 1px;
  z-index: 1;
  display: grid;
  width: 29px;
  height: 40px;
  grid-template-rows: 1fr auto;
  gap: 2px;
  overflow: hidden;
  padding: 4px 3px 5px;
  border: 1px solid rgba(230, 239, 234, .15);
  border-radius: 9px;
  background: linear-gradient(155deg, var(--drop-card-top), var(--drop-card-bottom));
  box-shadow: 0 7px 14px rgba(0, 0, 0, .18), inset 0 1px rgba(255, 255, 255, .08);
  opacity: 0;
  transform: translate3d(var(--drop-enter-x), 5px, 0) scale(.92);
  transition: opacity 130ms ease, transform 190ms var(--motion-easing), border-color 140ms ease;
}

.drop-preview-card::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, rgba(255, 255, 255, .07), transparent 42%);
  content: '';
  pointer-events: none;
}

.drop-preview-glyph,
.drop-preview-label {
  position: relative;
  z-index: 1;
}

.drop-preview-glyph {
  display: block;
  width: 100%;
  min-height: 17px;
  border: 1px solid rgba(238, 244, 240, .1);
  border-radius: 5px;
  background: linear-gradient(145deg, rgba(230, 238, 233, .12), rgba(111, 127, 118, .08));
  box-shadow: inset 0 1px rgba(255, 255, 255, .05);
}

.drop-preview-label {
  justify-self: center;
  color: var(--drop-card-label);
  font: 650 7px/1 var(--font-mono);
  letter-spacing: .055em;
}

/* 图片以静态缩略画布呈现。 */
.drop-preview-card--image {
  --drop-card-top: rgba(68, 113, 112, .42);
  --drop-card-bottom: rgba(31, 58, 60, .3);
  --drop-card-label: rgba(205, 232, 226, .9);
}

.drop-preview-card--image .drop-preview-glyph {
  background:
    radial-gradient(circle at 74% 26%, rgba(230, 242, 234, .8) 0 1.7px, transparent 2px),
    linear-gradient(145deg, transparent 46%, rgba(116, 170, 151, .68) 47% 69%, transparent 70%),
    linear-gradient(35deg, rgba(54, 101, 99, .94) 0 46%, transparent 47%),
    linear-gradient(150deg, rgba(118, 157, 157, .42), rgba(31, 57, 59, .18));
}

/* 文档通过纸张行距与折角区分。 */
.drop-preview-card--document {
  --drop-card-top: rgba(164, 174, 170, .3);
  --drop-card-bottom: rgba(65, 73, 70, .2);
  --drop-card-label: rgba(230, 235, 232, .86);
}

.drop-preview-card--document .drop-preview-glyph {
  background:
    linear-gradient(225deg, rgba(12, 15, 14, .42) 0 4px, transparent 4.5px) top right / 7px 7px no-repeat,
    repeating-linear-gradient(to bottom, rgba(226, 234, 230, .35) 0 1px, transparent 1px 4px),
    linear-gradient(145deg, rgba(194, 204, 199, .2), rgba(94, 105, 100, .12));
}

.drop-preview-card--pdf {
  --drop-card-top: rgba(128, 72, 68, .44);
  --drop-card-bottom: rgba(66, 37, 36, .27);
  --drop-card-label: rgba(240, 210, 205, .9);
}

.drop-preview-card--pdf .drop-preview-glyph {
  background:
    linear-gradient(225deg, rgba(58, 24, 23, .52) 0 4px, transparent 4.5px) top right / 7px 7px no-repeat,
    repeating-linear-gradient(to bottom, rgba(245, 220, 215, .34) 0 1px, transparent 1px 4px),
    linear-gradient(145deg, rgba(181, 106, 99, .28), rgba(83, 43, 41, .18));
}

/* 表格使用细网格，保持低饱和避免彩虹感。 */
.drop-preview-card--sheet {
  --drop-card-top: rgba(55, 101, 75, .44);
  --drop-card-bottom: rgba(29, 59, 43, .28);
  --drop-card-label: rgba(202, 232, 210, .9);
}

.drop-preview-card--sheet .drop-preview-glyph {
  background:
    repeating-linear-gradient(to right, transparent 0 5px, rgba(199, 229, 207, .2) 5px 6px),
    repeating-linear-gradient(to bottom, transparent 0 4px, rgba(199, 229, 207, .2) 4px 5px),
    linear-gradient(145deg, rgba(78, 130, 96, .36), rgba(32, 68, 48, .2));
}

.drop-preview-card--archive {
  --drop-card-top: rgba(121, 93, 51, .45);
  --drop-card-bottom: rgba(62, 47, 27, .28);
  --drop-card-label: rgba(235, 218, 183, .9);
}

.drop-preview-card--archive .drop-preview-glyph {
  background:
    repeating-linear-gradient(to bottom, rgba(239, 218, 171, .45) 0 2px, transparent 2px 4px) center / 3px 100% no-repeat,
    linear-gradient(90deg, transparent 44%, rgba(39, 29, 17, .28) 44% 56%, transparent 56%),
    linear-gradient(145deg, rgba(147, 111, 60, .38), rgba(68, 51, 29, .2));
}

.drop-preview-card--media {
  --drop-card-top: rgba(70, 82, 119, .46);
  --drop-card-bottom: rgba(35, 42, 67, .29);
  --drop-card-label: rgba(211, 217, 239, .9);
}

.drop-preview-card--media .drop-preview-glyph {
  background:
    linear-gradient(to top, rgba(213, 219, 240, .52) 0 68%, transparent 69%) 3px bottom / 2px 9px no-repeat,
    linear-gradient(to top, rgba(213, 219, 240, .4) 0 42%, transparent 43%) 8px bottom / 2px 12px no-repeat,
    linear-gradient(to top, rgba(213, 219, 240, .6) 0 78%, transparent 79%) 13px bottom / 2px 8px no-repeat,
    linear-gradient(145deg, rgba(92, 106, 151, .36), rgba(42, 51, 81, .2));
}

.drop-preview-card--url {
  --drop-card-top: rgba(55, 100, 111, .44);
  --drop-card-bottom: rgba(28, 54, 62, .28);
  --drop-card-label: rgba(202, 229, 233, .9);
}

.drop-preview-card--url .drop-preview-glyph {
  background:
    radial-gradient(circle at 30% 67%, transparent 0 3px, rgba(204, 232, 235, .46) 3.5px 4.5px, transparent 5px),
    radial-gradient(circle at 70% 33%, transparent 0 3px, rgba(204, 232, 235, .46) 3.5px 4.5px, transparent 5px),
    linear-gradient(145deg, transparent 45%, rgba(204, 232, 235, .4) 46% 54%, transparent 55%),
    linear-gradient(145deg, rgba(72, 126, 137, .32), rgba(30, 62, 69, .2));
}

.drop-preview-card:nth-child(2) {
  left: 6px;
  z-index: 2;
  transition-delay: 20ms;
}

.drop-preview-card:nth-child(3) {
  left: 11px;
  z-index: 3;
  transition-delay: 40ms;
}

.drop-preview-extra {
  position: absolute;
  z-index: 4;
  right: 0;
  bottom: 1px;
  min-width: 17px;
  padding: 2px 3px;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 8px;
  background: rgba(8, 10, 9, .88);
  color: rgba(220, 229, 224, .72);
  font: 650 7px/1 var(--font-mono);
  text-align: center;
}

.drop-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.drop-copy strong {
  color: rgba(244, 247, 245, .96);
  font: 650 12px/1 var(--font-display);
  letter-spacing: .035em;
  white-space: nowrap;
}

.drop-copy small {
  overflow: hidden;
  color: rgba(196, 207, 201, .66);
  font: 500 9px/1 var(--font-display);
  letter-spacing: .045em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lingdongchuangkou--drop .drop-hint {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.lingdongchuangkou--drop .drop-preview-card:nth-child(1) {
  opacity: 1;
  transform: translate3d(0, 5px, 0) rotate(-7deg);
}

.lingdongchuangkou--drop .drop-preview-card:nth-child(2) {
  opacity: 1;
  transform: translate3d(0, 1px, 0) rotate(-1deg);
}

.lingdongchuangkou--drop .drop-preview-card:nth-child(3) {
  opacity: 1;
  transform: translate3d(0, 4px, 0) rotate(7deg);
}

.lingdongchuangkou--dropping .island-frame--drop,
.lingdongchuangkou--importing .island-frame--drop {
  border-color: rgba(99, 254, 19, .32);
}

.lingdongchuangkou--dropping .drop-preview-card,
.lingdongchuangkou--importing .drop-preview-card {
  border-color: rgba(129, 221, 146, .28);
}

.lingdongchuangkou--dropping .drop-copy strong,
.lingdongchuangkou--importing .drop-copy strong {
  color: rgba(164, 227, 175, .94);
}

@keyframes cixi-body-settle {
  0% { transform: none; }
  58% { transform: translate3d(0, 1px, 0) scale(.99); }
  100% { transform: none; }
}

.glass-switch-enter-active { transition: opacity 240ms ease; }
.glass-switch-leave-active { transition: opacity 150ms ease; }
.glass-switch-enter-from,
.glass-switch-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .island-shell,
  .library-stage,
  .glass-switch-enter-active,
  .glass-switch-leave-active {
    transition-duration: 80ms;
  }

  .library-stage--visible,
  .lingdongchuangkou--expanded .island-frame--expanded,
  .lingdongchuangkou--drop .island-frame--drop { transition-delay: 0s; }

  .lingdongchuangkou--pasting .island-shell { animation: none; }

  .drop-preview-card { transition-duration: 0ms; }

  .lingdongchuangkou--moving .island-shell { transform: none; }
}
</style>
