<template>
  <section class="settings-page" aria-label="灵动岛设置">
    <header class="settings-title">
      <button class="settings-back" type="button" aria-label="返回资料库" @click.stop="emit('back')">←</button>
      <div>
        <small>AETHERDOCK / SETTINGS</small>
        <h2>灵动配置</h2>
      </div>
    </header>

    <section class="settings-group" aria-labelledby="animation-title">
      <div class="settings-group-title">
        <span id="animation-title">收起态动画</span>
        <small>选择常驻的情绪伙伴</small>
      </div>
      <div class="animation-choice-panel">
        <button
          v-for="animation in donghuaList"
          :key="animation.id"
          class="animation-choice"
          :class="{ 'animation-choice--selected': animationId === animation.id }"
          type="button"
          @click.stop="emit('select-animation', animation.id)"
        >
          <span :ref="(element) => jiluPreviewHolder(animation.id, element)" class="animation-preview" aria-hidden="true"></span>
          <span>
            <strong>{{ animation.mingcheng }}</strong>
            <small>{{ animation.shuoming }}</small>
          </span>
        </button>
      </div>
    </section>

    <section class="settings-group settings-group--directory" aria-labelledby="directory-title">
      <div class="settings-group-title">
        <span id="directory-title">资料库目录</span>
        <small>网络归档与本地索引的统一入口</small>
      </div>
      <div class="library-directory-display">
        <span>{{ rootdir || '尚未设置资料库目录' }}</span>
        <button type="button" @click.stop="emit('select-rootdir')">{{ rootdir ? '更换目录' : '选择目录' }}</button>
      </div>
    </section>
  </section>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import { donghuaList, jiazaiDonghuaData } from '@/constants/donghua'

defineProps({
  animationId: { type: String, default: 'kulian' },
  rootdir: { type: String, default: '' },
})

const emit = defineEmits(['back', 'select-animation', 'select-rootdir'])
const previewHolders = new Map()
let previewPlayers = []
let isPreviewActive = false

function jiluPreviewHolder(animationId, element) {
  if (element) previewHolders.set(animationId, element)
  else previewHolders.delete(animationId)
}

// 设置页挂载后统一创建三个预览实例，卸载时一次性释放。
async function chushihuaPreviews() {
  await nextTick()
  const players = await Promise.all(donghuaList.map(async (animation) => {
    const holder = previewHolders.get(animation.id)
    const animationData = await jiazaiDonghuaData(animation.id)
    if (!isPreviewActive || !holder || !animationData) return null
    return lottie.loadAnimation({
      container: holder,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: structuredClone(animationData),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })
  }))
  if (!isPreviewActive) {
    players.forEach((player) => player?.destroy())
    return
  }
  previewPlayers = players.filter(Boolean)
}

onMounted(() => {
  isPreviewActive = true
  chushihuaPreviews()
})
onUnmounted(() => {
  isPreviewActive = false
  previewPlayers.forEach((player) => player.destroy())
})
</script>

<style scoped>
.settings-page {
  position: absolute;
  z-index: 3;
  inset: 0;
  padding: 28px 34px 26px;
  overflow: hidden;
  border-radius: inherit;
  color: var(--ink);
  color-scheme: light;
  -webkit-app-region: no-drag;
}

.settings-title {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}

.settings-title small {
  display: block;
  color: var(--ink-faint);
  font: 600 11px var(--font-mono);
  letter-spacing: .1em;
}

.settings-title h2 {
  margin: 3px 0 0;
  color: var(--ink);
  font: 500 20px var(--font-serif);
  letter-spacing: .08em;
}

.settings-back {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--border-ink);
  border-radius: 50%;
  background: rgba(255, 255, 255, .44);
  color: var(--ink-soft);
  cursor: pointer;
  font-size: 18px;
  transition: background 180ms ease, border-color 180ms ease;
}

.settings-back:hover { border-color: rgba(99, 254, 19, .56); background: var(--accent-tint); }
.settings-group { margin-top: 18px; }
.settings-group--directory { margin-top: 24px; }

.settings-group-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.settings-group-title > span { color: var(--ink);   font: 500 14px var(--font-body); letter-spacing: .06em; }
.settings-group-title small { display: block; color: var(--ink-faint); font: 600 11px var(--font-mono); letter-spacing: .1em; }

.animation-choice-panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.animation-choice {
  position: relative;
  display: grid;
  min-height: 118px;
  grid-template-rows: 74px auto;
  padding: 7px 8px 10px;
  overflow: hidden;
  border: 1px solid rgba(38, 38, 38, .1);
  border-radius: 17px;
  background: rgba(255, 255, 255, .38);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color 220ms ease, background 220ms ease, transform 220ms var(--motion-easing);
}

.animation-choice:hover { border-color: rgba(38, 38, 38, .22); background: rgba(255, 255, 255, .58); transform: translateY(-2px); }
.animation-choice--selected { border-color: rgba(99, 254, 19, .5); background: linear-gradient(145deg, rgba(242, 255, 230, .9), rgba(216, 255, 181, .38)); box-shadow: inset 0 1px rgba(255, 255, 255, .8), 0 0 0 3px rgba(99, 254, 19, .08); }
.animation-preview { display: block; width: 100%; height: 74px; pointer-events: none; }
.animation-preview :deep(svg) { display: block; width: 100%; height: 100%; }
.animation-choice > span:last-child { display: grid; gap: 2px; padding-left: 3px; }
.animation-choice strong { color: var(--ink); font: 500 13px var(--font-body); }
.animation-choice small { color: var(--ink-muted); font: 600 11px var(--font-body); }

.library-directory-display {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 12px;
  padding: 8px 9px 8px 14px;
  border: 1px solid rgba(38, 38, 38, .12);
  border-radius: 14px;
  background: rgba(255, 255, 255, .42);
}

.library-directory-display span {
  overflow: hidden;
  flex: 1;
  color: var(--ink-muted);
  font: 600 11px var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-directory-display button {
  flex: 0 0 auto;
  padding: 7px 10px;
  border: 1px solid var(--ink);
  border-radius: 9px;
  background: var(--ink);
  color: var(--paper);
  cursor: pointer;
  font: 600 11px var(--font-body);
}

.library-directory-display button:hover { border-color: var(--accent-deep); background: var(--accent); color: var(--ink-deep); }

.glass-switch-enter-active .settings-title,
.glass-switch-enter-active .settings-group {
  animation: shezhi-content-rise 360ms var(--motion-easing) both;
}

.glass-switch-enter-active .settings-group { animation-delay: 60ms; }

@keyframes shezhi-content-rise {
  from { opacity: 0; transform: translate3d(0, 16px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
</style>
