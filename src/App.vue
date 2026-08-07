<template>
  <main class="root" @mousemove="gengxinMousePassthrough" @mouseleave="huifuMousePassthrough">
    <QidongOverlay v-if="isStartupWindow && isStartingUp" @complete="wanchengStartup" />

    <section
      v-if="!isStartupWindow"
      class="lingdongchuangkou"
      :class="{
        'lingdongchuangkou--expanded': isExpanded,
        'lingdongchuangkou--drop': isDragging || isDropping || isDropImporting,
        'lingdongchuangkou--dropping': isDropping,
        'lingdongchuangkou--importing': isDropImporting && !isDropping,
      }"
    >
        <div class="island-frame island-frame--collapsed" aria-hidden="true"></div>
        <div class="island-frame island-frame--expanded" aria-hidden="true"></div>
        <div class="island-frame island-frame--drop" aria-hidden="true"></div>
        <div
          ref="islandShell"
          class="island-shell"
          aria-label="黑色玻璃灵动窗口"
          tabindex="0"
          @mouseenter="chuliIslandEnter"
          @mouseleave="chuliIslandLeave"
          @dragenter="chuliDragEnter"
          @dragover="chuliDragOver"
          @dragleave="chuliDragLeave"
          @dragend="qingliDragState"
          @drop="chuliDrop"
          @focus="chuliIslandEnter"
          @blur="chuliIslandBlur"
          @transitionrun="chuliShellTransitionRun"
          @transitionend="chuliShellTransitionEnd"
        >
          <div class="inner-glow"></div>
          <div class="collapsed-stage">
            <ShouqiStatus
              :animation-id="currentCollapsedAnimation"
              :hidden="isExpanded || (toastState.visible && !isDragging && !isDropping && !isDropImporting)"
              :dragging="isDragging || isDropping || isDropImporting"
            />
          </div>

        <div class="drop-hint" aria-hidden="true">
          <span class="drop-paste-stage">
            <img class="drop-paste-visual" :src="dropGlassImage" alt="" />
          </span>
          <span class="drop-label">{{ isDropping ? '贴入归档' : isDropImporting ? '正在归档' : '松手贴入' }}</span>
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
              @float-window="qiehuanXuanfuqiu"
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
import { onMounted, shallowRef, useTemplateRef } from 'vue'
import { useEventListener, useTimeoutFn } from '@vueuse/core'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import QidongOverlay from '@/components/QidongOverlay.vue'
import ShezhiPage from '@/components/ShezhiPage.vue'
import ShouqiStatus from '@/components/ShouqiStatus.vue'
import ToastMessage from '@/components/ToastMessage.vue'
import ZiliaokuPage from '@/components/ZiliaokuPage.vue'
import { useFankuiFeedback } from '@/composables/useFankuiFeedback'
import { useZiliaokuLibrary } from '@/composables/useZiliaokuLibrary'
import dropGlassImage from '@/assets/images/drag-drop-glass-v2.webp'

const isStartupWindow = new URLSearchParams(window.location.search).get('startup') === '1'
const islandShell = useTemplateRef('islandShell')
const isStartingUp = shallowRef(isStartupWindow)
const isExpanded = shallowRef(false)
const isDragging = shallowRef(false)
const isDropping = shallowRef(false)
const isDropImporting = shallowRef(false)
const jujiaoLibraryItemId = shallowRef('')
const currentPage = shallowRef('library')
const isLibraryContentVisible = shallowRef(false)
const isExpansionAnimating = shallowRef(false)
let isPassthrough = true

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

useEventListener(window, 'blur', qingliDragState)

function wanchengStartup() {
  if (!isStartingUp.value) return
  isStartingUp.value = false
  qidongCompleteTimer()
}

function qiehuanIslandState(expanded) {
  if (isDragging.value || (!expanded && confirmState.value.visible)) return
  const shouldRefresh = expanded && !isExpanded.value
  isExpanded.value = expanded
  isLibraryContentVisible.value = expanded
  if (shouldRefresh) void shuaxinLibraryIndex()
  if (!expanded) {
    currentPage.value = 'library'
  }
}

function chuliShellTransitionRun(event) {
  if (event.target !== islandShell.value || event.propertyName !== 'clip-path') return
  isExpansionAnimating.value = true
  window.aetherDock?.setHeavyTasksPaused(true)
}

