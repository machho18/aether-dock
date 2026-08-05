<template>
  <main class="root" @mousemove="gengxinMousePassthrough" @mouseleave="huifuMousePassthrough">
    <QidongOverlay v-if="isStartupWindow && isStartingUp" @complete="wanchengStartup" />

    <section
      v-if="!isStartupWindow"
      class="lingdongchuangkou"
      :class="{
        'lingdongchuangkou--expanded': isExpanded,
        'lingdongchuangkou--drop': isDragging || isDropping,
        'lingdongchuangkou--dropping': isDropping,
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
              :hidden="isExpanded || (toastState.visible && !isDragging && !isDropping)"
              :dragging="isDragging || isDropping"
            />
          </div>

        <div class="drop-hint" aria-hidden="true">
          <span class="drop-paste-stage">
            <i class="drop-paste-target"></i>
            <span class="drop-token">
              <i></i>
              <i></i>
              <i></i>
            </span>
            <i class="drop-paste-ripple"></i>
          </span>
          <span class="drop-label">{{ isDropping ? '贴入归档' : isImporting ? '正在归档' : '松手贴入' }}</span>
        </div>

          <!-- 资料库始终挂载，在收起态完成数据与首屏资源预热。 -->
          <div
            class="library-stage"
            :class="{ 'library-stage--visible': isLibraryContentVisible && !isDragging && !isDropping && currentPage === 'library' }"
          >
            <ZiliaokuPage
              :items="libraryItems"
              :category-counts="categoryCounts"
              :library-config="libraryConfig"
              :library-available="libraryAvailable"
              :initial-category="currentZiliaokuCategory"
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
            :cancel-text="confirmState.cancelText"
            :show-cancel="confirmState.showCancel"
            :tone="confirmState.tone"
            @confirm="querenAction"
            @cancel="guanbiConfirm"
          />
        </div>
        <div class="toast-layer">
          <ToastMessage
            :visible="toastState.visible && !isDragging && !isDropping"
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

const isStartupWindow = new URLSearchParams(window.location.search).get('startup') === '1'
const islandShell = useTemplateRef('islandShell')
const isStartingUp = shallowRef(isStartupWindow)
const isExpanded = shallowRef(false)
const isDragging = shallowRef(false)
const isDropping = shallowRef(false)
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
  if (isDragging.value || confirmState.value.visible) return
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
  if (isDropping.value || !baohanDragContent(event)) return
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
  if (isDropping.value || !baohanDragContent(event)) return
  event.preventDefault()
  isDropping.value = true
  isDragging.value = true
  const importPromise = daoruDragContent(event.dataTransfer)
  const animationDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 640
  await new Promise((resolve) => window.setTimeout(resolve, animationDuration))
  isDropping.value = false
  qingliDragState(true)

  const addedItems = await importPromise
  if (!addedItems.length) return

  await xuanzeLibraryCategory(addedItems[0].type ?? 'document')
  currentPage.value = 'library'
  isExpanded.value = false
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
    message: '当前资料库中的图片和文档将迁移到新目录。',
    detail: '系统会先复制并校验全部资源，确认迁移成功后才清理旧目录。\n迁移失败、文件冲突或目标目录不可用时，原资料库和文件不会被删除。\n迁移期间请勿关闭应用或手动修改新旧目录。',
    confirmText: '选择新目录',
    cancelText: '取消',
    showCancel: true,
    tone: 'default',
  }, () => xuanzeLibraryRootdir())
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
  height: 142px;
  border-color: rgba(99, 254, 19, .72);
  border-radius: 28px;
  box-shadow: 0 0 12px rgba(99, 254, 19, .18), inset 0 0 14px rgba(99, 254, 19, .06);
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
.lingdongchuangkou--drop .toast-layer { height: 142px; }

.lingdongchuangkou--expanded .island-frame--collapsed,
.lingdongchuangkou--drop .island-frame--collapsed { opacity: 0; transition-delay: 0s; }
.lingdongchuangkou--expanded .island-frame--expanded { opacity: 1; transition-delay: 260ms; }
.lingdongchuangkou--drop .island-frame--drop { opacity: 1; transition-delay: 170ms; }

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

/* 拖放态保持重构前的宽幅投放尺寸与银白轮廓。 */
.lingdongchuangkou--drop {
  pointer-events: none;
}

.lingdongchuangkou--drop .island-shell {
  clip-path: inset(0 calc((100% - min(520px, calc(100vw - 48px))) / 2) calc(100% - 142px) round 28px);
  pointer-events: auto;
  transition-duration: 300ms;
}

.lingdongchuangkou--drop .inner-glow {
  inset: 1px;
  border-radius: 27px;
}

.drop-hint {
  position: absolute;
  z-index: 2;
  top: 71px;
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
  width: 82px;
  height: 72px;
  perspective: 180px;
}

