<template>
  <section class="library-page" aria-label="资料库">
    <div class="library-status">
      <span class="library-connection" :class="libraryConfig.rootdir ? 'library-connection--normal' : 'library-connection--abnormal'">
        {{ libraryConfig.rootdir ? '资料库已连接' : '资料库未连接' }}
      </span>
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
          <small>{{ fenleiCounts[category.id] }} 项</small>
        </span>
        <i>{{ category.caption }}</i>
      </button>
    </nav>

    <section
      class="library-list"
      aria-label="资料库内容"
      :style="{ '--switch-direction': switchDirection }"
      @wheel.prevent="chuliShelfWheel"
    >
      <Transition name="data-switch" mode="out-in">
        <div
          v-if="currentItems.length"
          :key="currentCategory"
          class="library-shelf"
        >
          <article
            v-for="{ item, offset, index } in carouselCards"
            :key="item.id"
            class="library-shelf-card"
            :class="{
              'library-shelf-card--center': offset === 0,
              'library-shelf-card--missing': item.status === 'missing',
            }"
            :style="huoquCardStyle(offset)"
          >
            <button class="library-shelf-main" type="button" @click.stop="offset === 0 ? emit('open-item', item) : tiaozhuanCarousel(index)">
              <div class="library-shelf-view" aria-hidden="true">
                <img
                  v-if="huoquCardInfo(item, yulanFailedIds).preview"
                  class="library-shelf-preview"
                  :src="huoquCardInfo(item, yulanFailedIds).preview"
                  alt=""
                  draggable="false"
                  @error="biaojiPreviewFailed(item.id)"
                >
                <img
                  v-else
                  class="library-shelf-icon"
                  :src="huoquCardInfo(item, yulanFailedIds).icon"
                  alt=""
                  draggable="false"
                >
              </div>
              <span class="library-shelf-cover">
                <strong>{{ huoquCardName(item) }}</strong>
                <small>{{ geshiCardTime(item.createdAt) }}</small>
              </span>
            </button>
            <button
              v-if="item.storageMode !== 'bookmark'"
              class="library-shelf-action library-shelf-enter"
              type="button"
              aria-label="在文件夹中定位"
              @click.stop="emit('locate-item', item)"
            >
              <img :src="enterIcon" alt="" aria-hidden="true" draggable="false">
            </button>
            <button class="library-shelf-action library-shelf-delete" type="button" aria-label="删除" @click.stop="emit('delete-item', item)">
              <img :src="deleteIcon" alt="" aria-hidden="true" draggable="false">
            </button>
          </article>
        </div>
        <p v-else key="empty" class="library-empty">拖入文件或网址，即可在此处统一管理。</p>
      </Transition>
    </section>
  </section>
</template>

<script setup>
import { computed, reactive, shallowRef, watch } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import searchLensIcon from '@/assets/icons/sousuo-lens.svg'
import settingsIcon from '@/assets/icons/shezhi-orbit.svg'
import folderIcon from '@/assets/icons/wenjian-folder.svg'
import imageFolderIcon from '@/assets/icons/tupian-folder.svg'
import urlIcon from '@/assets/icons/wangzhi-link.svg'
import enterIcon from '@/assets/icons/enter.svg'
import deleteIcon from '@/assets/icons/delete.svg'
import { geshiCardTime, huoquCardInfo, huoquCardName } from '@/utils/ziliaokuItem'

const props = defineProps({
  items: { type: Array, default: () => [] },
  libraryConfig: { type: Object, default: () => ({ rootdir: '' }) },
  initialCategory: { type: String, default: 'document' },
})

const emit = defineEmits(['open-settings', 'open-item', 'locate-item', 'delete-item'])
const searchKeyword = shallowRef('')
const currentCategory = shallowRef(props.initialCategory)
const carouselIndex = shallowRef(0)
const switchDirection = shallowRef(1)
const yulanFailedIds = reactive(new Set())

