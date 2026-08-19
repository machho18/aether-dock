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
            <span class="drop-copy">
              <strong>{{ dropFeedbackInfo.title }}</strong>
              <small>{{ dropFeedbackInfo.detail }}</small>
            </span>
            <span class="drop-motion" aria-hidden="true">
              <span class="drop-particles">
                <span></span>
                <span></span>
                <span></span>
              </span>
              <span class="drop-stream">
                <span></span>
                <span></span>
                <span></span>
              </span>
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
  if (isDropping.value) return { title: '正在接收', detail: dropNeirongSummary.value }
  if (isDropImporting.value) return { title: '正在整理', detail: '完成后打开资料库' }
  return { title: '松开以收纳', detail: `${dropNeirongSummary.value}将自动归档` }
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

// 仅反馈投放内容类型与数量，不暴露文件名。
function huoquDragContentSummary(dataTransfer) {
  const fileItems = Array.from(dataTransfer?.items ?? []).filter((item) => item.kind === 'file')
  const fileCount = Math.max(fileItems.length, dataTransfer?.files?.length ?? 0)
  if (fileCount) return `${fileCount} 个文件`

  const types = Array.from(dataTransfer?.types ?? [])
  return types.includes('text/uri-list') ? '网页链接' : '文字内容'
}

function chuliDragEnter(event) {
  if (isMovingIsland.value || isDropping.value || isDropImporting.value || !baohanDragContent(event)) return
  event.preventDefault()
  if (isDragging.value) return
  dropNeirongSummary.value = huoquDragContentSummary(event.dataTransfer)
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
  --drop-width: 160px;
  --drop-height: 214px;
  --drop-hint-height: 94px;
  --drop-motion-height: 58px;
  --drop-stream-height: 40px;
  --drop-stream-distance: 48px;
  --drop-x: calc(var(--shouqi-x) + (var(--shouqi-width) - var(--drop-width)) / 2);
  --drop-y: calc(var(--shouqi-y) - (var(--drop-height) - var(--shouqi-height)));
  --drop-hint-y: calc(var(--shouqi-y) - 70px);
  --shouqi-x: calc(100% - var(--shouqi-width) - var(--shouqi-edge-offset));
  --shouqi-y: calc((100% - var(--shouqi-height)) / 2);
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
}

.lingdongchuangkou--anchor-x-center {
  --shouqi-x: calc((100% - var(--shouqi-width)) / 2);
}

.lingdongchuangkou--anchor-y-center {
  --shouqi-y: calc((100% - var(--shouqi-height)) / 2);
}

.lingdongchuangkou--anchor-y-top {
  --drop-hint-height: 90px;
  --drop-motion-height: 50px;
  --drop-stream-height: 24px;
  --drop-stream-distance: 34px;
  --shouqi-y: var(--shouqi-edge-offset);
  --drop-y: var(--shouqi-y);
  --drop-hint-y: calc(var(--shouqi-y) + var(--shouqi-height) + 8px);
}

.lingdongchuangkou--anchor-y-top .drop-hint {
  flex-direction: column-reverse;
  justify-content: flex-start;
}

.lingdongchuangkou--anchor-y-top .drop-motion {
  margin-top: 0;
  margin-bottom: 7px;
  transform: scaleY(-1);
}