.drop-paste-target {
  position: absolute;
  z-index: 0;
  top: 11px;
  left: 16px;
  width: 50px;
  height: 50px;
  border: 1px dashed rgba(255, 255, 255, .22);
  border-radius: 13px;
  background: radial-gradient(circle, rgba(99, 254, 19, .08), transparent 65%);
  box-shadow: inset 0 0 16px rgba(99, 254, 19, .04);
  transform: rotate(-3deg);
}

.drop-token {
  position: absolute;
  z-index: 2;
  top: 8px;
  left: 21px;
  display: flex;
  width: 40px;
  height: 48px;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid rgba(99, 254, 19, .76);
  border-radius: 8px 8px 11px 11px;
  background: linear-gradient(145deg, rgba(244, 255, 237, .2), rgba(99, 254, 19, .07));
  box-shadow: inset 0 1px rgba(255, 255, 255, .2), 0 9px 22px rgba(0, 0, 0, .34), 0 0 18px rgba(99, 254, 19, .14);
  animation: drop-token-hover 1.35s ease-in-out infinite;
  transform-style: preserve-3d;
}

.drop-token::after {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 9px;
  height: 9px;
  border-bottom: 1px solid rgba(99, 254, 19, .5);
  border-left: 1px solid rgba(99, 254, 19, .5);
  background: rgba(9, 11, 10, .9);
  content: "";
  clip-path: polygon(100% 0, 100% 100%, 0 0);
}

.drop-token > i {
  display: block;
  width: 100%;
  height: 2px;
  border-radius: 2px;
  background: rgba(255, 255, 255, .52);
  box-shadow: 0 0 4px rgba(255, 255, 255, .08);
}

.drop-token > i:nth-child(2) { width: 76%; }
.drop-token > i:nth-child(3) { width: 48%; }

.drop-paste-ripple {
  position: absolute;
  z-index: 1;
  top: 35px;
  left: 50%;
  width: 42px;
  height: 24px;
  border: 1px solid var(--accent);
  border-radius: 50%;
  opacity: 0;
  transform: translate(-50%, -50%) scale(.35);
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
.lingdongchuangkou--dropping .drop-token { animation: drop-token-paste 640ms cubic-bezier(.16, 1, .3, 1) both; }
.lingdongchuangkou--dropping .drop-paste-target { animation: drop-target-stick 640ms var(--motion-easing) both; }
.lingdongchuangkou--dropping .drop-paste-ripple { animation: drop-paste-ripple 640ms ease-out both; }
.lingdongchuangkou--dropping .drop-label { animation: drop-label-confirm 640ms ease both; }

@keyframes drop-token-hover {
  0%, 100% { transform: translate3d(0, -4px, 16px) rotateX(-6deg) rotateZ(-3deg); }
  50% { transform: translate3d(0, 1px, 12px) rotateX(-2deg) rotateZ(2deg); }
}

@keyframes drop-token-paste {
  0% { transform: translate3d(-9px, -12px, 30px) rotateX(-18deg) rotateY(9deg) rotateZ(-9deg) scale(1.08); }
  42% { transform: translate3d(3px, 2px, 8px) rotateX(-4deg) rotateY(-2deg) rotateZ(3deg) scale(1.02); }
  58% { border-color: rgba(99, 254, 19, 1); box-shadow: inset 0 1px rgba(255, 255, 255, .24), 0 1px 3px rgba(0, 0, 0, .24), 0 0 28px rgba(99, 254, 19, .4); transform: translate3d(0, 5px, 0) rotateX(7deg) rotateZ(0) scaleX(1.08) scaleY(.9); }
  76% { transform: translate3d(0, 2px, 1px) rotateX(-2deg) scaleX(.98) scaleY(1.03); }
  100% { border-color: rgba(99, 254, 19, .86); box-shadow: inset 0 1px rgba(255, 255, 255, .2), 0 1px 2px rgba(0, 0, 0, .2), 0 0 16px rgba(99, 254, 19, .22); transform: translate3d(0, 3px, 0) rotateX(0) rotateZ(0) scale(1); }
}

@keyframes drop-target-stick {
  0%, 42% { border-color: rgba(255, 255, 255, .2); opacity: .7; transform: rotate(-3deg) scale(1); }
  58% { border-color: rgba(99, 254, 19, .9); opacity: 1; transform: rotate(0) scale(1.13); }
  100% { border-color: rgba(99, 254, 19, .22); opacity: .18; transform: rotate(0) scale(.96); }
}

@keyframes drop-paste-ripple {
  0%, 52% { opacity: 0; transform: translate(-50%, -50%) scale(.35); }
  58% { opacity: .9; }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(3.1); }
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
}
</style>
