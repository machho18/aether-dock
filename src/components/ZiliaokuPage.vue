<template>
  <section ref="ziliaokuYemian" class="library-page" aria-label="资料库">
    <div class="library-status">
      <span
        class="library-connection"
        :class="libraryAvailable ? 'library-connection--normal' : 'library-connection--abnormal'"
      >{{ libraryAvailable ? '资料库已连接' : '资料库暂不可用' }}</span>
    </div>

    <section class="expanded-top" aria-label="窗口工具栏">
      <label class="expanded-search">
        <img :src="searchLensIcon" alt="" aria-hidden="true" draggable="false">
        <input v-model="searchKeyword" type="search" :placeholder="sousuoPlaceholder" :aria-label="sousuoPlaceholder">
      </label>
      <div class="expanded-actions">
        <button class="expanded-capture" type="button" aria-label="捕获剪贴板内容" title="捕获剪贴板内容" @click.stop="emit('capture-clipboard')">
          <img class="expanded-capture-icon" :src="clipboardIcon" alt="" aria-hidden="true" draggable="false">
        </button>
        <button class="expanded-clipboard" type="button" aria-label="打开剪贴板收集箱" title="打开剪贴板收集箱" @click.stop="emit('open-clipboard')">
          <img class="expanded-clipboard-icon" :src="collectionIcon" alt="" aria-hidden="true" draggable="false">
          <b v-if="props.clipboardCount">{{ props.clipboardCount }}</b>
        </button>
        <button class="expanded-assistant" type="button" aria-label="打开 AI 助手" title="打开 AI 助手" @click.stop="emit('open-assistant')">
          <PhSparkle class="expanded-assistant-icon" :size="15" weight="bold" />
        </button>
        <div ref="gengduoCaozuo" class="expanded-more-wrap">
          <button class="expanded-more" type="button" aria-label="更多操作" :aria-expanded="isGengduoVisible" @click.stop="qiehuanGengduo">
            <svg class="more-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="11" cy="17" r="2" /></svg>
          </button>
          <Transition name="more-menu">
            <div v-if="isGengduoVisible" class="expanded-more-menu" @click.stop>
              <button type="button" @click="kaishiPiliangShanchu">
                <span class="expanded-more-icon expanded-more-icon--select" aria-hidden="true"></span>
                <span>批量选择</span>
              </button>
              <button type="button" @click="qiehuanViewMode">
                <span class="expanded-more-icon" aria-hidden="true">▦</span>
                <span>切换为{{ xiaYiViewModeName }}</span>
              </button>
              <button type="button" @click="chuliGengduoCaozuo('open-settings')">
                <span class="expanded-more-icon" aria-hidden="true"><img :src="settingsIcon" alt="" draggable="false"></span>
                <span>设置</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
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
        <svg v-if="category.id === 'recent'" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="7.4" />
          <path d="M12 7.8v4.6l3.1 1.9" />
        </svg>
        <img v-else :src="category.icon" alt="" aria-hidden="true" draggable="false">
        <span>
          <strong>{{ category.name }}</strong>
          <small>{{ categoryCounts[category.id] }} 项</small>
        </span>
        <i>{{ category.caption }}</i>
      </button>
    </nav>

    <div v-if="isPiliangMoshi" class="piliang-actionbar" :class="{ 'piliang-actionbar--with-sort': viewMode !== 'shelf' }" aria-label="批量删除操作">
      <span class="piliang-selected-count"><b>{{ xuanzeItemIds.size }}</b> 已选</span>
      <button class="piliang-finish" type="button" @click="quxiaoPiliangShanchu">完成</button>
      <button v-if="xuanzeItemIds.size" class="piliang-delete" type="button" @click="tijiaoPiliangShanchu">删除</button>
    </div>

    <div v-if="viewMode !== 'shelf'" class="library-compact-tools" aria-label="资料浏览工具">
      <div ref="paixuCaozuo" class="library-sort-wrap">
        <button class="library-sort-trigger" type="button" aria-label="排序方式" aria-haspopup="menu" :aria-expanded="isPaixuVisible" @click.stop="qiehuanPaixu">
          <span>{{ currentPaixuOption.name }}</span>
          <i aria-hidden="true"></i>
        </button>
        <Transition name="more-menu">
          <div v-if="isPaixuVisible" class="library-sort-menu" role="menu" aria-label="排序方式" @click.stop>
            <button
              v-for="option in paixuOptions"
              :key="option.id"
              type="button"
              role="menuitemradio"
              :aria-checked="sortMode === option.id"
              :class="{ 'is-active': sortMode === option.id }"
              @click="xuanzePaixu(option.id)"
            >{{ option.name }}</button>
          </div>
        </Transition>
      </div>
    </div>

    <button
      v-if="viewMode === 'shelf' && currentCategory === 'application' && categoryCounts.application"
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
      @wheel="chuliShelfWheel"
    >
      <div class="library-shelf-aura" aria-hidden="true"></div>
      <div class="library-shelf-backdrop" aria-hidden="true"></div>
      <Transition name="data-switch" mode="out-in">
        <div
          v-if="viewMode === 'shelf' && currentItems.length"
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
                'library-shelf-card--selected': xuanzeItemIds.has(item.id),
                'library-shelf-card--menu-open': cardCaozuoItemId === item.id,
              },
            ]"
            :style="huoquCardStyle(offset)"
          >
            <button class="library-shelf-main" type="button" @click.stop="isPiliangMoshi ? qiehuanKapianXuanze(item) : offset === 0 ? emit('open-item', item) : tiaozhuanCarousel(index)">
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
                  :class="{
                    'box-border rounded-xl border border-white/80 bg-white p-2 shadow-lg': item.type === 'url',
                    'box-border rounded-xl border p-2 shadow-lg': item.type === 'document',
                    'border-white/80 bg-white': item.type === 'document',
                  }"
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
                  {{ huoquKapianFushuzifu(item) }}
                </small>
              </span>
            </button>
            <div v-if="offset === 0 && !isPiliangMoshi" class="library-shelf-more">
              <button
                class="library-shelf-more-trigger"
                type="button"
                aria-label="更多资料操作"
                :aria-expanded="cardCaozuoItemId === item.id"
                @click.stop="qiehuanCardCaozuo(item, $event)"
              ><svg class="card-more-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg></button>
            </div>
            <button v-if="isPiliangMoshi" class="library-shelf-select" type="button" :aria-pressed="xuanzeItemIds.has(item.id)" @click.stop="qiehuanKapianXuanze(item)">
              <span aria-hidden="true">✓</span>
              <span class="sr-only">{{ xuanzeItemIds.has(item.id) ? '取消选择' : '选择' }}</span>
            </button>
          </article>
        </div>
        <div v-else-if="compactItems.length" :key="`${currentCategory}-${viewMode}`" class="library-compact-view" :class="`library-compact-view--${viewMode}`" @click.self="guanbiCardCaozuo">
          <article
            v-for="{ item, cardInfo } in compactItems"
            :key="item.id"
            class="library-compact-card"
            :class="{
              'library-compact-card--missing': item.status !== 'ready',
              'library-compact-card--selectable': isPiliangMoshi,
              'library-compact-card--menu-open': cardCaozuoItemId === item.id,
            }"
          >
            <button class="library-compact-main" type="button" @click.stop="isPiliangMoshi ? qiehuanKapianXuanze(item) : emit('open-item', item)">
              <img v-if="cardInfo.preview" class="library-compact-icon library-compact-icon--preview" :src="cardInfo.preview" alt="" draggable="false" @error="biaojiPreviewFailed(item)">
              <img v-else-if="cardInfo.icon" class="library-compact-icon" :src="cardInfo.icon" alt="" draggable="false">
              <span
                v-else
                class="library-compact-icon library-compact-icon--empty"
                :class="{ 'library-compact-icon--pending': cardInfo.iconPending }"
              ></span>
              <span class="library-compact-copy">
                <strong>{{ huoquCardName(item) }}</strong>
                <small>{{ huoquKapianFushuzifu(item) }}</small>
              </span>
            </button>
            <div v-if="!isPiliangMoshi" class="library-compact-more">
              <button class="library-compact-more-trigger" type="button" aria-label="更多资料操作" :aria-expanded="cardCaozuoItemId === item.id" @click.stop="qiehuanCardCaozuo(item, $event)"><svg class="card-more-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg></button>
            </div>
            <button v-if="isPiliangMoshi" class="library-shelf-select" type="button" :aria-pressed="xuanzeItemIds.has(item.id)" @click.stop="qiehuanKapianXuanze(item)"><span aria-hidden="true">✓</span></button>
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
    <Teleport to="body">
      <Transition name="context-menu">
        <div v-if="cardCaozuoItem" class="library-context-layer" @pointerdown.self="guanbiCardCaozuo">
          <section ref="cardCaozuoCaidan" class="library-context-menu" :style="cardCaozuoPosition" role="menu" aria-label="资料操作" @pointerdown.stop @click.stop>
            <Transition :name="`context-stage-${cardCaozuoStageDirection}`" mode="out-in" @after-enter="shezhiCardCaozuoPosition">
              <div v-if="isCardGuanliVisible" key="manage" class="library-context-section">
                <div class="library-context-section-title">
                  <button type="button" aria-label="返回常用操作" title="返回常用操作" @click="guanbiCardGuanli">‹</button>
                  <strong>资料管理</strong>
                </div>
                <form v-if="renamingItemId === cardCaozuoItem.id" class="library-context-rename" @submit.prevent="tijiaoRename(cardCaozuoItem)">
                  <input v-model="renameValue" class="library-context-rename-input" maxlength="120" aria-label="新的资料名称" @keydown.esc.prevent="quxiaoCardRename">
                  <footer>
                    <button type="button" @click="quxiaoCardRename">取消</button>
                    <button class="library-context-rename-submit" type="submit">保存</button>
                  </footer>
                </form>
                <template v-else>
                  <button v-if="cardCaozuoItem.type !== 'application'" class="library-context-action" type="button" role="menuitem" @click="chuliCardCaozuo(cardCaozuoItem, 'rename')">重命名</button>
                  <button v-if="cardCaozuoItem.type !== 'application' && cardCaozuoItem.storageMode !== 'shortcut'" class="library-context-action" type="button" role="menuitem" @click="chuliCardCaozuo(cardCaozuoItem, 'share')">分享</button>
                  <button class="library-context-action library-context-action--danger" type="button" role="menuitem" @click="chuliCardCaozuo(cardCaozuoItem, 'delete')">删除</button>
                </template>
              </div>
              <div v-else key="primary" class="library-context-section">
                <button class="library-context-action" type="button" role="menuitem" @click="chuliCardCaozuo(cardCaozuoItem, 'detail')">查看详情</button>
                <button v-if="cardCaozuoItem.storageMode !== 'bookmark' && cardCaozuoItem.status !== 'shortcut_missing'" class="library-context-action" type="button" role="menuitem" @click="chuliCardCaozuo(cardCaozuoItem, 'locate')">在文件夹中显示</button>
                <button class="library-context-action library-context-action--manage" type="button" role="menuitem" @click="dakaiCardGuanli(cardCaozuoItem.id)"><span>管理资料</span><i aria-hidden="true">›</i></button>
              </div>
            </Transition>
          </section>
        </div>
      </Transition>
    </Teleport>
    <Transition name="library-detail">
      <aside
        v-if="isDetailVisible"
        ref="kuaishuYulanMianban"
        class="library-detail-panel"
        :class="{ 'library-detail-panel--brief': detailData?.preview.type === 'none' }"
        aria-label="资料详情"
        @click.stop
      >
        <header>
          <strong>{{ detailItem ? huoquCardName(detailItem) : '资料详情' }}</strong>
          <button type="button" aria-label="关闭详情" @click="guanbiKuaishuYulan">×</button>
        </header>
        <div v-if="isDetailLoading" class="library-detail-loading">正在准备预览…</div>
        <template v-else-if="detailData">
          <div class="library-detail-content">
            <div v-if="detailData.preview.type !== 'none'" class="library-detail-preview">
              <img v-if="detailData.preview.type === 'image'" :src="detailData.preview.content" alt="资料预览">
              <iframe v-else-if="detailData.preview.type === 'pdf'" :src="detailData.preview.content" title="PDF 预览"></iframe>
              <pre v-else-if="detailData.preview.type === 'text'">{{ detailData.preview.content }}</pre>
            </div>
            <dl v-if="detailMetaItems.length" class="library-detail-meta">
              <div v-for="item in detailMetaItems" :key="item.label"><dt>{{ item.label }}</dt><dd :title="item.value">{{ item.value }}</dd></div>
            </dl>
            <label class="library-detail-field">备注
              <textarea v-model="detailNotes" maxlength="2000" placeholder="添加备注，方便下次快速找到它"></textarea>
            </label>
            <p v-if="detailError" class="library-detail-error">{{ detailError }}</p>
          </div>
          <footer><button type="button" :disabled="isDetailSaving" @click="baocunKuaishuYulan">{{ isDetailSaving ? '保存中…' : '保存备注' }}</button></footer>
        </template>
      </aside>
    </Transition>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { PhSparkle } from '@phosphor-icons/vue'