function chuliShellTransitionEnd(event) {
  if (event.target !== islandShell.value || event.propertyName !== 'clip-path') return
  isExpansionAnimating.value = false
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

// 主灵动岛窗口保持原位，主进程仅显示已预加载的独立悬浮球窗口。
async function qiehuanXuanfuqiu() {
  if (isDragging.value || isDropImporting.value || confirmState.value.visible) return
  qiehuanIslandState(false)
  await window.aetherDock?.setFloatingMode(true)
}

function chuliIslandEnter() {
  guanbiMousePassthrough()
  qiehuanIslandState(true)
}

function chuliIslandLeave() {
  qingliDragState()
  qiehuanIslandState(false)
  huifuMousePassthrough()
}

function baohanDragContent(event) {
  const types = Array.from(event.dataTransfer?.types ?? [])
  return types.some((type) => ['Files', 'text/uri-list', 'text/plain'].includes(type))
}

function chuliDragEnter(event) {
  if (isDropping.value || isDropImporting.value || !baohanDragContent(event)) return
  event.preventDefault()
  isDragging.value = true
  isExpanded.value = false
  isLibraryContentVisible.value = false
}

function chuliDragOver(event) {
  if (!baohanDragContent(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

function chuliDragLeave(event) {
  if (!isDragging.value) return
  if (!panduanMouseOverIsland(event.clientX, event.clientY)) qingliDragState()
}

async function chuliDrop(event) {
  if (isDropping.value || isDropImporting.value || !baohanDragContent(event)) return
  event.preventDefault()
  isDropping.value = true
  isDropImporting.value = true
  isDragging.value = true
  const importPromise = daoruDragContent(event.dataTransfer)
  const animationDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 640
  try {
    await new Promise((resolve) => window.setTimeout(resolve, animationDuration))
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
  if (event.relatedTarget && islandShell.value?.contains(event.relatedTarget)) return
  qiehuanIslandState(false)
}

// 记录用户选择的资料库 Tab，供下次展开时恢复。
function xuanzeZiliaokuCategory(category) {
  xuanzeLibraryCategory(category)
}

function qingliDragState(force = false) {
  if (isDropping.value && force !== true) return
  isDragging.value = false
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
  shezhiMousePassthrough(!panduanMouseOverIsland(event.clientX, event.clientY))
}

function panduanMouseOverIsland(clientX, clientY) {
  const hitElement = document.elementFromPoint(clientX, clientY)
  return Boolean(hitElement && islandShell.value?.contains(hitElement))
}

function guanbiMousePassthrough() {
  shezhiMousePassthrough(false)
}

function huifuMousePassthrough() {
  shezhiMousePassthrough(true)
}

function shezhiMousePassthrough(passthrough) {
  if (passthrough === isPassthrough) return
  isPassthrough = passthrough
  window.aetherDock?.setIslandPassthrough(passthrough)
}
</script>

<style scoped>
@property --drop-frame-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.root {
  display: grid;
  width: 100vw;
  min-height: 100vh;
  place-items: start center;
  overflow: hidden;
  background: transparent;
  -webkit-app-region: no-drag;
}

.lingdongchuangkou {
  position: relative;
  width: min(680px, calc(100vw - 40px));
  height: 380px;
  overflow: visible;
  cursor: default;
  isolation: isolate;
  pointer-events: none;
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

.island-frame--collapsed {
  width: min(360px, calc(100vw - 52px));
  height: 60px;
  border-bottom-color: rgba(255, 255, 255, .28);
  border-radius: 0 0 30px 30px;
  box-shadow: 0 1px 3px rgba(255, 255, 255, .12);
  opacity: 1;
  transition-delay: 170ms;
}

.island-frame--expanded {
  width: 100%;
  height: 100%;
  border-color: var(--border-ink);
  border-radius: 20px;
  box-shadow: inset 0 1px rgba(255, 255, 255, .72), 0 12px 32px rgba(0, 0, 0, .18);
}

.island-frame--drop {
  width: min(520px, calc(100vw - 48px));
  height: 158px;
  border-color: rgba(99, 254, 19, .72);
  border-radius: 32px;
  box-shadow: 0 0 12px rgba(99, 254, 19, .18), inset 0 0 14px rgba(99, 254, 19, .06);
}

.island-frame--drop::after {
  position: absolute;
  inset: -3px;
  padding: 3px;
  border-radius: 34px;
  background: conic-gradient(from var(--drop-frame-angle), transparent 0deg 218deg, rgba(99, 254, 19, .55) 238deg, rgba(235, 255, 227, 1) 268deg, rgba(99, 254, 19, .86) 296deg, transparent 318deg);
  content: '';
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  opacity: 0;
  pointer-events: none;
  filter: drop-shadow(0 0 5px rgba(99, 254, 19, .95)) drop-shadow(0 0 12px rgba(99, 254, 19, .5));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
}

.toast-layer {
  position: absolute;
  z-index: 10;
  top: 0;
  left: 0;
  width: 100%;
  height: 60px;
  pointer-events: none;
}

.lingdongchuangkou--expanded .toast-layer { height: 380px; }
.lingdongchuangkou--drop .toast-layer { height: 158px; }

.lingdongchuangkou--expanded .island-frame--collapsed,
.lingdongchuangkou--drop .island-frame--collapsed { opacity: 0; transition-delay: 0s; }
.lingdongchuangkou--expanded .island-frame--expanded { opacity: 1; transition-delay: 260ms; }
.lingdongchuangkou--drop .island-frame--drop { opacity: 1; transition-delay: 170ms; }
.lingdongchuangkou--drop .island-frame--drop::after { animation: drop-frame-orbit 1.55s linear infinite; opacity: 1; }

.island-shell {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: visible;
  clip-path: inset(0 calc((100% - min(360px, calc(100vw - 52px))) / 2) calc(100% - 60px) round 0 0 30px 30px);
  contain: layout style;
  pointer-events: auto;
  transition: clip-path 280ms var(--motion-easing);
  will-change: clip-path;
  -webkit-app-region: no-drag;
}

.lingdongchuangkou--expanded .island-shell {
  clip-path: inset(0 round 20px);
  transition-duration: 360ms;
}

.collapsed-stage {
  position: absolute;
  z-index: 1;
  top: 0;
  left: 50%;
  width: min(360px, calc(100vw - 52px));
  height: 60px;
  transform: translateX(-50%);
}

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
  background: linear-gradient(180deg, rgba(24, 26, 25, .98), rgba(9, 11, 10, .99));
}

.lingdongchuangkou--expanded .inner-glow {
  inset: 1px;
  border-radius: 18px;
  background: linear-gradient(155deg, rgba(255, 255, 255, .99), rgba(246, 246, 245, .98) 52%, rgba(239, 239, 236, .99));
  box-shadow: inset 0 1px rgba(255, 255, 255, .86), inset 0 -1px rgba(38, 38, 38, .08);
}

/* 拖放态使用更宽松的投放空间。 */
.lingdongchuangkou--drop {
  pointer-events: none;
}

.lingdongchuangkou--drop .island-shell {
  clip-path: inset(0 calc((100% - min(520px, calc(100vw - 48px))) / 2) calc(100% - 158px) round 32px);
  pointer-events: auto;
  transition-duration: 300ms;
}

.lingdongchuangkou--drop .inner-glow {
  inset: 1px;
  border-radius: 31px;
}

.drop-hint {
  position: absolute;
  z-index: 2;
  top: 79px;
  left: 50%;
  display: grid;
  justify-items: center;
  gap: 8px;
  color: var(--text-on-ink);
  font: 600 11px/1 var(--font-display);
  letter-spacing: .14em;
  opacity: 0;
  pointer-events: none;
  text-shadow: 0 0 12px rgba(99, 254, 19, .26);
  transform: translate(-50%, -50%) scale(.72);
  transition: opacity 160ms ease, transform 260ms var(--motion-easing);
}

.drop-paste-stage {
  position: relative;
  display: block;
  width: 100px;
  height: 100px;
}

.drop-paste-visual {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 20px;
  object-fit: contain;
  filter: drop-shadow(0 7px 12px rgba(0, 0, 0, .28));
  transform-origin: 50% 60%;
  user-select: none;
  -webkit-user-drag: none;
}

.drop-label {
  min-width: 7em;
  text-align: center;
}

.lingdongchuangkou--drop .drop-hint {
  font-size: 13px;
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.lingdongchuangkou--dropping .island-frame--drop { animation: drop-shell-impact 640ms var(--motion-easing) both; }
.lingdongchuangkou--drop .drop-paste-visual { animation: drop-visual-reveal 420ms cubic-bezier(.16, 1, .3, 1) both; }
.lingdongchuangkou--dropping .drop-label { animation: drop-label-confirm 640ms ease both; }
.lingdongchuangkou--importing .drop-label { color: rgba(255, 255, 255, .84); letter-spacing: .18em; }

@keyframes drop-visual-reveal {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes drop-shell-impact {
  0%, 52% { box-shadow: 0 0 12px rgba(99, 254, 19, .18), inset 0 0 14px rgba(99, 254, 19, .06); }
  60% { box-shadow: 0 0 30px rgba(99, 254, 19, .38), inset 0 0 24px rgba(99, 254, 19, .12); }
  100% { box-shadow: 0 0 12px rgba(99, 254, 19, .18), inset 0 0 14px rgba(99, 254, 19, .06); }
}

@keyframes drop-label-confirm {
  0%, 46% { color: var(--text-on-ink); letter-spacing: .14em; opacity: .72; }
  62% { color: var(--accent); letter-spacing: .24em; opacity: 1; }
  100% { color: var(--text-on-ink); letter-spacing: .14em; opacity: .92; }
}

@keyframes drop-frame-orbit {
  to { --drop-frame-angle: 360deg; }
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
  .lingdongchuangkou--drop .island-frame--drop,
  .island-frame--collapsed { transition-delay: 0s; }

  .lingdongchuangkou--dropping .island-frame--drop,
  .lingdongchuangkou--drop .island-frame--drop::after,
  .lingdongchuangkou--drop .drop-paste-visual,
  .lingdongchuangkou--dropping .drop-label { animation: none; }
}
</style>
