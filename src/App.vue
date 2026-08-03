<template>
  <main class="root" @mousemove="gengxinMousePassthrough" @mouseleave="huifuMousePassthrough">
    <QidongOverlay v-if="isStartupWindow && isStartingUp" @complete="wanchengStartup" />

    <section
      v-if="!isStartupWindow"
      ref="islandHolder"
      class="lingdongchuangkou"
      :class="{ 'lingdongchuangkou--expanded': isExpanded, 'lingdongchuangkou--drop': isDragging }"
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
      @blur="qiehuanIslandState(false)"
    >
      <div class="inner-glow"></div>
      <ShouqiStatus :animation-id="currentCollapsedAnimation" :hidden="isExpanded" :dragging="isDragging" />

      <div class="drop-hint" aria-hidden="true">
        <span class="drop-plus">+</span>
        <span>{{ isImporting ? '正在归档' : '拖放归档' }}</span>
      </div>

      <!-- 资料库始终挂载，在收起态完成数据与首屏资源预热。 -->
      <div
        class="library-stage"
        :class="{ 'library-stage--visible': isLibraryContentVisible && !isDragging && currentPage === 'library' }"
      >
        <ZiliaokuPage
          :items="libraryItems"
          :category-counts="categoryCounts"
          :library-config="libraryConfig"
          :initial-category="currentZiliaokuCategory"
          :is-yingyong-syncing="isYingyongSyncing"
          :is-animation-busy="isExpansionAnimating"
          @open-settings="qiehuanSettings"
          @select-category="xuanzeZiliaokuCategory"
          @search="sousuoLibrary"
          @load-more="jiazaiGengduo"
          @open-item="dakaiLibraryItem"
          @locate-item="dingweiLibraryItem"
          @delete-item="qingqiuDeleteItem"
          @sync-applications="tongbuDesktopApplications"
        />
      </div>

      <Transition name="glass-switch" mode="out-in">
        <ShezhiPage
          v-if="isExpanded && !isDragging && currentPage === 'settings'"
          key="settings"
          :animation-id="currentCollapsedAnimation"
          :rootdir="libraryConfig.rootdir"
          @back="currentPage = 'library'"
          @select-animation="shezhiCollapsedAnimation"
          @select-rootdir="xuanzeLibraryRootdir"
        />
      </Transition>

      <ConfirmDialog
        :visible="confirmState.visible"
        :title="confirmState.title"
        :message="confirmState.message"
        :detail="confirmState.detail"
        :confirm-text="confirmState.confirmText"
        :cancel-text="confirmState.cancelText"
        :tone="confirmState.tone"
        @confirm="querenAction"
        @cancel="guanbiConfirm"
      />
      <ToastMessage :visible="toastState.visible" :text="toastState.text" :type="toastState.type" />
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
const islandHolder = useTemplateRef('islandHolder')
const isStartingUp = shallowRef(isStartupWindow)
const isExpanded = shallowRef(false)
const isDragging = shallowRef(false)
const currentPage = shallowRef('library')
const isLibraryContentVisible = shallowRef(false)
const isExpansionAnimating = shallowRef(false)
let isPassthrough = true
let libraryContentTimer = 0
let expansionAnimationTimer = 0

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
} = useZiliaokuLibrary(xianshiToast)

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
  window.clearTimeout(libraryContentTimer)
  window.clearTimeout(expansionAnimationTimer)
  isExpanded.value = expanded
  if (!expanded) {
    window.aetherDock?.setHeavyTasksPaused(false)
    isLibraryContentVisible.value = false
    isExpansionAnimating.value = false
    currentPage.value = 'library'
    return
  }

  isExpansionAnimating.value = true
  window.aetherDock?.setHeavyTasksPaused(true)
  // 外壳展开约六成后再显示内容，避免初始化与关键动画帧抢占主线程。
  libraryContentTimer = window.setTimeout(() => {
    if (isExpanded.value && currentPage.value === 'library') isLibraryContentVisible.value = true
  }, 280)
  expansionAnimationTimer = window.setTimeout(() => {
    isExpansionAnimating.value = false
    window.aetherDock?.setHeavyTasksPaused(false)
  }, 460)
}

// 切换设置时隐藏资料库内容，但保留其组件状态供返回时复用。
function qiehuanSettings() {
  isLibraryContentVisible.value = false
  currentPage.value = 'settings'
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
  if (!baohanDragContent(event)) return
  event.preventDefault()
  isDragging.value = true
  isExpanded.value = false
}