const fenleiList = [
  { id: 'document', name: '文档', caption: 'DOC · PDF · TXT', icon: folderIcon },
  { id: 'image', name: '图片', caption: 'JPG · PNG · RAW', icon: imageFolderIcon },
  { id: 'url', name: '网址', caption: 'WEB · URL', icon: urlIcon },
]

const fenleiCounts = computed(() => Object.fromEntries(
  fenleiList.map(({ id }) => [id, props.items.filter((item) => item.type === id).length]),
))

const currentItems = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return props.items.filter((item) => {
    if (item.type !== currentCategory.value) return false
    if (!keyword) return true
    return [item.title, item.sourcePath, item.sourceUrl]
      .filter(Boolean)
      .some((text) => text.toLowerCase().includes(keyword))
  })
})

// 计算每张卡片相对中心位置的偏移。
const carouselCards = computed(() => currentItems.value.map((item, index) => {
  const offset = index - carouselIndex.value
  return { item, index, offset }
}))

watch(currentItems, () => { carouselIndex.value = 0 }, { flush: 'post' })

function xuanzeCategory(categoryId) {
  if (categoryId === currentCategory.value) return
  const currentIndex = fenleiList.findIndex(({ id }) => id === currentCategory.value)
  const nextIndex = fenleiList.findIndex(({ id }) => id === categoryId)
  switchDirection.value = nextIndex >= currentIndex ? 1 : -1
  currentCategory.value = categoryId
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

function chuliShelfWheel(event) {
  if (event.deltaY > 0) houyiCard()
  if (event.deltaY < 0) qianyiCard()
}

function huoquCardStyle(offset) {
  const distance = Math.abs(offset)
  const angle = offset === 0 ? 0 : (offset < 0 ? 1 : -1) * Math.min(32 + distance * 12, 62)
  return {
    transform: `translateX(calc(-50% + ${offset * 184}px)) translateZ(${-distance * 55}px) rotateY(${angle}deg) scale(${Math.max(1 - distance * .12, .72)})`,
    opacity: Math.max(1 - distance * .22, .45),
    zIndex: 10 - distance,
    pointerEvents: distance <= 2 ? 'auto' : 'none',
  }
}

function biaojiPreviewFailed(itemId) {
  yulanFailedIds.add(itemId)
}

onKeyStroke('ArrowLeft', (event) => { event.preventDefault(); qianyiCard() })
onKeyStroke('ArrowRight', (event) => { event.preventDefault(); houyiCard() })
</script>

<style scoped>
.library-page {
  position: absolute;
  z-index: 2;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
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
  color: rgba(202, 225, 232, .78);
  font: 10px "Microsoft YaHei UI", sans-serif;
  letter-spacing: .08em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, .82);
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

.library-connection--normal { color: rgba(132, 238, 184, .95); }
.library-connection--normal::before { background: #7be9ac; box-shadow: 0 0 7px rgba(106, 235, 167, .82); }
.library-connection--abnormal { color: rgba(255, 143, 143, .95); }
.library-connection--abnormal::before { background: #ff7777; box-shadow: 0 0 7px rgba(255, 109, 109, .76); }

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
  border: 1px solid rgba(232, 240, 241, .3);
  border-radius: 22px;
  background: linear-gradient(145deg, rgba(63, 74, 78, .62), rgba(17, 23, 26, .78));
  box-shadow: inset 0 1px rgba(250, 254, 254, .16), 0 7px 18px rgba(0, 0, 0, .16);
  pointer-events: auto;
  transform: translateX(-50%);
  -webkit-app-region: no-drag;
}

.expanded-search:focus-within { border-color: rgba(244, 250, 250, .68); box-shadow: inset 0 1px rgba(255, 255, 255, .25), 0 7px 18px rgba(0, 0, 0, .2); }
.expanded-search img { width: 28px; height: 28px; flex: 0 0 auto; filter: brightness(0) invert(1); -webkit-user-drag: none; user-select: none; }
.expanded-search input { width: 100%; border: 0; outline: 0; background: transparent; color: rgba(240, 251, 254, .95); font: 500 15px "Bahnschrift", "Segoe UI Variable Display", sans-serif; letter-spacing: .04em; }
.expanded-search input::placeholder { color: rgba(191, 218, 225, .58); }

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

.expanded-settings img { width: 30px; height: 30px; filter: brightness(0) invert(1); -webkit-user-drag: none; user-select: none; }
.expanded-settings:hover img { filter: brightness(0) invert(1); }

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
  border: 1px solid rgba(229, 244, 249, .08);
  border-radius: 18px;
  background: rgba(3, 8, 10, .2);
  box-shadow: inset 0 1px rgba(255, 255, 255, .04);
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
  color: rgba(240, 250, 251, .94);
  cursor: pointer;
  text-align: left;
  transition: background 220ms ease, border-color 220ms ease, box-shadow 220ms ease, transform 220ms var(--motion-easing);
  -webkit-app-region: no-drag;
}

.folder-card:hover { border-color: transparent; background: rgba(239, 251, 255, .05); transform: none; }
.folder-card--selected { border-color: rgba(238, 250, 255, .17); background: linear-gradient(145deg, rgba(236, 250, 255, .14), rgba(128, 174, 188, .06)); box-shadow: inset 0 1px rgba(255, 255, 255, .14), 0 3px 10px rgba(0, 0, 0, .18); transform: none; }
.folder-card--selected::after { position: absolute; bottom: 4px; left: 50%; width: 17px; height: 1px; background: rgba(237, 250, 255, .96); box-shadow: 0 0 6px rgba(231, 249, 255, .95); content: ""; transform: translateX(-50%); }
.folder-card img { width: 30px; height: 30px; margin: 0; filter: brightness(0) invert(1); opacity: .52; transform: scale(.94); transition: filter 220ms ease, opacity 220ms ease, transform 220ms var(--motion-easing); -webkit-user-drag: none; user-select: none; }
.folder-card--selected img { filter: brightness(0) invert(1) drop-shadow(0 0 5px rgba(239, 250, 255, .62)); opacity: 1; transform: scale(1); }
.folder-card span { display: none; }
.folder-card strong { font: 600 13px "Microsoft YaHei UI", sans-serif; }
.folder-card small { color: rgba(184, 207, 213, .55); font: 9px "Cascadia Code", monospace; }
.folder-card i { display: none; }

.library-list {
  position: absolute;
  z-index: 2;
  top: 154px;
  right: 30px;
  bottom: 28px;
  left: 30px;
  overflow: hidden auto;
  border-top: 1px solid rgba(229, 244, 249, .1);
  padding-top: 12px;
  -webkit-app-region: no-drag;
}

.library-shelf { position: relative; width: 100%; height: 100%; overflow: hidden; perspective: 820px; perspective-origin: 50% 58%; transform-style: preserve-3d; -webkit-app-region: no-drag; mask: linear-gradient(90deg, transparent 0, #000 7%, #000 93%, transparent 100%); }

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
  border: 1px solid rgba(144, 164, 178, .28);
  border-radius: 14px;
  background: linear-gradient(165deg, rgba(36, 46, 55, .95), rgba(15, 21, 27, .97) 58%, rgba(24, 32, 39, .94));
  box-shadow: inset 0 1px rgba(255, 255, 255, .06), 0 0 20px rgba(255, 255, 255, .24), 0 16px 26px rgba(0, 0, 0, .5);
  transform-style: preserve-3d;
  transform-origin: 50% 100%;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  will-change: transform, opacity;
  transition: transform 420ms var(--motion-easing), opacity 360ms ease, box-shadow 260ms ease, border-color 260ms ease;
}

.library-shelf-card--center { border-color: rgba(182, 202, 216, .56); box-shadow: inset 0 1px rgba(255, 255, 255, .08), inset 0 0 0 1px rgba(180, 202, 216, .08), 0 0 26px rgba(255, 255, 255, .34), 0 22px 38px rgba(0, 0, 0, .6); }
.library-shelf-card--missing { filter: grayscale(.8); }
.library-shelf-main { position: relative; z-index: 1; display: flex; width: 100%; height: 100%; flex-direction: column; align-items: center; justify-content: center; padding: 0; overflow: hidden; border: 0; border-radius: inherit; background: transparent; color: inherit; cursor: pointer; transform: translateZ(8px); transform-style: preserve-3d; -webkit-app-region: no-drag; }
.library-shelf-view { position: relative; display: flex; width: 100%; height: auto; min-height: auto; flex: none; align-items: center; justify-content: center; margin: 0; padding: 0; overflow: hidden; border: 0; background: transparent; }
.library-shelf-icon { position: relative; z-index: 2; width: 56px; height: 56px; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0, 0, 0, .55)); pointer-events: none; transform: translateZ(6px); }
.library-shelf-preview { position: relative; z-index: 2; width: 118px; height: 96px; flex: none; object-fit: cover; border-radius: 10px; filter: drop-shadow(0 3px 7px rgba(0, 0, 0, .6)); pointer-events: none; transform: translateZ(6px); }
.library-shelf-cover { display: flex; width: 100%; flex: none; flex-direction: column; align-items: center; justify-content: flex-start; gap: 7px; margin: 0; padding: 14px 12px 0; border: 0; background: transparent; text-align: center; }
.library-shelf-cover strong { overflow: hidden; width: 100%; color: rgba(250, 254, 255, 1); font: 600 12px/1.35 "Microsoft YaHei UI", sans-serif; letter-spacing: .02em; text-overflow: ellipsis; text-shadow: 0 1px 3px rgba(0, 0, 0, .9); white-space: nowrap; }
.library-shelf-cover small { overflow: hidden; width: 100%; color: rgba(176, 198, 210, .72); font: 9px/1.3 "Cascadia Code", monospace; letter-spacing: .04em; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0, 0, 0, .8); white-space: nowrap; }