import searchLensIcon from '@/assets/icons/sousuo-lens.svg'
import clipboardIcon from '@/assets/icons/jiantieban.svg'
import collectionIcon from '@/assets/icons/shoujixiang.svg'
import settingsIcon from '@/assets/icons/shezhi-orbit.svg'
import folderIcon from '@/assets/icons/wenjian-folder.svg'
import imageFolderIcon from '@/assets/icons/tupian-folder.svg'
import urlIcon from '@/assets/icons/wangzhi-link.svg'
import yingyongIcon from '@/assets/icons/yingyongchengxu.svg'
import { geshiCardTime, huoquApplicationStatus, huoquCardInfo, huoquCardName } from '@/utils/ziliaokuItem'

const props = defineProps({
  items: { type: Array, default: () => [] },
  categoryCounts: {
    type: Object,
    default: () => ({ recent: 0, document: 0, image: 0, url: 0, application: 0 }),
  },
  libraryConfig: { type: Object, default: () => ({ rootdir: '' }) },
  libraryAvailable: { type: Boolean, default: false },
  initialCategory: { type: String, default: 'recent' },
  focusItemId: { type: String, default: '' },
  isYingyongSyncing: { type: Boolean, default: false },
  isAnimationBusy: { type: Boolean, default: false },
  isIslandExpanded: { type: Boolean, default: false },
  clipboardCount: { type: Number, default: 0 },
})

const emit = defineEmits(['open-settings', 'open-assistant', 'capture-clipboard', 'open-clipboard', 'select-category', 'refresh-library', 'search', 'load-more', 'open-item', 'locate-item', 'share-item', 'rename-item', 'delete-item', 'delete-items', 'sync-applications', 'show-toast'])
const gengduoCaozuo = useTemplateRef('gengduoCaozuo')
const paixuCaozuo = useTemplateRef('paixuCaozuo')
const cardCaozuoCaidan = useTemplateRef('cardCaozuoCaidan')
const kuaishuYulanMianban = useTemplateRef('kuaishuYulanMianban')
const ziliaokuYemian = useTemplateRef('ziliaokuYemian')
const searchKeyword = shallowRef('')
const isGengduoVisible = shallowRef(false)
const isPiliangMoshi = shallowRef(false)
const viewMode = shallowRef('shelf')
const sortMode = shallowRef('default')
const isPaixuVisible = shallowRef(false)
const isDetailVisible = shallowRef(false)
const isDetailLoading = shallowRef(false)
const detailItem = shallowRef(null)
const detailData = shallowRef(null)
const detailNotes = shallowRef('')
const isDetailSaving = shallowRef(false)
const detailError = shallowRef('')
const xuanzeItemIds = shallowRef(new Set())
const cardCaozuoItemId = shallowRef('')
const cardCaozuoItem = shallowRef(null)
const cardCaozuoPosition = shallowRef({ left: '12px', top: '12px' })
const cardCaozuoStageDirection = shallowRef('forward')
const isCardGuanliVisible = shallowRef(false)
// 所有菜单层级复用二级菜单高度作为定位基准，切换内容时保持位置稳定。
const cardCaozuoAnchorHeight = 148
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
const tupianThumbnailPendingItems = new Map()
const tupianThumbnailRetryCountMap = new Map()
const tupianThumbnailRetryRequestMap = new Map()
const tupianThumbnailRetryTimers = new Map()
let tupianThumbnailRenwu = 0
let tupianThumbnailIdleTaskId = 0
let isTupianThumbnailRequesting = false
let isUnmounted = false
let cardCaozuoTrigger = null

const fenleiList = [
  { id: 'document', name: '文档', caption: 'DOC · PDF · TXT', icon: folderIcon },
  { id: 'image', name: '图片', caption: 'JPG · PNG · RAW', icon: imageFolderIcon },
  { id: 'url', name: '网址', caption: 'WEB · URL', icon: urlIcon },
  { id: 'application', name: '应用程序', caption: 'APP · EXE', icon: yingyongIcon },
  { id: 'recent', name: '最近', caption: '最近打开' },
]
const keyongCategoryIds = new Set(fenleiList.map(({ id }) => id))
const viewModeList = [
  { id: 'shelf', name: '书架' },
  { id: 'grid', name: '网格' },
  { id: 'list', name: '列表' },
]
const paixuOptions = [
  { id: 'default', name: '默认排序' },
  { id: 'updated', name: '更新时间' },
  { id: 'name', name: '名称' },
]

const xiaYiViewModeName = computed(() => {
  const currentIndex = viewModeList.findIndex(({ id }) => id === viewMode.value)
  return viewModeList[(currentIndex + 1) % viewModeList.length].name
})
const currentPaixuOption = computed(() => paixuOptions.find(({ id }) => id === sortMode.value) ?? paixuOptions[0])
const detailMetaItems = computed(() => {
  const detail = detailData.value
  if (!detail) return []

  const items = []
  if (detail.source) items.push({ label: '来源', value: detail.source })
  if (Number(detail.byteSize) > 0 && !['url', 'application'].includes(detail.type)) {
    items.push({ label: '大小', value: geshiZiyuanSize(detail.byteSize) })
  }
  if (detail.status && detail.status !== 'ready') items.push({ label: '状态', value: '需要处理' })
  return items
})

// 提示搜索仅作用于当前分类，避免用户误以为会跨分类查询。
const sousuoPlaceholder = computed(() => {
  const fenleiName = fenleiList.find(({ id }) => id === currentCategory.value)?.name ?? '内容'
  return `搜索${fenleiName}`
})

// 根据当前分类生成更明确的空状态提示。
const kongzhuangtaiWenAn = computed(() => {
  const currentFenlei = fenleiList.find(({ id }) => id === currentCategory.value)
  const fenleiName = currentFenlei?.name ?? '内容'

  if (searchKeyword.value.trim()) return `未找到匹配的${fenleiName}`

  const kongzhuangtaiMap = {
    recent: '打开资料后，会在这里显示',
    document: '暂无文档，拖入文件即可开始整理',
    image: '暂无图片，拖入图片即可开始整理',
    url: '暂无网址，拖入链接即可开始整理',
  }
  return kongzhuangtaiMap[currentCategory.value] ?? `暂无${fenleiName}`
})

const currentItems = computed(() => {
  const shituItems = currentCategory.value === 'recent'
      ? props.items.filter((item) => Number(item.lastOpenedAt) > 0)
      : props.items
  if (sortMode.value === 'default') return shituItems
  return [...shituItems].sort((firstItem, secondItem) => {
    if (sortMode.value === 'name') return huoquCardName(firstItem).localeCompare(huoquCardName(secondItem), 'zh-CN')
    return Number(secondItem.updatedAt ?? 0) - Number(firstItem.updatedAt ?? 0)
  })
})

const compactItems = computed(() => currentItems.value.map((item) => ({
  item,
  cardInfo: huoquJianyaoCardInfo(item),
})))

function huoquKapianFushuzifu(item) {
  if (currentCategory.value === 'recent') {
    if (item.lastOpenedAt) return `${item.openCount || 0} 次 · ${geshiCardTime(item.lastOpenedAt)}`
    return '刚刚打开'
  }
  return item.type === 'application' ? huoquApplicationStatus(item) : geshiCardTime(item.updatedAt || item.createdAt)
}

