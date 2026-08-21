<template>
  <section class="clipboard-page" aria-label="剪贴板收集箱">
    <header class="clipboard-topbar">
      <button class="clipboard-icon-button" type="button" aria-label="返回资料库" title="返回资料库" @click.stop="emit('back')">
        <PhArrowLeft :size="16" weight="bold" />
      </button>

      <div class="clipboard-identity">
        <span class="clipboard-identity-icon" aria-hidden="true"><img :src="collectionIcon" alt="" draggable="false"></span>
        <div class="clipboard-heading">
          <strong>收集箱</strong>
        </div>
      </div>

      <div class="clipboard-actions">
        <button class="clipboard-action clipboard-action--primary" type="button" :disabled="!items.length || isBusy" aria-label="全部归档" title="全部归档" @click.stop="emit('archive-all', itemIds)">
          <img class="clipboard-archive-icon" :src="archiveIcon" alt="" aria-hidden="true" draggable="false">
        </button>
        <button class="clipboard-icon-button clipboard-icon-button--danger" type="button" :disabled="!items.length || isBusy" aria-label="清空收集箱" title="清空收集箱" @click.stop="emit('clear')">
          <PhTrash :size="15" weight="bold" />
        </button>
      </div>
    </header>

    <section v-if="items.length" class="clipboard-list" aria-label="已捕获内容">
      <article v-for="item in items" :key="item.id" class="clipboard-item" :class="`clipboard-item--${item.type}`">
        <img v-if="item.type === 'image'" class="clipboard-image-preview" :src="item.imageDataUrl" alt="剪贴板截图预览">
        <span v-else class="clipboard-item-icon" aria-hidden="true"><component :is="typeIcons[item.type] ?? PhClipboardText" :size="18" weight="bold" /></span>

        <div class="clipboard-item-content">
          <div class="clipboard-item-title-row">
            <strong class="clipboard-item-title" :title="item.title">{{ item.title }}</strong>
            <time :datetime="new Date(item.createdAt).toISOString()">{{ geshiBuhuoShijian(item.createdAt) }}</time>
          </div>
          <p v-if="item.type === 'url'" class="clipboard-item-preview clipboard-item-preview--url" :title="item.sourceUrl">{{ item.sourceUrl }}</p>
          <p v-else class="clipboard-item-preview">{{ item.textContent || '截图已暂存，可归档到资料库。' }}</p>
        </div>

        <div class="clipboard-item-actions" :aria-label="`${item.title} 的操作`">
          <button type="button" :disabled="isBusy" aria-label="预览" title="预览" @click.stop="dakaiNeirongPreview(item)">
            <PhEye :size="15" weight="bold" />
          </button>
          <button type="button" :disabled="isBusy" aria-label="复制" title="复制" @click.stop="emit('copy', item.id)">
            <PhCopy :size="15" weight="bold" />
          </button>
          <button class="clipboard-item-archive" type="button" :disabled="isBusy" aria-label="归档到资料库" title="归档到资料库" @click.stop="emit('archive-item', item.id)">
            <img class="clipboard-archive-icon" :src="archiveIcon" alt="" aria-hidden="true" draggable="false">
          </button>
          <button class="clipboard-item-delete" type="button" :disabled="isBusy" aria-label="从收集箱移除" title="从收集箱移除" @click.stop="emit('delete-item', item.id)">
            <PhTrash :size="15" weight="bold" />
          </button>
        </div>
      </article>
    </section>

    <div v-else class="clipboard-empty">
      <span class="clipboard-empty-icon" aria-hidden="true"><img :src="collectionIcon" alt="" draggable="false"></span>
      <strong>还没有待整理的内容</strong>
      <p>可从资料库首页捕获文本、链接或截图，再回到这里统一整理。</p>
    </div>

    <Transition name="clipboard-preview">
      <div v-if="previewItem" class="clipboard-preview-layer" @click.self="guanbiNeirongPreview">
        <section class="clipboard-preview-dialog" role="dialog" aria-modal="true" :aria-label="`${previewItem.title} 预览`">
          <header>
            <div>
              <small>{{ typeLabels[previewItem.type] ?? '内容' }}</small>
              <strong>{{ previewItem.title }}</strong>
            </div>
            <button type="button" aria-label="关闭预览" title="关闭" @click="guanbiNeirongPreview"><PhX :size="17" weight="bold" /></button>
          </header>
          <div class="clipboard-preview-body" :class="`clipboard-preview-body--${previewItem.type}`">
            <img v-if="previewItem.type === 'image'" :src="previewItem.imageDataUrl" alt="剪贴板截图完整预览">
            <pre v-else-if="previewItem.type === 'text'">{{ previewItem.textContent }}</pre>
            <p v-else>{{ previewItem.sourceUrl }}</p>
          </div>
          <footer>
            <button type="button" @click="emit('copy', previewItem.id)"><PhCopy :size="14" weight="bold" />复制内容</button>
          </footer>
        </section>
      </div>
    </Transition>
  </section>