function chuliDragOver(event) {
  if (!baohanDragContent(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

function chuliDragLeave(event) {
  if (!isDragging.value) return
  const rect = islandHolder.value?.getBoundingClientRect()
  const stillInside = rect
    && event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom
  if (!stillInside) qingliDragState()
}

async function chuliDrop(event) {
  if (!baohanDragContent(event)) return
  event.preventDefault()
  qingliDragState()
  const addedItems = await daoruDragContent(event.dataTransfer)
  if (!addedItems.length) return

  await xuanzeLibraryCategory(addedItems[0].type ?? 'document')
  currentPage.value = 'library'
  isExpanded.value = false
}

// 记录用户选择的资料库 Tab，供下次展开时恢复。
function xuanzeZiliaokuCategory(category) {
  xuanzeLibraryCategory(category)
}

function qingliDragState() {
  isDragging.value = false
}

function qingqiuDeleteItem(item) {
  const isKuaijieShortcut = item.storageMode === 'shortcut'
  qingqiuConfirm({
    title: isKuaijieShortcut ? '移除程序' : '删除资料',
    message: isKuaijieShortcut ? '确定从程序列表移除？' : '确定删除该资料？',
    detail: isKuaijieShortcut
      ? `仅移除 AetherDock 记录，不会删除桌面快捷方式或目标程序。\n${item.title || ''}`.trim()
      : `将同时删除本地文件与资料库记录，此操作不可撤销。\n${item.title || ''}`.trim(),
    confirmText: isKuaijieShortcut ? '移除' : '删除',
    tone: isKuaijieShortcut ? 'default' : 'danger',
  }, () => shanchuLibraryItem(item))
}

function gengxinMousePassthrough(event) {
  const rect = islandHolder.value?.getBoundingClientRect()
  if (!rect) return
  const isOverIsland = event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom
  shezhiMousePassthrough(!isOverIsland)
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
  width: min(360px, calc(100vw - 52px));
  height: 60px;
  overflow: visible;
  border-radius: 0 0 30px 30px;
  cursor: default;
  isolation: isolate;
  transition: width 460ms var(--motion-easing), height 460ms var(--motion-easing), border-radius 380ms var(--motion-easing);
}

.lingdongchuangkou::after {
  position: absolute;
  z-index: 5;
  inset: 0;
  border: 1px solid transparent;
  border-bottom-color: rgba(255, 255, 255, .28);
  border-radius: inherit;
  box-shadow: 0 1px 3px rgba(255, 255, 255, .12);
  content: "";
  pointer-events: none;
  transition: border-color 300ms ease, box-shadow 300ms ease;
}

.lingdongchuangkou--expanded {
  width: min(680px, calc(100vw - 40px));
  height: 380px;
  border-radius: 20px;
}

.lingdongchuangkou--expanded::after {
  display: block;
  border: 1px solid var(--border-ink);
  border-radius: 20px;
  box-shadow: inset 0 1px rgba(255, 255, 255, .72), 0 12px 32px rgba(0, 0, 0, .18);
}

.library-stage {
  position: absolute;
  z-index: 2;
  inset: 0;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, 8px, 0);
  transition: opacity 180ms ease, transform 220ms var(--motion-easing), visibility 0s linear 220ms;
}

.library-stage--visible {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
  transform: translate3d(0, 0, 0);
  transition-delay: 0s;
}

.inner-glow {
  position: absolute;
  z-index: 0;
  inset: 0 0 1px;
  border-radius: 0 0 29px 29px;
  background: linear-gradient(180deg, rgba(24, 26, 25, .98), rgba(9, 11, 10, .99));
  transition: inset 380ms var(--motion-easing), border-radius 420ms var(--motion-easing);
}

.lingdongchuangkou--expanded .inner-glow {
  display: block;
  inset: 1px;
  border-radius: 18px;
  background: linear-gradient(155deg, rgba(255, 255, 255, .99), rgba(246, 246, 245, .98) 52%, rgba(239, 239, 236, .99));
  box-shadow: inset 0 1px rgba(255, 255, 255, .86), inset 0 -1px rgba(38, 38, 38, .08);
}

/* 拖放态保持重构前的宽幅投放尺寸与银白轮廓。 */
.lingdongchuangkou--drop {
  width: min(820px, calc(100vw - 40px));
  height: 180px;
  border-radius: 32px;
}

.lingdongchuangkou--drop::after {
  border-color: rgba(99, 254, 19, .72);
  box-shadow: 0 0 12px rgba(99, 254, 19, .18), inset 0 0 14px rgba(99, 254, 19, .06);
}

.lingdongchuangkou--drop .inner-glow {
  inset: 1px;
  border-radius: 31px;
}

.drop-hint {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  display: grid;
  justify-items: center;
  gap: 1px;
  color: var(--text-on-ink);
  font: 600 11px/1 var(--font-display);
  letter-spacing: .14em;
  opacity: 0;
  pointer-events: none;
  text-shadow: 0 0 12px rgba(99, 254, 19, .26);
  transform: translate(-50%, -50%) scale(.72);
  transition: opacity 160ms ease, transform 260ms var(--motion-easing);
}

.drop-plus {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid rgba(99, 254, 19, .7);
  border-radius: 50%;
  font: 300 23px/.8 var(--font-mono);
}

.lingdongchuangkou--drop .drop-hint {
  gap: 14px;
  font-size: 13px;
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.lingdongchuangkou--drop .drop-plus {
  width: 62px;
  height: 62px;
  border-color: var(--accent);
  box-shadow: 0 0 20px rgba(99, 254, 19, .2), inset 0 0 14px rgba(99, 254, 19, .08);
  font-size: 52px;
}

.glass-switch-enter-active { transition: opacity 240ms ease; }
.glass-switch-leave-active { transition: opacity 150ms ease; }
.glass-switch-enter-from,
.glass-switch-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .lingdongchuangkou,
  .inner-glow,
  .library-stage,
  .glass-switch-enter-active,
  .glass-switch-leave-active {
    transition-duration: 80ms;
  }
}
</style>