function huoquJianyaoCardInfo(item) {
  return huoquCardInfo({
    ...item,
    yingyongIcon: yingyongIconMap.value[item.id] || '',
    wangzhiIcon: wangzhiIconMap.value[item.id] || '',
    thumbnailKey: tupianThumbnailMap.value[item.id] || '',
  }, yulanFailedKeys)
}

function panduanYingyongIconUrl(url) {
  try {
    const iconUrl = new URL(url)
    return iconUrl.protocol === 'aetherdock-icon:' && /^[a-f\d]{64}$/i.test(iconUrl.hostname)
  } catch {
    return false
  }
}

function geshiZiyuanSize(byteSize) {
  const size = Number(byteSize ?? 0)
  if (!size) return '未知'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

async function kaishiKuaishuYulan(item) {
  isDetailVisible.value = true
  isDetailLoading.value = true
  detailItem.value = item
  detailData.value = null
  detailError.value = ''
  try {
    const result = await window.aetherDock?.getLibraryItemDetails(item.id)
    if (!result?.chenggong || !result.detail) throw new Error(result?.xiaoxi || '资料详情读取失败')
    detailData.value = result.detail
    detailNotes.value = result.detail.notes || ''
  } catch (error) {
    detailError.value = error?.message || '资料详情读取失败'
  } finally {
    isDetailLoading.value = false
  }
}

function guanbiKuaishuYulan() {
  isDetailVisible.value = false
  detailItem.value = null
  detailData.value = null
  detailError.value = ''
}

async function baocunKuaishuYulan() {
  if (!detailItem.value || isDetailSaving.value) return
  isDetailSaving.value = true
  detailError.value = ''
  try {
    const notesResult = await window.aetherDock?.updateLibraryItemNotes(detailItem.value.id, detailNotes.value)
    if (!notesResult?.chenggong) {
      throw new Error('资料整理信息保存失败')
    }
    detailData.value = {
      ...detailData.value,
      notes: notesResult.notes,
    }
    // 备注不参与卡片列表渲染，保存后仅回写详情，避免重拉分页与缩略图。
    emit('show-toast', '备注已保存', 'success')
  } catch (error) {
    detailError.value = error?.message || '资料整理信息保存失败'
    emit('show-toast', detailError.value, 'error')
  } finally {
    isDetailSaving.value = false
  }
}

const keshikapianRange = 4

function guolvCurrentItemRecord(record, items = currentItems.value) {
  const nextRecord = {}
  for (const { id } of items) {
    if (Object.hasOwn(record, id)) nextRecord[id] = record[id]
  }
  return nextRecord
}

// 合并媒体结果时只保留当前分页窗口，避免长时间浏览后内存与对象复制成本持续增长。
function hebingCurrentItemRecord(currentRecord, addedRecord) {
  const nextRecord = {}
  for (const { id } of currentItems.value) {
    if (Object.hasOwn(addedRecord, id)) nextRecord[id] = addedRecord[id]
    else if (Object.hasOwn(currentRecord, id)) nextRecord[id] = currentRecord[id]
  }
  return nextRecord
}

function caijianItemCollection(itemCollection, retainedIds) {
  for (const itemId of itemCollection.keys()) {
    if (!retainedIds.has(itemId)) itemCollection.delete(itemId)
  }
}

function caijianMediaState(items) {
  const retainedIds = new Set(items.map(({ id }) => id))

  // 仅裁剪当前分类的媒体状态，避免切换分类时丢失已解析的图标。
  if (['application', 'recent'].includes(currentCategory.value)) {
    yingyongIconMap.value = guolvCurrentItemRecord(yingyongIconMap.value, items)
    yingyongIconRequestKeyMap.value = guolvCurrentItemRecord(yingyongIconRequestKeyMap.value, items)
  }
  if (['url', 'recent'].includes(currentCategory.value)) {
    wangzhiIconMap.value = guolvCurrentItemRecord(wangzhiIconMap.value, items)
    wangzhiIconRequestKeyMap.value = guolvCurrentItemRecord(wangzhiIconRequestKeyMap.value, items)
    caijianItemCollection(wangzhiIconFailedIds, retainedIds)
    caijianItemCollection(wangzhiIconRecoveryIds, retainedIds)
  }
  if (['image', 'recent'].includes(currentCategory.value)) {
    tupianThumbnailMap.value = guolvCurrentItemRecord(tupianThumbnailMap.value, items)
    tupianThumbnailRequestKeyMap.value = guolvCurrentItemRecord(tupianThumbnailRequestKeyMap.value, items)
    caijianItemCollection(yulanFailedKeys, retainedIds)
    caijianItemCollection(yulanRecoveryIds, retainedIds)

    for (const [requestKey, itemId] of tupianThumbnailRetryRequestMap) {
      if (retainedIds.has(itemId)) continue
      tupianThumbnailRetryRequestMap.delete(requestKey)
      tupianThumbnailRetryCountMap.delete(requestKey)
    }
    for (const [timerId, requestKeys] of tupianThumbnailRetryTimers) {
      if (Object.keys(requestKeys).some((itemId) => retainedIds.has(itemId))) continue
      window.clearTimeout(timerId)
      tupianThumbnailRetryTimers.delete(timerId)
      yiChuTupianThumbnailRetryRequest(requestKeys)
    }
  }

  if (isPiliangMoshi.value && xuanzeItemIds.value.size) {
    const nextSelectedIds = new Set([...xuanzeItemIds.value].filter((itemId) => retainedIds.has(itemId)))
    if (nextSelectedIds.size !== xuanzeItemIds.value.size) xuanzeItemIds.value = nextSelectedIds
  }
}

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
    const iconRequestKey = item.iconCacheKey || item.id
    const mappedIcon = yingyongIconMap.value[item.id]
    // 主进程会按最新快捷方式指纹重建缓存，返回地址可能比当前列表的旧键更新。
    const validMappedIcon = mappedIcon
      && yingyongIconRequestKeyMap.value[item.id] === iconRequestKey
      && panduanYingyongIconUrl(mappedIcon)
      ? mappedIcon
      : ''
    const mappedWebsiteIcon = wangzhiIconMap.value[item.id]
    const websiteIconFailed = wangzhiIconFailedIds.has(item.id)
    const validMappedWebsiteIcon = !websiteIconFailed
      && mappedWebsiteIcon
      && wangzhiIconRequestKeyMap.value[item.id] === iconRequestKey
      && (!item.iconCacheKey || mappedWebsiteIcon.includes(item.iconCacheKey))
      ? mappedWebsiteIcon
      : ''
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
  const sourceChangedIds = []
  for (const item of items) {
    const previousItem = previousById.get(item.id)
    if (!previousItem) continue
    const sourceChanged = previousItem.libraryId !== item.libraryId
      || previousItem.updatedAt !== item.updatedAt
      || previousItem.status !== item.status
      || previousItem.thumbnailCacheKey !== item.thumbnailCacheKey
    if (!sourceChanged) continue
    sourceChangedIds.push(item.id)
    yulanFailedKeys.delete(item.id)
    yulanRecoveryIds.delete(item.id)
  }
  if (sourceChangedIds.length) {
    tupianThumbnailRenwu += 1
    quxiaoTupianThumbnailIdleTask()
    const nextThumbnailMap = { ...tupianThumbnailMap.value }
    const nextRequestKeyMap = { ...tupianThumbnailRequestKeyMap.value }
    for (const itemId of sourceChangedIds) {
      delete nextThumbnailMap[itemId]
      delete nextRequestKeyMap[itemId]
    }
    tupianThumbnailMap.value = nextThumbnailMap
    tupianThumbnailRequestKeyMap.value = nextRequestKeyMap
  }
  caijianMediaState(items)
  const currentId = previousItems[carouselIndex.value]?.id
  const preservedIndex = currentId ? items.findIndex(({ id }) => id === currentId) : -1
  carouselIndex.value = preservedIndex >= 0 ? preservedIndex : Math.min(carouselIndex.value, Math.max(items.length - 1, 0))
}, { flush: 'post' })

// 新导入资源到达后优先置中，方便用户立即确认归档结果。
watch(() => props.focusItemId, (itemId) => {
  if (!itemId) return
  const itemIndex = currentItems.value.findIndex(({ id }) => id === itemId)
  if (itemIndex >= 0) carouselIndex.value = itemIndex
}, { flush: 'post' })

watch([carouselIndex, () => currentItems.value.length], ([index, length]) => {
  if (!length) return
  if (index <= 6) emit('load-more', 'previous')
  if (length - index <= 7) emit('load-more', 'next')
}, { flush: 'post' })

let searchTimer = 0
onClickOutside(gengduoCaozuo, () => {
  isGengduoVisible.value = false
})
onClickOutside(paixuCaozuo, () => {
  isPaixuVisible.value = false
})
// 详情面板点击外部即关闭，和其他悬浮菜单保持一致的退出方式。
onClickOutside(kuaishuYulanMianban, () => {
  if (isDetailVisible.value) guanbiKuaishuYulan()
})

function qiehuanGengduo() {
  isGengduoVisible.value = !isGengduoVisible.value
}

function chuliGengduoCaozuo(action) {
  isGengduoVisible.value = false
  emit(action)
}

// 卡片操作统一由独立浮层承载，避免不同视图改变卡片尺寸与信息层级。
function qiehuanCardCaozuo(item, event) {
  const isCurrentItem = cardCaozuoItemId.value === item.id
  if (isCurrentItem) {
    guanbiCardCaozuo()
    return
  }
  cardCaozuoItemId.value = item.id
  cardCaozuoItem.value = item
  cardCaozuoTrigger = event?.currentTarget ?? null
  isCardGuanliVisible.value = false
  cardCaozuoStageDirection.value = 'forward'
  quxiaoCardRename()
  shezhiCardCaozuoPosition()
}

function guanbiCardCaozuo() {
  cardCaozuoItemId.value = ''
  cardCaozuoItem.value = null
  cardCaozuoTrigger = null
  isCardGuanliVisible.value = false
  quxiaoCardRename()
}