.lingdongchuangkou--anchor-y-bottom {
  --shouqi-y: calc(100% - var(--shouqi-height) - var(--shouqi-edge-offset));
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
  border-radius: 20px;
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
.island-shell {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: visible;
  border-radius: 20px;
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

/* 上传反馈像系统提示一样悬浮在桌宠上方，不建立额外容器。 */
.lingdongchuangkou--drop {
  pointer-events: none;
}

.lingdongchuangkou--drop .island-shell {
  clip-path: inset(
    var(--drop-y)
    calc(100% - var(--drop-x) - var(--drop-width))
    calc(100% - var(--drop-y) - var(--drop-height))
    var(--drop-x)
  );
  pointer-events: auto;
  transition-duration: 160ms;
}

.drop-hint {
  position: absolute;
  z-index: 2;
  top: var(--drop-hint-y);
  left: var(--drop-x);
  display: flex;
  width: var(--drop-width);
  height: var(--drop-hint-height);
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  color: rgba(246, 248, 246, .94);
  isolation: isolate;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, 5px, 0);
  transition: opacity 150ms ease, transform 220ms var(--motion-easing);
}

.drop-copy {
  position: relative;
  z-index: 1;
  display: grid;
  font-family: "Noto Sans SC", "Microsoft YaHei UI", "PingFang SC", sans-serif;
  justify-items: center;
  gap: 3px;
  text-align: center;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
}

.drop-copy strong {
  color: rgba(153, 160, 155, .98);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: .015em;
  text-shadow: 0 1px 1px rgba(8, 11, 9, .54);
  white-space: nowrap;
}

.drop-copy small {
  overflow: hidden;
  max-width: 154px;
  color: rgba(147, 154, 149, .96);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.55;
  letter-spacing: .012em;
  text-overflow: ellipsis;
  text-shadow: 0 1px 1px rgba(8, 11, 9, .48);
  white-space: nowrap;
}

.drop-motion {
  position: relative;
  z-index: 1;
  width: 64px;
  height: var(--drop-motion-height);
  margin-top: 7px;
}

/* 数据抵达宠物前以收纳刻线反馈。 */
.drop-motion::after {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 15px;
  height: 1px;
  background: rgba(137, 144, 139, .72);
  box-shadow: 0 1px rgba(248, 249, 248, .44), 0 -1px rgba(8, 11, 9, .18);
  content: '';
  opacity: .48;
  transform: translate3d(-50%, 0, 0) scaleX(.42);
  transform-origin: center;
}

.drop-particles {
  position: absolute;
  top: 0;
  left: 50%;
  width: 0;
  height: 28px;
}

.drop-particles > span {
  --drop-particle-x: 0px;
  position: absolute;
  top: 0;
  left: -3px;
  width: 6px;
  height: 1px;
  background: rgba(117, 124, 119, .74);
  box-shadow: 0 1px rgba(248, 249, 248, .58);
  transform: translate3d(var(--drop-particle-x), 0, 0);
  will-change: transform, opacity;
}

.drop-particles > span:first-child { --drop-particle-x: -18px; }
.drop-particles > span:last-child { --drop-particle-x: 18px; }

.lingdongchuangkou--dropping .drop-particles > span {
  animation: none;
  opacity: 0;
  transform: translate3d(0, 25px, 0) scaleX(.45);
  transition: opacity 150ms ease, transform 180ms cubic-bezier(.4, 0, 1, 1);
}

.lingdongchuangkou--importing .drop-particles {
  opacity: 0;
}

.drop-stream {
  position: absolute;
  top: 13px;
  left: 50%;
  width: 1px;
  height: var(--drop-stream-height);
  overflow: hidden;
  background: linear-gradient(180deg, transparent, rgba(137, 144, 139, .34) 12%, rgba(137, 144, 139, .26) 86%, transparent);
  box-shadow: 1px 0 rgba(248, 249, 248, .26), -1px 0 rgba(8, 11, 9, .12);
  transform: translateX(-50%);
}

.drop-stream > span {
  position: absolute;
  top: -12px;
  left: -1px;
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, transparent, rgba(124, 132, 126, .96) 52%, transparent);
  box-shadow: 1px 0 rgba(248, 249, 248, .48), -1px 0 rgba(8, 11, 9, .24);
  will-change: transform, opacity;
}

.lingdongchuangkou--drop .drop-hint {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

@media (prefers-reduced-motion: no-preference) {
  .lingdongchuangkou--drop:not(.lingdongchuangkou--dropping):not(.lingdongchuangkou--importing) .drop-particles > span {
    animation: drop-particle-converge 1.5s cubic-bezier(.4, 0, .2, 1) infinite;
  }

  .lingdongchuangkou--drop .drop-particles > span:nth-child(2) { animation-delay: -500ms; }
  .lingdongchuangkou--drop .drop-particles > span:nth-child(3) { animation-delay: -1000ms; }

  .lingdongchuangkou--drop .drop-stream > span {
    animation: drop-stream-fall 1.5s cubic-bezier(.4, 0, .2, 1) infinite;
  }

  .lingdongchuangkou--drop .drop-stream > span:nth-child(2) { animation-delay: -500ms; }
  .lingdongchuangkou--drop .drop-stream > span:nth-child(3) { animation-delay: -1000ms; }

  .lingdongchuangkou--drop .drop-motion::after {
    animation: drop-intake-receive 1.5s cubic-bezier(.4, 0, .2, 1) infinite;
  }
}

@keyframes drop-particle-converge {
  0% { opacity: 0; transform: translate3d(var(--drop-particle-x), 0, 0) scaleX(1); }
  20% { opacity: .82; }
  68% { opacity: .58; }
  100% { opacity: 0; transform: translate3d(0, 24px, 0) scaleX(.48); }
}

@keyframes drop-stream-fall {
  0% { opacity: 0; transform: translate3d(0, 0, 0) scaleY(.6); }
  16% { opacity: .94; }
  72% { opacity: .82; }
  100% { opacity: 0; transform: translate3d(0, var(--drop-stream-distance), 0) scaleY(1); }
}

@keyframes drop-intake-receive {
  0%, 58%, 100% { opacity: .42; transform: translate3d(-50%, 0, 0) scaleX(.42); }
  76% { opacity: .9; transform: translate3d(-50%, 0, 0) scaleX(1); }
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
  .lingdongchuangkou--expanded .island-frame--expanded { transition-delay: 0s; }

  .lingdongchuangkou--pasting .island-shell { animation: none; }

  .drop-particles > span,
  .drop-stream > span,
  .drop-motion::after { animation: none; transition-duration: 0ms; }

  .drop-stream > span { opacity: 0; }

  .drop-motion::after {
    opacity: .68;
    transform: translate3d(-50%, 0, 0) scaleX(.76);
  }

  .lingdongchuangkou--moving .island-shell { transform: none; }
}
</style>
