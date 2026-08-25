<template>
  <main
    class="root"
    @mouseleave="huifuMousePassthrough"
    @pointerdown.self="chuliRootPointerDown"
  >
    <QidongOverlay v-if="isStartupWindow && isStartingUp" @complete="wanchengStartup" />

    <section
      v-if="!isStartupWindow"
      class="lingdongchuangkou"
      :class="{
        'lingdongchuangkou--expanded': isExpanded,
        'lingdongchuangkou--drop': isDropFeedbackActive,
        'lingdongchuangkou--dropping': isDropping,
        'lingdongchuangkou--accepted': isDropImporting && !isDropping && !isDropProgressVisible,
        'lingdongchuangkou--importing': isDropProgressVisible && !isDropping,
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
          @transitioncancel="chuliShellTransitionEnd"
        >
          <div class="inner-glow"></div>
          <div class="collapsed-stage">
            <ShouqiStatus
              :animation-id="currentCollapsedAnimation"
              :hidden="isExpanded"
              :moving="isMovingIsland"
              :pasting="isPastingTape"
              charm
            />
          </div>

          <span
            class="sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >{{ isDropFeedbackActive ? `${dropFeedbackInfo.title}，${dropFeedbackInfo.detail}` : '' }}</span>
          <div
            class="drop-hint"
            aria-hidden="true"
          >
            <span class="drop-status">
              <span class="drop-type-icon" aria-hidden="true">
                <PhSpinnerGap v-if="isDropProgressVisible && !isDropping" :size="24" weight="bold" />
                <PhLinkSimple v-else-if="dropNeirongType === 'link'" :size="24" weight="regular" />
                <PhImage v-else-if="dropNeirongType === 'image'" :size="24" weight="regular" />
                <PhFile v-else :size="24" weight="regular" />
              </span>
              <span class="drop-copy">
                <strong>{{ dropFeedbackInfo.title }}</strong>
                <small>{{ dropFeedbackInfo.detail }}</small>
              </span>
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
            :class="{ 'library-stage--visible': isLibraryContentVisible && !isDropFeedbackActive && ['library', 'clipboard'].includes(currentPage) }"
          >
            <ZiliaokuPage
              v-show="currentPage === 'library'"
              :items="libraryItems"
              :category-counts="categoryCounts"
              :library-config="libraryConfig"
              :library-available="libraryAvailable"
              :initial-category="currentZiliaokuCategory"
              :focus-item-id="jujiaoLibraryItemId"
              :is-yingyong-syncing="isYingyongSyncing"
              :is-animation-busy="isExpansionAnimating"
              :is-island-expanded="isExpanded"
              :clipboard-count="jiantiebanItems.length"