function dakaiCardGuanli(itemId) {
  cardCaozuoItemId.value = itemId
  cardCaozuoStageDirection.value = 'forward'
  isCardGuanliVisible.value = true
  shezhiCardCaozuoPosition()
}

function guanbiCardGuanli() {
  cardCaozuoStageDirection.value = 'backward'
  isCardGuanliVisible.value = false
  quxiaoCardRename()
  shezhiCardCaozuoPosition()
}

function chuliCardCaozuo(item, action) {
  if (action === 'rename') return kaishiCardRename(item)
  guanbiCardCaozuo()
  if (action === 'detail') return kaishiKuaishuYulan(item)
  if (action === 'open') return emit('open-item', item)
  if (action === 'locate') return emit('locate-item', item)
  if (action === 'share') return emit('share-item', item)
  if (action === 'delete') emit('delete-item', item)
}

function kaishiCardRename(item) {
  renamingItemId.value = item.id
  renameValue.value = item.title || ''
  shezhiCardCaozuoPosition()
  nextTick(() => {
    const input = document.querySelector('.library-context-rename-input')
    input?.focus()
    input?.select()
  })
}

function quxiaoCardRename() {
  quxiaoRename()
}

// 以资料库面板的可见边界定位，避免透明窗口画布裁切菜单。
function shezhiCardCaozuoPosition() {
  const triggerRect = cardCaozuoTrigger?.getBoundingClientRect()
  if (!triggerRect) return

  const gap = 10
  const viewportGap = 10
  const pageRect = ziliaokuYemian.value?.getBoundingClientRect()
  const visibleLeft = (pageRect?.left ?? 0) + viewportGap
  const visibleTop = (pageRect?.top ?? 0) + viewportGap
  const visibleRight = (pageRect?.right ?? window.innerWidth) - viewportGap
  const visibleBottom = (pageRect?.bottom ?? window.innerHeight) - viewportGap
  const maxMenuWidth = Math.max(visibleRight - visibleLeft, 0)
  const maxMenuHeight = Math.max(visibleBottom - visibleTop, 0)
  const menuRect = cardCaozuoCaidan.value?.getBoundingClientRect()
  const menuWidth = Math.min(menuRect?.width ?? 184, maxMenuWidth)
  const menuHeight = Math.min(Math.max(menuRect?.height ?? 0, cardCaozuoAnchorHeight), maxMenuHeight)

  let left = triggerRect.right + gap
  let top = triggerRect.top - 6

  if (left + menuWidth > visibleRight) left = triggerRect.left - menuWidth - gap
  if (left < visibleLeft) {
    left = Math.max(visibleLeft, Math.min(triggerRect.right - menuWidth, visibleRight - menuWidth))
    top = triggerRect.bottom + gap
  }

  cardCaozuoPosition.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(Math.max(visibleTop, Math.min(top, visibleBottom - menuHeight)))}px`,
  }
}

watch([cardCaozuoItem, isCardGuanliVisible, renamingItemId], () => {
  nextTick(shezhiCardCaozuoPosition)
}, { flush: 'post' })

// 菜单在动画和表单切换后高度会变化，实时校正位置以保证完整显示。
watch(cardCaozuoCaidan, (menuElement, _, onCleanup) => {
  if (!menuElement) return
  const positionObserver = new ResizeObserver(shezhiCardCaozuoPosition)
  positionObserver.observe(menuElement)
  onCleanup(() => positionObserver.disconnect())
})

function kaishiPiliangShanchu() {
  isGengduoVisible.value = false
  guanbiCardCaozuo()
  isPiliangMoshi.value = true
  xuanzeItemIds.value = new Set()
}

// 以单一入口轮换浏览方式，避免将低频选项堆进更多菜单。
function qiehuanViewMode() {
  const currentIndex = viewModeList.findIndex(({ id }) => id === viewMode.value)
  viewMode.value = viewModeList[(currentIndex + 1) % viewModeList.length].id
  isGengduoVisible.value = false
  isPaixuVisible.value = false
  guanbiCardCaozuo()
}

function qiehuanPaixu() {
  isPaixuVisible.value = !isPaixuVisible.value
}

function xuanzePaixu(mode) {
  sortMode.value = mode
  isPaixuVisible.value = false
}

function quxiaoPiliangShanchu() {
  isPiliangMoshi.value = false
  xuanzeItemIds.value = new Set()
  guanbiCardCaozuo()
}

function qiehuanKapianXuanze(item) {
  const nextIds = new Set(xuanzeItemIds.value)
  if (nextIds.has(item.id)) nextIds.delete(item.id)
  else nextIds.add(item.id)
  xuanzeItemIds.value = nextIds
}

function tijiaoPiliangShanchu() {
  const items = currentItems.value.filter((item) => xuanzeItemIds.value.has(item.id))
  if (!items.length) return
  emit('delete-items', items)
  quxiaoPiliangShanchu()
}

// 灵动岛收起后组件仍会保留预热，此时主动关闭浮层以免残留在透明窗口中。
watch(() => props.isIslandExpanded, (expanded) => {
  if (!expanded) {
    isGengduoVisible.value = false
    isPaixuVisible.value = false
    guanbiCardCaozuo()
  }
})

watch(searchKeyword, (keyword) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => emit('search', keyword), 180)
})

// 图标请求保持“单个空闲任务 + 单个在途批次”，快速滚动只更新下一批内容。
function chuangjianIconIdleCoordinator(isCategoryActive, requestKeyRef, requestIcons, applyIcons) {
  const pendingItems = new Map()
  let idleTaskId = 0
  let retryTimerId = 0
  let retryRequestKeys = {}
  let isRequesting = false
  let activeRequestKeys = {}
  let renwuGeneration = 0

  function qingliRequestKeys(requestKeys, preservePending = false) {
    const nextRequestKeyMap = { ...requestKeyRef.value }
    let hasChanged = false
    for (const [itemId, requestKey] of Object.entries(requestKeys)) {
      if (preservePending && pendingItems.get(itemId)?.requestKey === requestKey) continue
      if (nextRequestKeyMap[itemId] !== requestKey) continue
      delete nextRequestKeyMap[itemId]
      hasChanged = true
    }
    if (hasChanged) requestKeyRef.value = guolvCurrentItemRecord(nextRequestKeyMap)
  }

  function quxiaoIdleTask() {
    if (!idleTaskId) return
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleTaskId)
    else window.clearTimeout(idleTaskId)
    idleTaskId = 0
  }

  function quxiao() {
    renwuGeneration += 1
    quxiaoIdleTask()
    const requestKeys = Object.assign({}, retryRequestKeys, Object.fromEntries(
      [...pendingItems.values()].map((task) => [task.item.id, task.requestKey]),
    ))
    window.clearTimeout(retryTimerId)
    retryTimerId = 0
    retryRequestKeys = {}
    pendingItems.clear()
    qingliRequestKeys(requestKeys)
  }

  function anpaiRetry(requestKeys) {
    retryRequestKeys = hebingCurrentItemRecord(retryRequestKeys, requestKeys)
    if (retryTimerId) return
    retryTimerId = window.setTimeout(() => {
      retryTimerId = 0
      const currentRetryRequestKeys = retryRequestKeys
      retryRequestKeys = {}
      qingliRequestKeys(currentRetryRequestKeys)
    }, 30 * 1000)
  }

  function yiChuRetryRequestKeys(requestKeys) {
    const nextRetryRequestKeys = { ...retryRequestKeys }
    for (const [itemId, requestKey] of Object.entries(requestKeys)) {
      if (nextRetryRequestKeys[itemId] === requestKey) delete nextRetryRequestKeys[itemId]
    }
    retryRequestKeys = nextRetryRequestKeys
    if (!Object.keys(retryRequestKeys).length && retryTimerId) {
      window.clearTimeout(retryTimerId)
      retryTimerId = 0
    }
  }

  function anpai() {
    if (idleTaskId || isRequesting || !pendingItems.size) return
    const renwuId = renwuGeneration
    const duquIcons = async () => {
      idleTaskId = 0
      if (isUnmounted || renwuId !== renwuGeneration || !isCategoryActive(currentCategory.value) || props.isAnimationBusy) {
        quxiao()
        return
      }

      const tasks = [...pendingItems.values()]
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 12)
      for (const task of tasks) pendingItems.delete(task.item.id)
      const requestKeys = Object.fromEntries(tasks.map((task) => [task.item.id, task.requestKey]))
      activeRequestKeys = requestKeys
      isRequesting = true
      try {
        const iconMap = await requestIcons(tasks.map(({ item }) => item.id))
        const isStale = isUnmounted || renwuId !== renwuGeneration
          || !isCategoryActive(currentCategory.value) || props.isAnimationBusy
        if (isStale) {
          if (iconMap) yiChuRetryRequestKeys(requestKeys)
          qingliRequestKeys(requestKeys, true)
          return
        }
        if (!iconMap) {
          anpaiRetry(requestKeys)
          return
        }
        yiChuRetryRequestKeys(requestKeys)
        applyIcons(iconMap)
      } catch {
        if (isUnmounted || renwuId !== renwuGeneration || !isCategoryActive(currentCategory.value) || props.isAnimationBusy) {
          qingliRequestKeys(requestKeys, true)
        } else {
          anpaiRetry(requestKeys)
        }
      } finally {
        activeRequestKeys = {}
        isRequesting = false
        anpai()
      }
    }

    if ('requestIdleCallback' in window) idleTaskId = window.requestIdleCallback(duquIcons, { timeout: 1000 })
    else idleTaskId = window.setTimeout(duquIcons, 120)
  }

  function tongbu(tasks) {
    const retainedIds = new Set(tasks.map(({ item }) => item.id))
    const staleRequestKeys = {}
    for (const [itemId, task] of pendingItems) {
      if (retainedIds.has(itemId)) continue
      pendingItems.delete(itemId)
      staleRequestKeys[itemId] = task.requestKey
    }
    qingliRequestKeys(staleRequestKeys)

    const requestKeys = {}
    for (const task of tasks) {
      const itemId = task.item.id
      const pendingTask = pendingItems.get(itemId)
      if (pendingTask?.requestKey === task.requestKey) {
        pendingItems.set(itemId, task)
        continue
      }
      if (activeRequestKeys[itemId] === task.requestKey || requestKeyRef.value[itemId] === task.requestKey) continue
      pendingItems.set(task.item.id, task)
      requestKeys[itemId] = task.requestKey
    }
    if (Object.keys(requestKeys).length) {
      requestKeyRef.value = hebingCurrentItemRecord(requestKeyRef.value, requestKeys)
    }
    if (!pendingItems.size) quxiaoIdleTask()
    else anpai()
  }

  return { quxiao, tongbu }
}

const yingyongIconCoordinator = chuangjianIconIdleCoordinator(
  (category) => ['application', 'recent'].includes(category),
  yingyongIconRequestKeyMap,
  (itemIds) => window.aetherDock?.getApplicationIcons(itemIds),
  (iconMap) => {
    yingyongIconMap.value = { ...yingyongIconMap.value, ...iconMap }
  },
)

const wangzhiIconCoordinator = chuangjianIconIdleCoordinator(
  (category) => ['url', 'recent'].includes(category),
  wangzhiIconRequestKeyMap,
  (itemIds) => window.aetherDock?.getWebsiteIcons(itemIds),
  (iconMap) => {
    wangzhiIconMap.value = { ...wangzhiIconMap.value, ...iconMap }
    for (const [itemId, icon] of Object.entries(iconMap)) {
      if (icon) wangzhiIconFailedIds.delete(itemId)
    }
  },
)

onBeforeUnmount(() => {
  isUnmounted = true
  tupianThumbnailRenwu += 1
  window.clearTimeout(searchTimer)
  yingyongIconCoordinator.quxiao()
  wangzhiIconCoordinator.quxiao()
  quxiaoTupianThumbnailIdleTask()
})

watch(() => props.initialCategory, (category) => {
  if (keyongCategoryIds.has(category)) {
    guanbiKuaishuYulan()
    guanbiCardCaozuo()
    currentCategory.value = category
    carouselIndex.value = 0
    tupianThumbnailRenwu += 1
    yingyongIconCoordinator.quxiao()
    wangzhiIconCoordinator.quxiao()
    quxiaoTupianThumbnailIdleTask()
    quxiaoRename()
  }
})

// 应用图标仅在空闲期读取，展开动画期间延后任务，避免影响关键动画帧。
watch([carouselCards, () => props.isAnimationBusy], ([cards, isAnimationBusy]) => {
  if (!['application', 'recent'].includes(currentCategory.value) || isAnimationBusy) {
    yingyongIconCoordinator.quxiao()
    return
  }
  const missingTasks = [...cards]
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))
    .filter(({ item }) => {
      if (item.type !== 'application') return false
      const mappedIcon = yingyongIconMap.value[item.id]
      // 数据库状态无法证明缓存文件仍存在，始终通过主进程确认并按需重建。
      if (mappedIcon
        && yingyongIconRequestKeyMap.value[item.id] === (item.iconCacheKey || item.id)
        && panduanYingyongIconUrl(mappedIcon)) return false
      return true
    })
    .map(({ item, offset }) => ({
      item,
      requestKey: item.iconCacheKey || item.id,
      distance: Math.abs(offset),
    }))
  yingyongIconCoordinator.tongbu(missingTasks)
}, { immediate: true })

// 网址图标按可见卡片懒加载，避免在展开动画期间占用主线程。
watch([carouselCards, () => props.isAnimationBusy], ([cards, isAnimationBusy]) => {
  if (!['url', 'recent'].includes(currentCategory.value) || isAnimationBusy) {
    wangzhiIconCoordinator.quxiao()
    return
  }
  const missingTasks = [...cards]
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))
    .filter(({ item }) => {
      if (item.type !== 'url') return false
      if (item.iconStatus === 'ready' && item.iconCacheKey && !wangzhiIconFailedIds.has(item.id)) return false
      const mappedIcon = wangzhiIconMap.value[item.id]
      if (!wangzhiIconFailedIds.has(item.id) && mappedIcon && (!item.iconCacheKey || mappedIcon.includes(item.iconCacheKey))) return false
      return true
    })
    .map(({ item, offset }) => ({
      item,
      requestKey: item.iconCacheKey || item.id,
      distance: Math.abs(offset),
    }))
  wangzhiIconCoordinator.tongbu(missingTasks)
}, { immediate: true })

// 仅清除仍属于指定任务的占位，避免误删后续请求写入的新版本。
function qingliTupianThumbnailRequestKeys(requestKeys) {
  const nextRequestKeyMap = { ...tupianThumbnailRequestKeyMap.value }
  let hasChanged = false
  for (const [itemId, requestKey] of Object.entries(requestKeys)) {
    if (nextRequestKeyMap[itemId] !== requestKey) continue
    delete nextRequestKeyMap[itemId]
    hasChanged = true
  }
  if (hasChanged) tupianThumbnailRequestKeyMap.value = guolvCurrentItemRecord(nextRequestKeyMap)
}

function qingliTupianThumbnailRetryState() {
  for (const timerId of tupianThumbnailRetryTimers.keys()) window.clearTimeout(timerId)
  const requestKeys = Object.fromEntries(
    [...tupianThumbnailRetryRequestMap.entries()].map(([requestKey, itemId]) => [itemId, requestKey]),
  )
  tupianThumbnailRetryTimers.clear()
  tupianThumbnailRetryCountMap.clear()
  tupianThumbnailRetryRequestMap.clear()
  qingliTupianThumbnailRequestKeys(requestKeys)
}

function yiChuTupianThumbnailRetryRequest(requestKeys) {
  for (const requestKey of Object.values(requestKeys)) {
    tupianThumbnailRetryCountMap.delete(requestKey)
    tupianThumbnailRetryRequestMap.delete(requestKey)
  }
}

function quxiaoTupianThumbnailIdleTask() {
  if (tupianThumbnailIdleTaskId) {
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(tupianThumbnailIdleTaskId)
    else window.clearTimeout(tupianThumbnailIdleTaskId)
    tupianThumbnailIdleTaskId = 0
  }
  const requestKeys = Object.fromEntries(
    [...tupianThumbnailPendingItems.entries()].map(([itemId, task]) => [itemId, task.requestKey]),
  )
  tupianThumbnailPendingItems.clear()
  qingliTupianThumbnailRetryState()
  qingliTupianThumbnailRequestKeys(requestKeys)
}

// IPC 瞬时失败采用有限退避重试，避免永久占位或连续轰击主进程。
function anpaiTupianThumbnailRetry(requestKeys, renwuId) {
  const retryCount = Math.max(
    0,
    ...Object.values(requestKeys).map((requestKey) => tupianThumbnailRetryCountMap.get(requestKey) ?? 0),
  ) + 1
  for (const [itemId, requestKey] of Object.entries(requestKeys)) {
    tupianThumbnailRetryRequestMap.set(requestKey, itemId)
  }
  if (retryCount > 3) {
    // 连续失败后停止本轮后台请求，避免不支持的格式持续占用解码队列。
    for (const [itemId, requestKey] of Object.entries(requestKeys)) {
      yulanFailedKeys.set(itemId, requestKey)
    }
    yiChuTupianThumbnailRetryRequest(requestKeys)
    return
  }
  for (const requestKey of Object.values(requestKeys)) {
    tupianThumbnailRetryCountMap.set(requestKey, retryCount)
  }
  const timerId = window.setTimeout(() => {
    tupianThumbnailRetryTimers.delete(timerId)
    if (isUnmounted || renwuId !== tupianThumbnailRenwu || !['image', 'recent'].includes(currentCategory.value) || props.isAnimationBusy) {
      yiChuTupianThumbnailRetryRequest(requestKeys)
      qingliTupianThumbnailRequestKeys(requestKeys)
      return
    }
    qingliTupianThumbnailRequestKeys(requestKeys)
  }, 400 * (2 ** (retryCount - 1)))
  tupianThumbnailRetryTimers.set(timerId, requestKeys)
}

// 复用单个空闲任务合并快速滚动产生的请求，避免堆积过期 IPC。
function anpaiTupianThumbnailIdleTask() {
  if (tupianThumbnailIdleTaskId || isTupianThumbnailRequesting || !tupianThumbnailPendingItems.size) return
  const renwuId = tupianThumbnailRenwu
  const duquThumbnails = async () => {
    tupianThumbnailIdleTaskId = 0
    if (isUnmounted || renwuId !== tupianThumbnailRenwu || !['image', 'recent'].includes(currentCategory.value) || props.isAnimationBusy) {
      quxiaoTupianThumbnailIdleTask()
      return
    }

    const tasks = [...tupianThumbnailPendingItems.values()]
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12)
    if (!tasks.length) return
    for (const task of tasks) tupianThumbnailPendingItems.delete(task.item.id)
    const requestKeys = Object.fromEntries(tasks.map((task) => [task.item.id, task.requestKey]))
    isTupianThumbnailRequesting = true
    try {
      const thumbnailMap = await window.aetherDock?.getImageThumbnails(tasks.map(({ item }) => item.id))
      if (isUnmounted || renwuId !== tupianThumbnailRenwu || !['image', 'recent'].includes(currentCategory.value) || props.isAnimationBusy) {
        yiChuTupianThumbnailRetryRequest(requestKeys)
        qingliTupianThumbnailRequestKeys(requestKeys)
        return
      }
      const validThumbnailMap = Object.fromEntries(
        Object.entries(thumbnailMap ?? {}).filter(([itemId, thumbnailKey]) => requestKeys[itemId]
          && typeof thumbnailKey === 'string' && thumbnailKey),
      )
      if (Object.keys(validThumbnailMap).length) {
        tupianThumbnailMap.value = hebingCurrentItemRecord(tupianThumbnailMap.value, validThumbnailMap)
        const successfulRequestKeys = Object.fromEntries(
          Object.keys(validThumbnailMap).map((itemId) => [itemId, requestKeys[itemId]]),
        )
        yiChuTupianThumbnailRetryRequest(successfulRequestKeys)
      }
      const failedRequestKeys = Object.fromEntries(
        Object.entries(requestKeys).filter(([itemId]) => !validThumbnailMap[itemId]),
      )
      // 主进程会以空键反馈解码或缓存瞬时失败；不能把它当作成功，否则卡片会永久停在回退态。
      if (Object.keys(failedRequestKeys).length) anpaiTupianThumbnailRetry(failedRequestKeys, renwuId)
    } catch {
      if (isUnmounted || renwuId !== tupianThumbnailRenwu || !['image', 'recent'].includes(currentCategory.value) || props.isAnimationBusy) {
        yiChuTupianThumbnailRetryRequest(requestKeys)
        qingliTupianThumbnailRequestKeys(requestKeys)
      } else {
        anpaiTupianThumbnailRetry(requestKeys, renwuId)
      }
    } finally {
      isTupianThumbnailRequesting = false
      anpaiTupianThumbnailIdleTask()
    }
  }

  if ('requestIdleCallback' in window) {
    tupianThumbnailIdleTaskId = window.requestIdleCallback(duquThumbnails, { timeout: 1000 })
  } else {
    tupianThumbnailIdleTaskId = window.setTimeout(duquThumbnails, 120)
  }
}

// 书架优先加载中心卡；网格和列表按当前窗口分批加载，保证滚动时始终有图可看。
watch([carouselCards, currentItems, viewMode, () => props.isAnimationBusy], ([cards, items, currentViewMode, isAnimationBusy]) => {
  if (!['image', 'recent'].includes(currentCategory.value) || isAnimationBusy) {
    tupianThumbnailRenwu += 1
    quxiaoTupianThumbnailIdleTask()
    return
  }

  const thumbnailCards = currentViewMode === 'shelf'
    ? cards
    : items.map((item, index) => ({ item, offset: index }))
  const visibleItemIds = new Set(thumbnailCards.map(({ item }) => item.id))
  const staleRequestKeys = {}
  for (const [itemId, task] of tupianThumbnailPendingItems) {
    if (visibleItemIds.has(itemId)) continue
    tupianThumbnailPendingItems.delete(itemId)
    staleRequestKeys[itemId] = task.requestKey
  }
  qingliTupianThumbnailRequestKeys(staleRequestKeys)

  const missingItems = [...thumbnailCards]
    .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))
    .filter(({ item }) => {
      if (item.type !== 'image') return false
      const mappedThumbnail = tupianThumbnailMap.value[item.id]
      const requestKey = huoquThumbnailRequestKey(item)
      const hasCurrentMappedThumbnail = mappedThumbnail && tupianThumbnailRequestKeyMap.value[item.id] === requestKey
      if (hasCurrentMappedThumbnail) return false
      return tupianThumbnailRequestKeyMap.value[item.id] !== requestKey
    })
  if (!missingItems.length) return

  const requestKeys = {}
  for (const { item, offset } of missingItems) {
    const requestKey = huoquThumbnailRequestKey(item)
    requestKeys[item.id] = requestKey
    tupianThumbnailPendingItems.set(item.id, {
      item,
      requestKey,
      distance: Math.abs(offset),
    })
  }
  tupianThumbnailRequestKeyMap.value = hebingCurrentItemRecord(tupianThumbnailRequestKeyMap.value, requestKeys)
  anpaiTupianThumbnailIdleTask()
}, { immediate: true })

function xuanzeCategory(categoryId) {
  if (categoryId === currentCategory.value) return
  if (isPiliangMoshi.value) quxiaoPiliangShanchu()
  guanbiKuaishuYulan()
  guanbiCardCaozuo()
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
  if (viewMode.value !== 'shelf') return
  event.preventDefault()
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
  guanbiCardCaozuo()
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
onKeyStroke('Escape', () => {
  isPaixuVisible.value = false
  guanbiCardCaozuo()
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
  /* 工具栏下拉菜单需跨越资料列表显示，避免被后续内容层遮挡。 */
  z-index: 10;
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

.expanded-actions {
  position: absolute;
  right: 0;
  top: 0;
  display: flex;
  height: 44px;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

/* 捕获与收集箱采用成组操作，引导用户先暂存再决定是否归档。 */
.expanded-capture { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; padding: 0; border: 1px solid rgba(38, 38, 38, .13); border-radius: 10px; background: rgba(255, 255, 255, .5); color: var(--ink-soft); cursor: pointer; font: 600 11px var(--font-body); letter-spacing: .04em; transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease, color 160ms ease, transform 160ms var(--motion-easing); }
.expanded-capture-icon { width: 14px; height: 14px; object-fit: contain; }
.expanded-capture:hover { border-color: rgba(80, 145, 63, .34); background: rgba(238, 255, 232, .88); box-shadow: 0 4px 10px rgba(38, 38, 38, .08); color: var(--ink); transform: translateY(-1px); }
.expanded-capture:active { transform: translateY(0) scale(.98); }
.expanded-clipboard { position: relative; display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; padding: 0; border: 1px solid rgba(38, 38, 38, .13); border-radius: 10px; background: rgba(255, 255, 255, .5); color: var(--ink-soft); cursor: pointer; font: 600 11px var(--font-body); letter-spacing: .04em; transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease, color 160ms ease, transform 160ms var(--motion-easing); }
.expanded-clipboard-icon { width: 14px; height: 14px; object-fit: contain; }
.expanded-clipboard b { position: absolute; top: -5px; right: -5px; display: grid; min-width: 15px; height: 15px; padding: 0 3px; place-items: center; border: 1px solid rgba(255, 255, 255, .82); border-radius: 8px; background: var(--ink); color: white; font: 700 9px var(--font-display); }
.expanded-clipboard:hover { border-color: rgba(80, 145, 63, .34); background: rgba(238, 255, 232, .88); box-shadow: 0 4px 10px rgba(38, 38, 38, .08); color: var(--ink); transform: translateY(-1px); }
.expanded-clipboard:active { transform: translateY(0) scale(.98); }
.expanded-assistant { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; padding: 0; border: 1px solid rgba(38, 38, 38, .13); border-radius: 10px; background: rgba(255, 255, 255, .5); color: var(--ink-soft); cursor: pointer; transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease, color 160ms ease, transform 160ms var(--motion-easing); }
.expanded-assistant-icon { width: 15px; height: 15px; }
.expanded-assistant:hover { border-color: rgba(80, 145, 63, .34); background: rgba(238, 255, 232, .88); box-shadow: 0 4px 10px rgba(38, 38, 38, .08); color: var(--ink); transform: translateY(-1px); }
.expanded-assistant:active { transform: translateY(0) scale(.98); }

/* 窄窗口将操作收为图标，并让搜索框为它们预留固定空间。 */
@media (max-width: 780px) {
  .expanded-capture,
  .expanded-clipboard,
  .expanded-assistant { width: 32px; }
  .expanded-search { left: 0; width: min(260px, calc(100% - 118px)); min-width: 0; transform: none; }
  .expanded-search input { min-width: 0; }
}

/* 更多菜单收纳低频窗口操作，避免与搜索和捕获争夺工具栏空间。 */
.expanded-more-wrap { position: relative; }
.expanded-more { display: grid; width: 34px; height: 32px; padding: 0; place-content: center; border: 1px solid rgba(38, 38, 38, .13); border-radius: 10px; background: rgba(255, 255, 255, .5); color: var(--ink-soft); cursor: pointer; transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease; }
.more-menu-icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.6; }
.more-menu-icon circle { fill: currentColor; stroke: none; }
.expanded-more:hover, .expanded-more[aria-expanded="true"] { border-color: rgba(38, 38, 38, .24); background: rgba(255, 255, 255, .84); box-shadow: 0 4px 10px rgba(38, 38, 38, .08); }
.expanded-more-menu { position: absolute; z-index: 12; top: calc(100% + 7px); right: 0; display: grid; width: 164px; gap: 3px; padding: 5px; border: 1px solid rgba(38, 38, 38, .13); border-radius: 12px; background: rgba(250, 250, 248, .98); box-shadow: 0 12px 28px rgba(38, 38, 38, .16); }
.expanded-more-menu button { display: flex; height: 34px; align-items: center; gap: 8px; padding: 0 9px; border: 0; border-radius: 8px; background: transparent; color: var(--ink-soft); cursor: pointer; font: 600 12px var(--font-body); text-align: left; }
.expanded-more-menu button:hover { background: rgba(99, 254, 19, .1); color: var(--ink); }
.expanded-more-menu > button:last-child { color: var(--ink); }
.expanded-more-icon { display: grid; width: 18px; height: 18px; flex: 0 0 18px; place-items: center; }
.expanded-more-icon--select { position: relative; width: 14px; height: 14px; border: 1.4px solid #43813c; border-radius: 4px; color: #43813c; }
.expanded-more-icon--select::after { position: absolute; right: -2px; bottom: -2px; width: 6px; height: 3px; border-bottom: 1.5px solid #43813c; border-left: 1.5px solid #43813c; content: ""; transform: rotate(-45deg); }
.expanded-more-menu img { width: 16px; height: 16px; opacity: .72; }
.more-menu-enter-active, .more-menu-leave-active { transition: opacity 130ms ease, transform 160ms var(--motion-easing); }
.more-menu-enter-from, .more-menu-leave-to { opacity: 0; transform: translateY(-4px) scale(.97); }

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

/* 批量操作以当前选择数为主，避免工具栏堆叠多个同等权重的按钮。 */
.piliang-actionbar { position: absolute; z-index: 4; top: 96px; right: 30px; display: flex; height: 34px; align-items: center; gap: 3px; padding: 3px 4px 3px 8px; box-sizing: border-box; border: 1px solid rgba(38, 38, 38, .12); border-radius: 10px; background: rgba(252, 252, 250, .92); box-shadow: inset 0 1px rgba(255, 255, 255, .78), 0 5px 12px rgba(38, 38, 38, .07); color: var(--ink-soft); font: 600 11px var(--font-body); }
.piliang-actionbar--with-sort { right: 126px; }
.piliang-selected-count { display: inline-flex; align-items: baseline; gap: 4px; padding-right: 4px; color: var(--ink-muted); white-space: nowrap; }
.piliang-selected-count b { color: var(--ink); font: 700 12px var(--font-mono); }
.piliang-actionbar button { height: 26px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
.piliang-finish:hover { background: rgba(38, 38, 38, .06); color: var(--ink); }
.piliang-delete { background: rgba(255, 235, 235, .86) !important; color: #b24444 !important; }
.piliang-delete:hover { background: rgba(255, 222, 222, .96) !important; }

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
.folder-card--selected:hover { border-color: rgba(99, 254, 19, .34); background: linear-gradient(145deg, rgba(242, 255, 230, .9), rgba(216, 255, 181, .42)); box-shadow: inset 0 1px rgba(255, 255, 255, .82), 0 3px 10px rgba(38, 38, 38, .08); }
.folder-card--selected::after { position: absolute; right: 0; bottom: 3px; left: 0; width: 17px; height: 2px; margin-inline: auto; border-radius: 999px; background: var(--accent); box-shadow: 0 0 7px rgba(99, 254, 19, .48); content: ""; }
.folder-card img { width: 30px; height: 30px; margin: 0; filter: brightness(0); opacity: .48; transform: scale(.94); transition: filter 220ms ease, opacity 220ms ease, transform 220ms var(--motion-easing); -webkit-user-drag: none; user-select: none; }
.folder-card--selected img { filter: brightness(0); opacity: .88; transform: translateY(-3px) scale(1); }
/* 最近分类使用内联时钟，和现有分类图标保持同一视觉节奏。 */
.folder-card svg { width: 30px; height: 30px; stroke: currentColor; stroke-linejoin: round; stroke-width: 1.7; opacity: .48; transform: scale(1.08); transition: opacity 220ms ease, transform 220ms var(--motion-easing); }
.folder-card--selected svg { opacity: .88; transform: translateY(-3px) scale(1.14); }
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

/* 排序和集合只在密集浏览时出现，让书架保持专注的展示感。 */
.library-compact-tools { position: absolute; z-index: 3; top: 96px; right: 30px; display: flex; gap: 6px; -webkit-app-region: no-drag; }
.library-sort-wrap { position: relative; }
.library-sort-trigger { display: inline-flex; height: 34px; align-items: center; justify-content: space-between; gap: 8px; padding: 0 10px; border: 1px solid rgba(38, 38, 38, .12); border-radius: 10px; outline: 0; background: rgba(252, 252, 250, .9); box-shadow: inset 0 1px rgba(255, 255, 255, .76), 0 4px 10px rgba(38, 38, 38, .06); color: var(--ink-soft); cursor: pointer; font: 600 11px var(--font-body); transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms var(--motion-easing); }
.library-sort-trigger { min-width: 88px; }
.library-sort-trigger i { width: 6px; height: 6px; margin-top: -3px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); }
.library-sort-trigger:hover, .library-sort-trigger[aria-expanded="true"] { border-color: rgba(99, 254, 19, .42); background: rgba(247, 255, 243, .94); color: var(--ink); transform: translateY(-1px); }
.library-sort-menu { position: absolute; z-index: 8; top: calc(100% + 6px); right: 0; display: grid; width: 116px; gap: 2px; padding: 4px; border: 1px solid rgba(38, 38, 38, .12); border-radius: 10px; background: rgba(252, 252, 250, .98); box-shadow: 0 10px 22px rgba(38, 38, 38, .13); }
.library-sort-menu button { height: 30px; padding: 0 9px; border: 0; border-radius: 7px; background: transparent; color: var(--ink-soft); cursor: pointer; font: 600 11px var(--font-body); text-align: left; }
.library-sort-menu button:hover { background: rgba(99, 254, 19, .1); color: var(--ink); }
.library-sort-menu button.is-active { background: rgba(232, 255, 221, .82); color: #397633; }

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

/* 网格和列表复用当前分页窗口，资料较多时可快速扫描而无需逐张轮播。 */
.library-compact-view { position: relative; z-index: 2; display: grid; box-sizing: border-box; width: 100%; height: 100%; gap: 8px; padding: 10px 7px 14px; overflow: auto; scrollbar-color: rgba(38, 38, 38, .34) transparent; scrollbar-gutter: stable; scrollbar-width: thin; -webkit-app-region: no-drag; }
/* 滚动条保持细窄，避免在资料列表中抢占视觉注意力。 */
.library-compact-view::-webkit-scrollbar { width: 9px; }
.library-compact-view::-webkit-scrollbar-track { margin: 5px 0; background: transparent; }
.library-compact-view::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 999px; background: rgba(38, 38, 38, .34); background-clip: content-box; }
.library-compact-view::-webkit-scrollbar-thumb:hover { background: rgba(38, 38, 38, .5); background-clip: content-box; }
.library-compact-view--grid { grid-template-columns: repeat(auto-fill, minmax(142px, 1fr)); align-content: start; }
.library-compact-view--list { grid-template-columns: 1fr; align-content: start; }
.library-compact-card { position: relative; display: flex; min-width: 0; min-height: 62px; align-items: center; border: 1px solid rgba(38, 38, 38, .12); border-radius: 11px; background: rgba(255, 255, 255, .58); box-shadow: inset 0 1px rgba(255, 255, 255, .76); transition: border-color 160ms ease, background 160ms ease, transform 160ms var(--motion-easing); }
.library-compact-card:hover { border-color: rgba(99, 193, 68, .48); background: rgba(250, 255, 247, .88); transform: translateY(-1px); }
.library-compact-card--missing { opacity: .62; }
.library-compact-card--menu-open { z-index: 4; border-color: rgba(99, 193, 68, .48); background: rgba(250, 255, 247, .94); }
.library-compact-card--selectable .library-compact-main { padding-right: 42px; }
.library-compact-main { display: flex; min-width: 0; flex: 1; align-items: center; gap: 9px; padding: 9px; border: 0; background: transparent; color: var(--ink); cursor: pointer; text-align: left; }
.library-compact-icon { width: 33px; height: 33px; flex: 0 0 33px; object-fit: contain; }
.library-compact-icon--preview { border-radius: 8px; background: rgba(239, 249, 236, .68); object-fit: cover; }
.library-compact-icon--empty { border-radius: 9px; background: linear-gradient(120deg, rgba(99, 254, 19, .12), rgba(91, 156, 255, .18)); }
/* 图片缩略图等待时复用骨架节奏，避免静态占位看起来像加载已完成。 */
.library-compact-icon--pending { background-size: 220% 100%; animation: application-icon-pending 1.4s ease-in-out infinite; }
.library-compact-copy { display: grid; min-width: 0; gap: 3px; }
.library-compact-copy strong, .library-compact-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.library-compact-copy strong { font: 600 12px var(--font-body); }
.library-compact-copy small { color: var(--ink-faint); font: 10px var(--font-mono); }
.library-compact-more { position: relative; z-index: 2; flex: 0 0 auto; margin-right: 8px; }
.library-compact-more-trigger { display: grid; width: 26px; height: 26px; padding: 0; place-content: center; border: 1px solid rgba(38, 38, 38, .1); border-radius: 7px; background: rgba(255, 255, 255, .54); color: var(--ink-muted); cursor: pointer; }
.card-more-icon { width: 16px; height: 16px; fill: currentColor; }
.library-compact-more-trigger .card-more-icon { width: 15px; height: 15px; }
.library-compact-more-trigger:hover, .library-compact-more-trigger[aria-expanded="true"] { border-color: rgba(99, 193, 68, .42); background: rgba(242, 255, 237, .92); color: #397633; }
.library-compact-view--list .library-compact-card { min-height: 48px; }
.library-compact-view--list .library-compact-main { padding-block: 7px; }
.library-compact-view--list .library-compact-icon { width: 29px; height: 29px; flex-basis: 29px; }
/* 网格卡将预览和资料信息分区，方便大量资料时快速扫视。 */
.library-compact-view--grid .library-compact-card { min-height: 128px; overflow: hidden; border-radius: 12px; }
.library-compact-view--grid .library-compact-main { display: grid; height: 100%; grid-template-rows: 68px minmax(0, 1fr); align-items: stretch; gap: 0; padding: 0; }
.library-compact-view--grid .library-compact-icon { width: 40px; height: 40px; align-self: center; justify-self: center; }
.library-compact-view--grid .library-compact-icon--preview { width: 100%; height: 68px; align-self: stretch; border-radius: 0; background: rgba(239, 249, 236, .68); object-fit: cover; }
.library-compact-view--grid .library-compact-icon--empty { width: 40px; height: 40px; }
.library-compact-view--grid .library-compact-copy { align-self: stretch; gap: 3px; padding: 8px 37px 9px 10px; border-top: 1px solid rgba(38, 38, 38, .07); }
.library-compact-view--grid .library-compact-copy strong { font-size: 12px; }
.library-compact-view--grid .library-compact-more { position: absolute; right: 7px; bottom: 7px; margin: 0; }
.library-compact-view--grid .library-shelf-select { top: 8px; right: 8px; transform: none; }
/* 所有视图共用同一浮层，并始终贴近触发它的资料卡。 */
.library-context-layer { position: fixed; z-index: 60; inset: 0; background: rgba(16, 22, 17, .015); -webkit-app-region: no-drag; }
.library-context-menu { position: fixed; width: min(184px, calc(100vw - 20px)); max-height: calc(100dvh - 20px); box-sizing: border-box; padding: 5px; overflow-y: auto; border: 1px solid rgba(38, 38, 38, .14); border-radius: 12px; background: rgba(252, 253, 250, .98); box-shadow: 0 15px 36px rgba(27, 35, 28, .18), 0 2px 7px rgba(27, 35, 28, .06); backdrop-filter: blur(12px); scrollbar-color: rgba(38, 38, 38, .28) transparent; scrollbar-width: thin; }
.library-context-section { display: grid; gap: 2px; }
.library-context-action { display: flex; width: 100%; height: 31px; align-items: center; justify-content: flex-start; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--ink-soft); cursor: pointer; font: 600 11px var(--font-body); text-align: left; }
.library-context-action:hover { background: rgba(99, 193, 68, .11); color: var(--ink); }
.library-context-action--manage { justify-content: space-between; margin-top: 3px; border-top: 1px solid rgba(38, 38, 38, .08); border-radius: 0 0 7px 7px; color: #397633; }
.library-context-action--manage i { color: rgba(57, 118, 51, .6); font: 700 17px/1 var(--font-body); font-style: normal; }
.library-context-action--danger { color: #b24444; }
.library-context-action--danger:hover { background: rgba(218, 109, 109, .11); color: #a53737; }
.library-context-section-title { display: grid; height: 28px; grid-template-columns: 23px 1fr 23px; align-items: center; padding: 0 3px; border-radius: 7px; background: rgba(224, 246, 216, .72); color: #397633; }
.library-context-section-title::after { width: 23px; height: 1px; content: ""; }
.library-context-section-title strong { text-align: center; font: 700 10px var(--font-body); letter-spacing: .08em; }
.library-context-section-title button { display: grid; width: 23px; height: 23px; padding: 0; place-items: center; border: 0; border-radius: 6px; background: transparent; color: #397633; cursor: pointer; font: 700 19px/1 var(--font-body); }
.library-context-section-title button:hover { background: rgba(99, 193, 68, .13); }
.library-context-rename { display: grid; gap: 6px; padding: 4px 2px 2px; }
.library-context-rename-input { width: 100%; height: 31px; box-sizing: border-box; padding: 0 8px; border: 1px solid rgba(91, 188, 255, .46); border-radius: 7px; outline: 0; background: rgba(246, 251, 245, .94); color: var(--ink); font: 600 11px var(--font-body); }
.library-context-rename-input:focus { border-color: rgba(72, 161, 54, .7); box-shadow: 0 0 0 2px rgba(99, 254, 19, .12); }
.library-context-rename footer { display: flex; justify-content: flex-end; gap: 5px; }
.library-context-rename footer button { height: 26px; padding: 0 8px; border: 1px solid rgba(38, 38, 38, .1); border-radius: 6px; background: rgba(255, 255, 255, .84); color: var(--ink-soft); cursor: pointer; font: 600 10px var(--font-body); }
.library-context-rename footer button:hover { border-color: rgba(99, 193, 68, .32); background: rgba(244, 251, 241, .96); color: var(--ink); }
.library-context-rename .library-context-rename-submit { border-color: rgba(99, 193, 68, .28); background: rgba(223, 246, 216, .92); color: #397633; }
.library-context-rename .library-context-rename-submit:hover { background: #d5f2cc; color: #286722; }
.context-menu-enter-active, .context-menu-leave-active { transition: opacity 130ms ease, transform 160ms var(--motion-easing); }
.context-menu-enter-from, .context-menu-leave-to { opacity: 0; transform: translateY(-4px) scale(.98); }
/* 一级与二级菜单用反向滑动表达进入与返回，避免内容瞬间替换。 */
.context-stage-forward-enter-active, .context-stage-forward-leave-active, .context-stage-backward-enter-active, .context-stage-backward-leave-active { transition: opacity 120ms ease, transform 170ms var(--motion-easing); }
.context-stage-forward-enter-from, .context-stage-backward-leave-to { opacity: 0; transform: translateX(9px); }
.context-stage-forward-leave-to, .context-stage-backward-enter-from { opacity: 0; transform: translateX(-7px); }

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

/* 书架卡片将低频操作收进单一入口，避免破坏封面浏览的节奏。 */
.library-shelf-more { position: absolute; z-index: 5; top: 8px; right: 8px; opacity: 0; pointer-events: none; transform: translate3d(0, -5px, 10px); transition: opacity 130ms ease, transform 200ms var(--motion-easing); }
.library-shelf-more-trigger { display: grid; width: 27px; height: 27px; padding: 0; place-content: center; border: 1px solid rgba(255, 255, 255, .2); border-radius: 8px; background: rgba(9, 14, 12, .58); box-shadow: inset 0 1px rgba(255, 255, 255, .1); color: rgba(255, 255, 255, .84); cursor: pointer; }
.library-shelf-more-trigger .card-more-icon { width: 16px; height: 16px; }
.library-shelf-more-trigger:hover, .library-shelf-more-trigger[aria-expanded="true"] { border-color: rgba(99, 254, 19, .58); background: rgba(20, 35, 18, .86); color: #dfffd1; }
.library-shelf-card--center:hover .library-shelf-more,
.library-shelf-card--center:focus-within .library-shelf-more,
.library-shelf-card--menu-open .library-shelf-more { opacity: 1; pointer-events: auto; transform: translate3d(0, 0, 10px); }
/* 批量选择以圆形勾选标记呈现，避免在资料卡右侧形成突兀的小方块。 */
.library-shelf-select { position: absolute; z-index: 5; top: 9px; right: 9px; display: grid; width: 23px; height: 23px; padding: 0; place-items: center; border: 1px solid rgba(255, 255, 255, .54); border-radius: 50%; background: rgba(9, 12, 10, .42); color: transparent; cursor: pointer; transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms var(--motion-easing); }
.library-shelf-select[aria-pressed="true"] { border-color: #8dff60; background: #4b9b39; color: #fff; box-shadow: 0 0 0 3px rgba(99, 254, 19, .16); }
.library-compact-card .library-shelf-select { top: 50%; right: 11px; border-color: rgba(58, 87, 55, .28); background: rgba(255, 255, 255, .82); box-shadow: 0 1px 3px rgba(38, 38, 38, .08); transform: translateY(-50%); }
.library-compact-card .library-shelf-select[aria-pressed="true"] { border-color: #62a952; background: #dff6d8; color: #397633; box-shadow: 0 0 0 3px rgba(99, 254, 19, .1); }
.library-shelf-select span:first-child { font-size: 13px; font-weight: 800; line-height: 1; }
.library-shelf-card--selected { border-color: rgba(141, 255, 96, .88) !important; box-shadow: inset 0 0 0 1px rgba(99, 254, 19, .18), 0 12px 26px rgba(99, 254, 19, .14); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

/* 详情面板采用轻量信息卡，网址等无预览资料保持紧凑。 */
.library-detail-panel { position: absolute; z-index: 20; top: 74px; right: 22px; bottom: 18px; display: flex; width: 310px; flex-direction: column; overflow: hidden; border: 1px solid rgba(38, 38, 38, .13); border-radius: 14px; background: rgba(250, 251, 248, .96); box-shadow: 0 12px 34px rgba(25, 31, 26, .16); backdrop-filter: blur(16px); -webkit-app-region: no-drag; }
.library-detail-panel--brief { bottom: auto; min-height: 0; max-height: calc(100% - 92px); }
.library-detail-panel--brief .library-detail-content { flex: 0 1 auto; }
.library-detail-panel header { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 12px; }
.library-detail-panel header strong { overflow: hidden; max-width: 246px; color: var(--ink); font: 650 14px var(--font-body); letter-spacing: -.01em; text-overflow: ellipsis; white-space: nowrap; }
.library-detail-panel header button { display: grid; width: 24px; height: 24px; padding: 0; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--ink-muted); cursor: pointer; font-size: 18px; }
.library-detail-panel header button:hover { background: rgba(38, 38, 38, .08); color: var(--ink); }
.library-detail-loading { display: grid; min-height: 112px; place-items: center; color: var(--ink-faint); font: 11px var(--font-body); }
/* 详情内容独立滚动，避免较小窗口把备注和整理项截断。 */
.library-detail-content { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; scrollbar-color: rgba(38, 38, 38, .28) transparent; scrollbar-width: thin; }
.library-detail-content::-webkit-scrollbar { width: 6px; }
.library-detail-content::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(38, 38, 38, .24); }
.library-detail-preview { display: grid; min-height: 112px; max-height: 142px; margin: 0 14px 10px; overflow: hidden; border: 1px solid rgba(38, 38, 38, .1); border-radius: 10px; background: linear-gradient(145deg, #edf2ec, #f8f9f7); }
.library-detail-preview img, .library-detail-preview iframe { width: 100%; height: 100%; border: 0; object-fit: contain; }
.library-detail-preview pre { min-width: 0; max-height: 166px; padding: 10px; margin: 0; overflow: auto; color: var(--ink-soft); font: 10px/1.55 var(--font-mono); white-space: pre-wrap; }
.library-detail-meta { display: grid; gap: 6px; padding: 0 14px 10px; margin: 0; }
.library-detail-meta div { display: grid; min-height: 30px; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 7px; padding: 0 9px; border-radius: 8px; background: rgba(38, 38, 38, .04); }
.library-detail-meta dt { color: var(--ink-faint); font: 10px var(--font-body); }
.library-detail-meta dd { overflow: hidden; margin: 0; color: var(--ink-soft); font: 10px var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
.library-detail-field { display: grid; gap: 5px; padding: 0 14px; color: var(--ink-muted); font: 600 10px var(--font-body); }
.library-detail-content > .library-detail-field { padding-bottom: 0; }
.library-detail-field textarea { min-height: 54px; padding: 8px 9px; resize: vertical; border: 1px solid rgba(38, 38, 38, .13); border-radius: 8px; outline: 0; background: rgba(255, 255, 255, .82); color: var(--ink); font: 11px/1.45 var(--font-body); }
.library-detail-field textarea:focus { border-color: rgba(99, 193, 68, .56); box-shadow: 0 0 0 3px rgba(99, 254, 19, .1); }
.library-detail-error { padding: 0 14px; margin: 8px 0 0; color: #b44a4a; font: 10px var(--font-body); }
.library-detail-panel footer { display: flex; flex: 0 0 auto; justify-content: flex-end; padding: 9px 14px 14px; }
.library-detail-panel footer button { height: 28px; padding: 0 10px; border: 1px solid rgba(74, 145, 61, .28); border-radius: 7px; background: #dff7d6; color: #2f6d2c; cursor: pointer; font: 650 11px var(--font-body); transition: transform 150ms ease, background 150ms ease; }
.library-detail-panel footer button:hover:not(:disabled) { background: #d4f3c9; transform: translateY(-1px); }
.library-detail-panel footer button:active:not(:disabled) { transform: translateY(0); }
.library-detail-panel footer button:disabled { cursor: wait; opacity: .56; }
.library-detail-enter-active, .library-detail-leave-active { transition: opacity 180ms ease, transform 220ms var(--motion-easing); }
.library-detail-enter-from, .library-detail-leave-to { opacity: 0; transform: translateX(14px); }

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
  .library-shelf-icon-skeleton,
  .library-compact-icon--pending { animation: none; }
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
