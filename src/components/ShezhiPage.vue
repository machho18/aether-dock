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

    <div class="settings-bottom-grid">
      <section class="settings-group settings-group--directory" aria-labelledby="directory-title">
        <div class="settings-group-title">
          <span id="directory-title">资料库目录</span>
          <small>LOCAL ARCHIVE</small>
        </div>
        <div class="library-directory-display">
          <span>{{ rootdir || '尚未设置资料库目录' }}</span>
          <button type="button" :disabled="isRootdirMigrating" @click.stop="emit('select-rootdir')">
            {{ isRootdirMigrating ? '正在迁移…' : rootdir ? '更换目录' : '选择目录' }}
          </button>
        </div>
      </section>

      <section class="settings-group settings-group--system" aria-labelledby="system-title">
        <div class="settings-group-title">
          <span id="system-title">系统启动</span>
          <small>V{{ appVersion }}</small>
        </div>
        <div class="system-startup-display">
          <span>
            <strong>开机自启</strong>
            <small>{{ autoLaunchDescription }}</small>
          </span>
          <button
            class="startup-switch"
            :class="{ 'startup-switch--active': autoLaunchEnabled }"
            type="button"
            role="switch"
            :aria-checked="autoLaunchEnabled"
            :aria-label="autoLaunchEnabled ? '关闭开机自启' : '开启开机自启'"
            :disabled="!autoLaunchSupported || isAutoLaunchUpdating"
            @click.stop="qiehuanAutoLaunch"
          >
            <i aria-hidden="true"></i>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, shallowRef } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import { donghuaList, jiazaiDonghuaData } from '@/constants/donghua'

defineProps({
  animationId: { type: String, default: 'kulian' },
  rootdir: { type: String, default: '' },
  isRootdirMigrating: { type: Boolean, default: false },
})

const emit = defineEmits(['back', 'select-animation', 'select-rootdir'])
const previewHolders = new Map()
const appVersion = shallowRef('0.0.0')
const autoLaunchSupported = shallowRef(false)
const autoLaunchEnabled = shallowRef(false)
const autoLaunchUnavailableReason = shallowRef('')
const isAutoLaunchUpdating = shallowRef(false)
let previewPlayers = []
let isPreviewActive = false

const autoLaunchDescription = computed(() => {
  if (autoLaunchSupported.value) return autoLaunchEnabled.value ? '已跟随系统启动' : '保持手动启动'
  return autoLaunchUnavailableReason.value === 'development' ? '仅安装版可设置' : '当前系统不支持'
})

async function jiazaiAppInfo() {
  try {
    const info = await window.aetherDock?.getAppInfo()
    if (!info) return
    appVersion.value = info.version || '0.0.0'
    autoLaunchSupported.value = Boolean(info.autoLaunchSupported)
    autoLaunchEnabled.value = Boolean(info.autoLaunchEnabled)
    autoLaunchUnavailableReason.value = info.autoLaunchUnavailableReason || ''
  } catch {}
}

async function qiehuanAutoLaunch() {
  if (!autoLaunchSupported.value || isAutoLaunchUpdating.value) return
  isAutoLaunchUpdating.value = true
  try {
    const result = await window.aetherDock?.setAutoLaunch(!autoLaunchEnabled.value)
    if (result) autoLaunchEnabled.value = Boolean(result.autoLaunchEnabled)
  } finally {
    isAutoLaunchUpdating.value = false
  }
}

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
  jiazaiAppInfo()
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
.settings-bottom-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 12px; margin-top: 18px; }
.settings-bottom-grid .settings-group { min-width: 0; margin-top: 0; }

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

.animation-choice:not(.animation-choice--selected):hover { border-color: rgba(38, 38, 38, .22); background: rgba(255, 255, 255, .58); transform: translateY(-2px); }
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

.library-directory-display button:hover { border-color: rgba(38, 38, 38, .72); background: #3d423f; color: #fff; box-shadow: 0 5px 12px rgba(38, 38, 38, .16); }
.library-directory-display button:disabled { cursor: wait; opacity: .58; }

.system-startup-display {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 10px;
  padding: 7px 10px 7px 13px;
  border: 1px solid rgba(38, 38, 38, .12);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, .52), rgba(239, 241, 236, .5));
}

.system-startup-display > span { display: grid; min-width: 0; flex: 1; gap: 2px; }
.system-startup-display strong { color: var(--ink); font: 600 11px var(--font-body); letter-spacing: .04em; }
.system-startup-display small { overflow: hidden; color: var(--ink-faint); font: 600 9px var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }

.startup-switch {
  position: relative;
  width: 38px;
  height: 22px;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid rgba(38, 38, 38, .22);
  border-radius: 999px;
  background: rgba(38, 38, 38, .1);
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
}

.startup-switch i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 5px rgba(38, 38, 38, .22);
  transition: transform 220ms var(--motion-easing);
}

.startup-switch--active { border-color: rgba(71, 190, 17, .58); background: var(--accent); box-shadow: 0 0 0 3px rgba(99, 254, 19, .09); }
.startup-switch--active i { transform: translateX(16px); }
.startup-switch:disabled { cursor: wait; opacity: .5; }

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