@capture-clipboard="chuliJiantiebanBuhuo"
              @open-clipboard="dakaiJiantiebanShoujixiang"
              @open-settings="qiehuanSettings"
              @open-assistant="dakaiAssistant"
              @select-category="xuanzeZiliaokuCategory"
              @refresh-library="shuaxinLibraryIndex(true)"
              @search="sousuoLibrary"
              @load-more="jiazaiGengduo"
              @open-item="dakaiLibraryItem"
              @locate-item="dingweiLibraryItem"
              @share-item="fenxiangLibraryItem"
              @rename-item="chongmingmingLibraryItem"
              @delete-item="qingqiuDeleteItem"
              @delete-items="qingqiuPiliangDelete"
              @sync-applications="tongbuDesktopApplications"
              @show-toast="xianshiToast"
            />
            <Transition name="glass-switch" mode="out-in">
              <JiantiebanPage
                v-if="currentPage === 'clipboard'"
                key="clipboard"
                :items="jiantiebanItems"
                :is-busy="isImporting || isLibraryRootMigrating"
                @back="fanhuiLibrary"
                @archive-item="guidangDanGeJiantiebanItem"
                @archive-all="guidangQuanbuJiantiebanItems"
                @delete-item="shanchuJiantiebanItem"
                @clear="qingqiuQingkongJiantieban"
                @copy="fuzhiJiantiebanItem"
              />
            </Transition>
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

          <!-- AI 页面在收起态保持挂载，确保流式回复与当前会话不会中断。 -->
          <Transition name="glass-switch" mode="out-in">
            <AssistantPage
              v-if="!isDragging && !isDropping && currentPage === 'assistant'"
              v-show="isExpanded"
              key="assistant"
              ref="zhushouPage"
              @back="fanhuiLibrary"
              @request-provider-cleanup="qingqiuZhushouGongyingshangQingli"
              @request-conversation-delete="qingqiuZhushouHuihuaShanchu"
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
            :visible="toastState.visible && !isDropFeedbackActive"
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
import { PhFile, PhImage, PhLinkSimple, PhSpinnerGap } from '@phosphor-icons/vue'
import { computed, defineAsyncComponent, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import { useEventListener, useTimeoutFn } from '@vueuse/core'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AssistantPage from '@/components/AssistantPage.vue'
import JiantiebanPage from '@/components/JiantiebanPage.vue'
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
const zhushouPage = useTemplateRef('zhushouPage')
const isStartingUp = shallowRef(isStartupWindow)
const isExpanded = shallowRef(false)
const isDragging = shallowRef(false)
const isDropping = shallowRef(false)
const isDropImporting = shallowRef(false)
const isDropProgressVisible = shallowRef(false)
const isMovingIsland = shallowRef(false)
const isPastingTape = shallowRef(false)
const islandAnchor = shallowRef({ horizontal: 'right', vertical: 'bottom' })
const dropNeirongType = shallowRef('file')
const dropNeirongCount = shallowRef(1)
const jujiaoLibraryItemId = shallowRef('')
const currentPage = shallowRef('library')
const isLibraryContentVisible = shallowRef(false)
const isExpansionAnimating = shallowRef(false)
const isDropFeedbackActive = computed(() => isDragging.value || isDropping.value || isDropImporting.value)
const isCixiGuajianVisible = computed(() => !isExpanded.value && !isDropFeedbackActive.value)
// 将待投放、已接收和慢任务反馈收敛为稳定的两行状态文案。
const dropFeedbackInfo = computed(() => {
  const neirongName = ({ image: '图片', link: '网址', file: '文件' })[dropNeirongType.value]
  const countText = dropNeirongCount.value > 1 ? `${dropNeirongCount.value} 项` : ''

  if (isDropping.value) return { title: `已接收${neirongName}`, detail: countText || '正在准备保存' }
  if (isDropProgressVisible.value) {
    return {
      title: `正在保存${neirongName}`,
      detail: countText ? `正在处理 ${countText}` : '正在归入资料库',
    }
  }
  if (isDropImporting.value) return { title: `已接收${neirongName}`, detail: countText || '正在准备保存' }
  return {
    title: `松开保存${neirongName}`,
    detail: countText ? `${countText}将归入资料库` : '自动归入资料库',
  }
})
let isPassthrough = true
let islandMoveContext = null
let tapePastingTimer = 0
let collapseShapeTimer = 0
let dropProgressTimer = 0
let isIslandStateChanging = false
let shouldIgnoreIslandClick = false
let islandStateQingqiuVersion = 0
let isLibraryPreloadStarted = false

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
  isImporting,
  isYingyongSyncing,
  isLibraryRootMigrating,
  jiantiebanItems,
  jiazaiLibrary,
  xuanzeLibraryCategory,
  sousuoLibrary,
  jiazaiGengduo,
  shuaxinLibraryIndex,
  xuanzeLibraryRootdir,
  daoruDragContent,
  buhuoJiantiebanContent,
  shuaxinJiantieban,
  guidangJiantiebanItems,
  shanchuJiantiebanItem,
  qingkongJiantiebanItems,
  fuzhiJiantiebanItem,
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
  const totalCount = Math.max(items.length, Number(report.totalCount) || 0)
  const maxMigrationReportItems = 200
  const visibleItems = items.slice(0, maxMigrationReportItems)
  const detailLines = visibleItems.map((item, index) => {
    const name = item.title || item.relativePath || '未知资源'
    const source = item.relativePath ? `\n   原位置：${item.relativePath}` : ''
    return `${index + 1}. ${name}\n   原因：${item.reason || report.reason || '迁移失败'}${source}`
  })
  if (totalCount > visibleItems.length) {
    detailLines.push(`其余 ${totalCount - visibleItems.length} 项未展示，请处理上述问题后重新尝试。`)
  }
  const detail = detailLines.join('\n\n')
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

onBeforeUnmount(() => {
  window.clearTimeout(collapseShapeTimer)
  window.clearTimeout(tapePastingTimer)
  window.clearTimeout(dropProgressTimer)
  if (!isStartupWindow) window.aetherDock?.setHeavyTasksPaused(false)
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
    // 收起只隐藏窗口，不重置工具栏导航；下次展开继续显示用户最后选择的页面。
    if (shouldFinishCollapse) qingqiuCollapsedWindowShape(wasStateChanging ? 0 : 420)
    huifuMousePassthrough(true)
    return
  }

  if (isIslandStateChanging || isExpanded.value) return

  const qingqiuVersion = ++islandStateQingqiuVersion
  isIslandStateChanging = true
  window.clearTimeout(collapseShapeTimer)
  try {
    // 展开后立即关闭原生窗口穿透，避免分类模块依赖鼠标移动才能接收点击。
    await guanbiMousePassthrough(true)
    if (qingqiuVersion !== islandStateQingqiuVersion) return
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
    // 面板先完成首帧绘制，再读取资料库，避免首次点击与索引读取争用主线程。
    window.requestAnimationFrame(() => {
      if (isExpanded.value) yureZiliaoku()
    })
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
  void guanbiMousePassthrough(true)
  isLibraryContentVisible.value = false
  currentPage.value = 'settings'
}

// 打开 AI 助手页面，资料库内容保持挂载但隐藏。
function dakaiAssistant() {
  void guanbiMousePassthrough(true)
  isLibraryContentVisible.value = false
  currentPage.value = 'assistant'
}

function fanhuiLibrary() {
  void guanbiMousePassthrough(true)
  currentPage.value = 'library'
  isLibraryContentVisible.value = true
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

// 资料库仅在首次展开后预热，收起态不抢占宠物的首次交互。
function yureZiliaoku() {
  if (isLibraryPreloadStarted) return
  isLibraryPreloadStarted = true
  void jiazaiLibrary()
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

// 收起态先记录按下位置，确认移动后才启动原生拖动，普通点击无需等待窗口状态切换。
function kaishiYidongIsland(event) {
  if (event.button !== 0 || isExpanded.value || isDragging.value || isDropping.value || isDropImporting.value) return

  const islandElement = event.currentTarget
  islandMoveContext = {
    pointerId: event.pointerId,
    islandElement,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    isNativeMoveReady: false,
    isNativeMoveRequested: false,
    hasMoved: false,
  }
  isPastingTape.value = false
  shouldIgnoreIslandClick = false
  window.clearTimeout(tapePastingTimer)
  islandElement.setPointerCapture?.(event.pointerId)
}

// 原生拖动仅在手势越过阈值后启动，避免点击展开时产生无效 IPC 与窗口重定位。
function kaishiNativeYidong(context) {
  if (!context || context.isNativeMoveRequested || islandMoveContext !== context) return
  context.isNativeMoveRequested = true
  void guanbiMousePassthrough()

  const movePromise = window.aetherDock?.kaishiMainIslandMove()
  if (!movePromise) return
  void movePromise.then((layout) => {
    if (islandMoveContext !== context) {
      window.aetherDock?.jieshuMainIslandMove()
      return
    }
    yingyongIslandAnchor(layout)
    context.isNativeMoveReady = true
    if (context.hasMoved) isMovingIsland.value = true
  }).catch(() => wanchengYidongIsland())
}

function chuliYidongIsland(event) {
  const context = islandMoveContext
  if (!context || event.pointerId !== context.pointerId) return
  if (Math.hypot(event.screenX - context.startScreenX, event.screenY - context.startScreenY) >= 4 && !context.hasMoved) {
    context.hasMoved = true
    kaishiNativeYidong(context)
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
      kaishiNativeYidong(context)
    }
  }

  if (context.islandElement?.hasPointerCapture?.(context.pointerId)) {
    context.islandElement.releasePointerCapture(context.pointerId)
  }
  if (context.isNativeMoveRequested) window.aetherDock?.jieshuMainIslandMove()
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

const TUPIAN_FILE_EXTENSION_RE = /\.(?:avif|bmp|gif|heic|jpe?g|png|svg|webp)$/i

function panduanTupianDragItem(item) {
  const dragFile = item?.kind === 'file' ? item.getAsFile?.() : item
  const mimeType = String(item?.type || dragFile?.type || '').toLowerCase()
  if (mimeType.startsWith('image/')) return true
  return TUPIAN_FILE_EXTENSION_RE.test(String(dragFile?.name ?? ''))
}

// 实体文件优先，全为图片时单独反馈图片类型。
function huoquDragContentType(dataTransfer) {
  const fileItems = Array.from(dataTransfer?.items ?? []).filter((item) => item.kind === 'file')
  const files = Array.from(dataTransfer?.files ?? [])
  const types = Array.from(dataTransfer?.types ?? [])
  const dragFiles = files.length ? files : fileItems

  if (fileItems.length || files.length || types.includes('Files')) {
    return dragFiles.length && dragFiles.every(panduanTupianDragItem) ? 'image' : 'file'
  }
  if (types.includes('text/uri-list')) return 'link'

  const rawText = dataTransfer?.getData('text/uri-list')
    || dataTransfer?.getData('text/plain')
    || ''
  return /^https?:\/\//i.test(rawText.trim()) ? 'link' : 'file'
}

// 仅展示批次数量，不读取或暴露拖入内容名称。
function huoquDragContentCount(dataTransfer) {
  const fileItems = Array.from(dataTransfer?.items ?? []).filter((item) => item.kind === 'file')
  const fileCount = Math.max(fileItems.length, dataTransfer?.files?.length ?? 0)
  if (fileCount) return fileCount

  const rawText = dataTransfer?.getData('text/uri-list')
    || dataTransfer?.getData('text/plain')
    || ''
  const urlCount = new Set(rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && /^https?:\/\//i.test(line))).size
  return Math.max(1, Math.min(urlCount, 20))
}

function qingliDropProgressState() {
  window.clearTimeout(dropProgressTimer)
  dropProgressTimer = 0
  isDropProgressVisible.value = false
}

// 慢任务延迟显示不定进度，避免本地快速归档出现一闪而过的加载态。
function anpaiDropProgressFeedback(delay) {
  qingliDropProgressState()
  if (!delay) {
    isDropProgressVisible.value = true
    return
  }
  dropProgressTimer = window.setTimeout(() => {
    dropProgressTimer = 0
    if (isDropImporting.value && !isDropping.value) isDropProgressVisible.value = true
  }, delay)
}

function chuliDragEnter(event) {
  if (isMovingIsland.value || isDropping.value || isDropImporting.value || !baohanDragContent(event)) return
  event.preventDefault()
  if (isDragging.value) return
  dropNeirongType.value = huoquDragContentType(event.dataTransfer)
  dropNeirongCount.value = huoquDragContentCount(event.dataTransfer)
  isDragging.value = true
  isExpanded.value = false
  isLibraryContentVisible.value = false
}

function chuliDragOver(event) {
  if (isMovingIsland.value || (!isDragging.value && !baohanDragContent(event))) return
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
  dropNeirongType.value = huoquDragContentType(event.dataTransfer)
  dropNeirongCount.value = huoquDragContentCount(event.dataTransfer)
  isDropping.value = true
  isDropImporting.value = true
  isDragging.value = true
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  anpaiDropProgressFeedback(isReducedMotion ? 0 : 280)
  const importPromise = daoruDragContent(event.dataTransfer)
  const feedbackDuration = isReducedMotion ? 0 : 160
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
    qingliDropProgressState()
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
  // 分类按钮触发时再次确认窗口可交互，避免透明窗口的穿透状态吞掉后续点击。
  void guanbiMousePassthrough(true)
  return xuanzeLibraryCategory(category)
}

async function chuliJiantiebanBuhuo() {
  const item = await buhuoJiantiebanContent()
  if (!item) return
  currentPage.value = 'clipboard'
  isLibraryContentVisible.value = true
}

function dakaiJiantiebanShoujixiang() {
  void guanbiMousePassthrough(true)
  currentPage.value = 'clipboard'
  isLibraryContentVisible.value = true
  void shuaxinJiantieban()
}

async function guidangDanGeJiantiebanItem(itemId) {
  await guidangJiantiebanItems([itemId])
}

async function guidangQuanbuJiantiebanItems(itemIds) {
  await guidangJiantiebanItems(itemIds)
}

function qingqiuQingkongJiantieban() {
  qingqiuConfirm({
    title: '清空收集箱',
    message: '确定移除全部剪贴板内容？',
    detail: '这些内容尚未归档，清空后无法恢复。',
    confirmText: '清空',
    tone: 'danger',
  }, () => qingkongJiantiebanItems())
}

// 自定义供应商删除与内置密钥清除共用全局确认弹窗，避免不可逆操作误触。
function qingqiuZhushouGongyingshangQingli(provider) {
  const isCustom = Boolean(provider?.custom)
  const name = String(provider?.name ?? '该供应商')
  qingqiuConfirm({
    title: isCustom ? '删除自定义供应商' : '清除供应商密钥',
    message: isCustom ? `确定删除「${name}」？` : `确定清除「${name}」的密钥？`,
    detail: isCustom
      ? '该供应商下的模型与已保存密钥都会移除，此操作不可撤销。'
      : '供应商会保留在列表中，之后可重新填写密钥使用。',
    confirmText: isCustom ? '删除' : '清除',
    tone: isCustom ? 'danger' : 'default',
  }, () => zhushouPage.value?.zhixingGongyingshangQingli())
}

// 会话删除复用应用内确认弹窗，保持主窗口焦点与展开状态稳定。
function qingqiuZhushouHuihuaShanchu(conversation) {
  const id = String(conversation?.id ?? '')
  const title = String(conversation?.title ?? '该对话')
  if (!id) return
  qingqiuConfirm({
    title: '删除对话',
    message: `确定删除「${title}」？`,
    detail: '删除后无法恢复。',
    confirmText: '删除',
    tone: 'danger',
  }, () => zhushouPage.value?.zhixingHuihuaShanchu(id))
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

function guanbiMousePassthrough(force = false) {
  return shezhiMousePassthrough(false, force)
}

function huifuMousePassthrough(force = false) {
  if (isMovingIsland.value) return
  return guanbiMousePassthrough(force)
}

// 穿透调用失败后废弃本地缓存，下一次鼠标事件会主动重试。
function shezhiMousePassthrough(passthrough, force = false) {
  const nextPassthrough = Boolean(passthrough)
  if (!force && nextPassthrough === isPassthrough) return Promise.resolve()
  isPassthrough = nextPassthrough
  const request = window.aetherDock?.setIslandPassthrough(nextPassthrough)
  if (!request) return Promise.resolve()
  return request.catch(() => {
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
  --drop-motion-height: 46px;
  --drop-stream-height: 30px;
  --drop-stream-distance: 38px;
  --drop-x: calc(var(--shouqi-x) + (var(--shouqi-width) - var(--drop-width)) / 2);
  --drop-y: calc(var(--shouqi-y) - (var(--drop-height) - var(--shouqi-height)));
  --drop-hint-y: calc(var(--shouqi-y) - 70px);
  --shouqi-x: calc(100% - var(--shouqi-width) - var(--shouqi-edge-offset));
  --shouqi-y: calc((100% - var(--shouqi-height)) / 2);
  position: relative;
  width: min(760px, calc(100vw - 40px));
  height: 460px;
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
  --drop-motion-height: 40px;
  --drop-stream-height: 22px;
  --drop-stream-distance: 30px;
  --shouqi-y: var(--shouqi-edge-offset);
  --drop-y: var(--shouqi-y);
  --drop-hint-y: calc(var(--shouqi-y) + var(--shouqi-height) + 2px);
}

.lingdongchuangkou--anchor-y-top .drop-hint {
  flex-direction: column-reverse;
  justify-content: flex-start;
}

.lingdongchuangkou--anchor-y-top .drop-motion {
  margin-top: 0;
  margin-bottom: 6px;
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

.lingdongchuangkou--expanded .toast-layer { height: 460px; }
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

/* 上传反馈保持固定尺寸，避免状态切换时改变桌宠周围的命中区域。 */
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
  --drop-icon-color: var(--accent);
  --drop-pulse-color: #171a19;
  --drop-pulse-soft: rgba(23, 26, 25, .34);
  --drop-pulse-faint: rgba(23, 26, 25, .14);
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
  isolation: isolate;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, 5px, 0);
  transition: opacity 150ms ease, transform 220ms var(--motion-easing);
}

.drop-status {
  position: relative;
  z-index: 1;
  display: grid;
  width: 148px;
  height: 44px;
  flex: none;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background: var(--surface-ink);
  /* 透明窗口中不使用外投影，避免胶囊边缘合成出黑色光晕。 */
  box-shadow: inset 0 1px rgba(255, 255, 255, .08);
  color: var(--text-on-ink);
  transform: translateZ(0);
  transition: transform 180ms var(--motion-easing);
}

.drop-type-icon {
  position: relative;
  z-index: 1;
  display: grid;
  width: 24px;
  height: 24px;
  flex: none;
  color: var(--drop-icon-color);
  place-items: center;
}

.drop-type-icon svg {
  display: block;
}

.drop-copy {
  position: relative;
  z-index: 1;
  display: grid;
  min-width: 0;
  gap: 2px;
}

.drop-copy strong,
.drop-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop-copy strong {
  color: var(--text-on-ink);
  font: 650 12px/1.2 var(--font-body);
  letter-spacing: .015em;
}

.drop-copy small {
  color: var(--text-on-ink-muted);
  font: 500 9.5px/1.2 var(--font-body);
  letter-spacing: .01em;
}

.lingdongchuangkou--dropping .drop-status { transform: translateZ(0) scale(.96); }
.lingdongchuangkou--accepted .drop-status { transform: translateZ(0) scale(.985); }

.drop-motion {
  position: relative;
  z-index: 1;
  width: 64px;
  height: var(--drop-motion-height);
  margin-top: 4px;
  filter:
    drop-shadow(0 0 1px rgba(255, 255, 255, .92))
    drop-shadow(0 1px 2px rgba(255, 255, 255, .68));
}

/* 接收槽与扩散波同步反馈每一批数据抵达。 */
.drop-motion::before {
  position: absolute;
  bottom: -4px;
  left: 50%;
  width: 22px;
  height: 8px;
  border: 1px solid var(--drop-pulse-color);
  border-radius: 50%;
  content: '';
  opacity: 0;
  transform: translate3d(-50%, 0, 0) scale(.45);
  will-change: transform, opacity;
}

.drop-motion::after {
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 18px;
  height: 2px;
  border-radius: 999px;
  background: var(--drop-pulse-color);
  content: '';
  opacity: .54;
  transform: translate3d(-50%, 0, 0) scaleX(.42);
  transform-origin: center;
  will-change: transform, opacity;
}

.drop-particles {
  position: absolute;
  top: 0;
  left: 50%;
  width: 0;
  height: 28px;
  transition: opacity 120ms ease;
}

.drop-particles > span {
  --drop-particle-x: 0px;
  position: absolute;
  top: 0;
  left: -3px;
  width: 6px;
  height: 1px;
  background: var(--drop-pulse-color);
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

.drop-stream {
  position: absolute;
  top: 13px;
  left: 50%;
  width: 1px;
  height: var(--drop-stream-height);
  overflow: hidden;
  background: linear-gradient(180deg, transparent, var(--drop-pulse-soft) 12%, var(--drop-pulse-faint) 86%, transparent);
  transform: translateX(-50%);
  transition: opacity 120ms ease;
}

.drop-stream > span {
  position: absolute;
  top: -12px;
  left: -1px;
  width: 3px;
  height: 12px;
  background: linear-gradient(180deg, transparent, var(--drop-pulse-color) 52%, transparent);
  will-change: transform, opacity;
}

.lingdongchuangkou--accepted .drop-particles,
.lingdongchuangkou--accepted .drop-stream,
.lingdongchuangkou--importing .drop-particles,
.lingdongchuangkou--importing .drop-stream {
  opacity: 0;
}

.lingdongchuangkou--accepted .drop-motion::after,
.lingdongchuangkou--importing .drop-motion::after {
  opacity: .76;
  transform: translate3d(-50%, 0, 0) scaleX(.82);
}

.lingdongchuangkou--accepted .drop-motion::before,
.lingdongchuangkou--importing .drop-motion::before {
  opacity: .28;
  transform: translate3d(-50%, 0, 0) scale(.72);
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
  .lingdongchuangkou--drop:not(.lingdongchuangkou--dropping):not(.lingdongchuangkou--accepted):not(.lingdongchuangkou--importing) .drop-particles > span {
    animation: drop-particle-converge 1.35s cubic-bezier(.4, 0, .2, 1) infinite;
  }

  .lingdongchuangkou--drop .drop-particles > span:nth-child(2) { animation-delay: -450ms; }
  .lingdongchuangkou--drop .drop-particles > span:nth-child(3) { animation-delay: -900ms; }

  .lingdongchuangkou--drop:not(.lingdongchuangkou--accepted):not(.lingdongchuangkou--importing) .drop-stream > span {
    animation: drop-stream-fall 1.35s cubic-bezier(.4, 0, .2, 1) infinite;
  }

  .lingdongchuangkou--drop .drop-stream > span:nth-child(2) { animation-delay: -450ms; }
  .lingdongchuangkou--drop .drop-stream > span:nth-child(3) { animation-delay: -900ms; }

  .lingdongchuangkou--drop:not(.lingdongchuangkou--accepted):not(.lingdongchuangkou--importing) .drop-motion::after {
    animation: drop-intake-receive 1.35s cubic-bezier(.4, 0, .2, 1) infinite;
  }

  .lingdongchuangkou--drop:not(.lingdongchuangkou--accepted):not(.lingdongchuangkou--importing) .drop-motion::before {
    animation: drop-pulse-wave 1.35s cubic-bezier(.16, 1, .3, 1) infinite;
  }

  .lingdongchuangkou--importing .drop-type-icon svg {
    animation: drop-progress-spin 900ms linear infinite;
  }
}

@keyframes drop-progress-spin {
  to { transform: rotate(1turn); }
}

@keyframes drop-particle-converge {
  0% { opacity: 0; transform: translate3d(var(--drop-particle-x), 0, 0) scaleX(1); }
  18% { opacity: .96; }
  66% { opacity: .72; }
  100% { opacity: 0; transform: translate3d(0, 24px, 0) scaleX(.48); }
}

@keyframes drop-stream-fall {
  0% { opacity: 0; transform: translate3d(0, 0, 0) scaleY(.6); }
  14% { opacity: 1; }
  70% { opacity: .9; }
  100% { opacity: 0; transform: translate3d(0, var(--drop-stream-distance), 0) scaleY(1); }
}

@keyframes drop-intake-receive {
  0%, 50%, 100% { opacity: .46; transform: translate3d(-50%, 0, 0) scaleX(.42); }
  66% { opacity: 1; transform: translate3d(-50%, 0, 0) scaleX(1.18); }
  82% { opacity: .68; transform: translate3d(-50%, 0, 0) scaleX(.72); }
}

@keyframes drop-pulse-wave {
  0%, 54% { opacity: 0; transform: translate3d(-50%, 0, 0) scale(.45); }
  66% { opacity: .62; transform: translate3d(-50%, 0, 0) scale(.58); }
  100% { opacity: 0; transform: translate3d(-50%, 0, 0) scale(1.72); }
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
  .drop-hint,
  .drop-status { transition-duration: 0ms; }
  .drop-type-icon svg { animation: none; }
  .drop-particles,
  .drop-stream { transition-duration: 0ms; }

  .drop-particles > span,
  .drop-stream > span,
  .drop-motion::before,
  .drop-motion::after { animation: none; transition-duration: 0ms; }

  .drop-stream > span { opacity: 0; }

  .drop-motion::after {
    opacity: .82;
    transform: translate3d(-50%, 0, 0) scaleX(.76);
  }

  .drop-motion::before {
    opacity: .32;
    transform: translate3d(-50%, 0, 0) scale(.78);
  }

  .lingdongchuangkou--moving .island-shell { transform: none; }
}
</style>