</template>

<script setup>
import {
  PhArrowLeft,
  PhClipboardText,
  PhCopy,
  PhEye,
  PhImage,
  PhLink,
  PhTextT,
  PhTrash,
  PhX,
} from '@phosphor-icons/vue'
import { computed, shallowRef } from 'vue'
import archiveIcon from '@/assets/icons/guidang.svg'
import collectionIcon from '@/assets/icons/shoujixiang.svg'

const props = defineProps({
  items: { type: Array, default: () => [] },
  isBusy: { type: Boolean, default: false },
})

const emit = defineEmits(['back', 'archive-item', 'archive-all', 'delete-item', 'clear', 'copy'])
const itemIds = computed(() => props.items.map(({ id }) => id))
const typeIcons = { text: PhTextT, url: PhLink, image: PhImage }
const typeLabels = { text: '文本预览', url: '链接地址', image: '图片预览' }
const previewItem = shallowRef(null)

// 预览保持在收集箱内完成，避免尚未归档的内容意外写入资料库。
function dakaiNeirongPreview(item) {
  previewItem.value = item
}

function guanbiNeirongPreview() {
  previewItem.value = null
}

// 使用相对时间压缩列表信息，让用户优先关注内容本身。
function geshiBuhuoShijian(timestamp) {
  const elapsed = Math.max(0, Date.now() - Number(timestamp || 0))
  if (elapsed < 60 * 1000) return '刚刚捕获'
  if (elapsed < 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 1000))} 分钟前`
  if (elapsed < 24 * 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 60 * 1000))} 小时前`
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.clipboard-page {
  position: absolute;
  z-index: 2;
  inset: 1px;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  border-radius: 18px;
  background: linear-gradient(150deg, #f4f5f1, #e9ede6 56%, #e5eae2);
  color: var(--ink);
  color-scheme: light;
}

/* 顶栏只保留返回与整理动作，捕获入口集中在资料库首页。 */
.clipboard-topbar {
  display: flex;
  min-height: 60px;
  flex: 0 0 60px;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(38, 38, 38, .1);
}

.clipboard-icon-button,
.clipboard-action,
.clipboard-item-actions button,
.clipboard-preview-dialog header button,
.clipboard-preview-dialog footer button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(38, 38, 38, .13);
  background: rgba(255, 255, 255, .58);
  color: var(--ink-soft);
  cursor: pointer;
  font: 600 12px var(--font-body);
  transition: border-color 150ms ease, background 150ms ease, color 150ms ease, transform 150ms var(--motion-easing);
}