.library-shelf-action {
  position: absolute;
  top: 10px;
  display: grid;
  z-index: 4;
  width: 20px;
  height: 20px;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transition: opacity 160ms ease, background 160ms ease, transform 160ms ease;
}

.library-shelf-enter { right: 10px; }
.library-shelf-delete { left: 10px; }
.library-shelf-action img { width: 17px; height: 17px; pointer-events: none; }
.library-shelf-enter img { filter: invert(92%) sepia(13%) saturate(632%) hue-rotate(146deg) brightness(102%) contrast(95%); }
.library-shelf-card--center:hover .library-shelf-action { opacity: 1; }
.library-shelf-action:hover { transform: scale(1.08); }
.library-shelf-delete:hover { color: rgba(248, 113, 113, 1); }

.library-shelf-card:hover { border-color: rgba(162, 182, 196, .42); box-shadow: inset 0 1px rgba(255, 255, 255, .07), 0 0 22px rgba(255, 255, 255, .28), 0 19px 32px rgba(0, 0, 0, .54); }
.library-shelf-card--center:hover { border-color: rgba(196, 214, 226, .62); box-shadow: inset 0 1px rgba(255, 255, 255, .09), inset 0 0 0 1px rgba(190, 212, 224, .1), 0 0 28px rgba(255, 255, 255, .4), 0 22px 38px rgba(0, 0, 0, .62); }

.library-empty { margin: 24px 0; color: rgba(247, 252, 253, .96); font: 12px "Microsoft YaHei UI", sans-serif; text-align: center; text-shadow: 0 1px 3px rgba(0, 0, 0, .88); }
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