.clipboard-icon-button { width: 31px; height: 31px; flex: 0 0 31px; border-radius: 9px; }
.clipboard-icon-button:hover:not(:disabled), .clipboard-action:hover:not(:disabled), .clipboard-item-actions button:hover:not(:disabled), .clipboard-preview-dialog header button:hover, .clipboard-preview-dialog footer button:hover { border-color: rgba(55, 117, 46, .35); background: rgba(249, 255, 247, .93); color: var(--ink); transform: translateY(-1px); }
.clipboard-icon-button:active:not(:disabled), .clipboard-action:active:not(:disabled), .clipboard-item-actions button:active:not(:disabled), .clipboard-preview-dialog header button:active, .clipboard-preview-dialog footer button:active { transform: scale(.96); }
.clipboard-icon-button--danger:hover:not(:disabled), .clipboard-item-delete:hover:not(:disabled) { border-color: rgba(169, 67, 67, .34); background: rgba(255, 242, 242, .9); color: #a14343; }
button:disabled { cursor: not-allowed; opacity: .45; transform: none !important; }

.clipboard-identity { display: flex; min-width: 0; flex: 1; align-items: center; gap: 8px; }
.clipboard-identity-icon { display: grid; width: 29px; height: 29px; flex: 0 0 29px; place-items: center; border-radius: 9px; background: rgba(99, 254, 19, .18); }
.clipboard-identity-icon img { width: 17px; height: 17px; object-fit: contain; }
.clipboard-heading { display: grid; min-width: 0; }
.clipboard-heading strong { color: var(--ink); font: 700 15px/1.15 var(--font-display); letter-spacing: .035em; }

.clipboard-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 5px; }
.clipboard-action { width: 31px; height: 31px; padding: 0; border-radius: 9px; }
.clipboard-archive-icon { width: 15px; height: 15px; object-fit: contain; }
.clipboard-action--primary { border-color: rgba(61, 132, 48, .34); background: rgba(99, 254, 19, .14); color: #2d7227; }
.clipboard-action--primary:hover:not(:disabled) { background: rgba(99, 254, 19, .24); color: #245e20; }

/* 列表项保持单行工作流，减少卡片网格在小窗中造成的视觉碎片。 */
.clipboard-list { display: grid; min-height: 0; flex: 1; align-content: start; gap: 7px; padding: 12px 18px 18px; overflow: auto; overscroll-behavior: contain; }
.clipboard-item { display: flex; min-width: 0; min-height: 70px; align-items: center; gap: 11px; padding: 10px; border: 1px solid rgba(38, 38, 38, .11); border-radius: 12px; background: rgba(255, 255, 255, .68); box-shadow: inset 0 1px rgba(255, 255, 255, .7); }
.clipboard-item-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border-radius: 10px; background: rgba(38, 38, 38, .055); color: var(--ink-muted); }
.clipboard-item--text .clipboard-item-icon { background: rgba(99, 254, 19, .13); color: #34772e; }
.clipboard-item--url .clipboard-item-icon { background: rgba(88, 164, 117, .12); color: #397357; }
.clipboard-image-preview { width: 53px; height: 42px; flex: 0 0 53px; border: 1px solid rgba(38, 38, 38, .1); border-radius: 8px; background: #eceeea; object-fit: cover; }
.clipboard-item-content { min-width: 0; flex: 1; }
.clipboard-item-title-row { display: flex; min-width: 0; align-items: baseline; gap: 10px; }
.clipboard-item-title { min-width: 0; flex: 1; overflow: hidden; color: var(--ink); font: 700 12px/1.35 var(--font-body); letter-spacing: .015em; text-overflow: ellipsis; white-space: nowrap; }
.clipboard-item-title-row time { flex: 0 0 auto; color: var(--ink-faint); font: 10px var(--font-body); white-space: nowrap; }
.clipboard-item-preview { display: -webkit-box; margin: 3px 0 0; overflow: hidden; color: var(--ink-muted); font: 11px/1.42 var(--font-body); overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
.clipboard-item-preview--url { color: #46735d; }
.clipboard-item-actions { display: flex; flex: 0 0 auto; gap: 4px; }
.clipboard-item-actions button { width: 29px; height: 29px; padding: 0; border-radius: 8px; }
.clipboard-item-archive { border-color: rgba(61, 132, 48, .25) !important; background: rgba(99, 254, 19, .1) !important; color: #32712b !important; }
.clipboard-item-archive:hover:not(:disabled) { background: rgba(99, 254, 19, .2) !important; }

.clipboard-empty { display: grid; min-height: 0; flex: 1; align-content: center; justify-items: center; padding: 30px; text-align: center; }
.clipboard-empty-icon { display: grid; width: 48px; height: 48px; margin-bottom: 10px; place-items: center; border-radius: 14px; background: rgba(99, 254, 19, .14); }
.clipboard-empty-icon img { width: 26px; height: 26px; object-fit: contain; }
.clipboard-empty strong { font: 700 15px var(--font-display); letter-spacing: .04em; }
.clipboard-empty p { max-width: 310px; margin: 6px 0 0; color: var(--ink-muted); font: 12px/1.6 var(--font-body); }

/* 预览层仅放大已暂存内容，不加载外部网页，避免链接内容影响主窗口性能。 */
.clipboard-preview-layer { position: absolute; z-index: 12; inset: 0; display: grid; padding: 18px; place-items: center; background: rgba(32, 39, 33, .24); backdrop-filter: blur(3px); }
.clipboard-preview-dialog { display: flex; width: min(480px, 100%); max-height: 100%; flex-direction: column; overflow: hidden; border: 1px solid rgba(38, 38, 38, .14); border-radius: 14px; background: rgba(252, 253, 250, .98); box-shadow: 0 18px 42px rgba(27, 35, 28, .22); }
.clipboard-preview-dialog header { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 13px 10px; border-bottom: 1px solid rgba(38, 38, 38, .08); }
.clipboard-preview-dialog header div { min-width: 0; }
.clipboard-preview-dialog header small { display: block; margin-bottom: 2px; color: var(--ink-faint); font: 10px var(--font-body); }
.clipboard-preview-dialog header strong { display: block; overflow: hidden; color: var(--ink); font: 650 13px/1.3 var(--font-body); text-overflow: ellipsis; white-space: nowrap; }
.clipboard-preview-dialog header button { width: 27px; height: 27px; flex: 0 0 27px; padding: 0; border-radius: 8px; }
.clipboard-preview-body { display: grid; min-height: 0; flex: 1; padding: 12px; overflow: auto; background: rgba(38, 38, 38, .025); }
.clipboard-preview-body--image { place-items: center; }
.clipboard-preview-body img { display: block; max-width: 100%; max-height: 235px; border: 1px solid rgba(38, 38, 38, .1); border-radius: 9px; background: #eff1ee; object-fit: contain; }
.clipboard-preview-body pre, .clipboard-preview-body p { min-width: 0; margin: 0; color: var(--ink-soft); font: 12px/1.65 var(--font-body); overflow-wrap: anywhere; white-space: pre-wrap; }
.clipboard-preview-body--url p { align-self: center; padding: 10px 11px; border: 1px solid rgba(72, 132, 91, .18); border-radius: 9px; background: rgba(99, 193, 68, .08); color: #376b4e; }
.clipboard-preview-dialog footer { display: flex; justify-content: flex-end; padding: 9px 13px 12px; border-top: 1px solid rgba(38, 38, 38, .08); }
.clipboard-preview-dialog footer button { height: 29px; gap: 5px; padding: 0 9px; border-color: rgba(61, 132, 48, .28); border-radius: 8px; background: rgba(99, 254, 19, .13); color: #2d7227; }
.clipboard-preview-enter-active, .clipboard-preview-leave-active { transition: opacity 150ms ease; }
.clipboard-preview-enter-active .clipboard-preview-dialog, .clipboard-preview-leave-active .clipboard-preview-dialog { transition: opacity 180ms ease, transform 200ms var(--motion-easing); }
.clipboard-preview-enter-from, .clipboard-preview-leave-to { opacity: 0; }
.clipboard-preview-enter-from .clipboard-preview-dialog, .clipboard-preview-leave-to .clipboard-preview-dialog { opacity: 0; transform: translateY(8px) scale(.98); }

@media (max-width: 620px) {
  .clipboard-topbar { gap: 7px; padding: 0 12px; }
  .clipboard-item-title-row time { display: none; }
  .clipboard-list { padding-right: 12px; padding-left: 12px; }
}
</style>
