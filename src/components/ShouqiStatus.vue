<template>
  <div class="shouqi-status" :class="{ 'shouqi-status--hidden': hidden, 'shouqi-status--drop': dragging }">
    <div ref="lottieHolder" class="cat-lottie" aria-hidden="true"></div>
    <div class="shouqi-xinxi" aria-hidden="true">
      <time class="shouqi-time">{{ currentTime }}</time>
      <div class="xitong-status">
        <span><b>CPU</b><em>{{ systemStatus.cpu }}%</em></span>
        <span><b>MEM</b><em>{{ systemStatus.neicun }}%</em></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useIntervalFn } from '@vueuse/core'
import lottie from 'lottie-web/build/player/lottie_light'
import { jiazaiDonghuaData } from '@/constants/donghua'

const props = defineProps({
  animationId: { type: String, default: 'kulian' },
  hidden: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
})

const lottieHolder = useTemplateRef('lottieHolder')
const currentTime = shallowRef('')
const systemStatus = shallowRef({ cpu: 0, neicun: 0 })
let lottiePlayer = null
let currentLottieRequest = 0

function gengxinCurrentTime() {
  currentTime.value = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

async function gengxinSystemStatus() {
  try {
    const status = await window.aetherDock?.getSystemStatus()
    if (status) systemStatus.value = status
  } catch {
    // 系统状态短暂读取失败时保留上一帧。
  }
}

async function chongjianLottie() {
  if (!lottieHolder.value) return

  const requestId = ++currentLottieRequest
  lottiePlayer?.destroy()
  lottiePlayer = null
  const animationData = await jiazaiDonghuaData(props.animationId)
  if (requestId !== currentLottieRequest || !animationData || !lottieHolder.value) return

  lottiePlayer = lottie.loadAnimation({
    container: lottieHolder.value,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: structuredClone(animationData),
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  })
}

useIntervalFn(gengxinCurrentTime, 1000, { immediateCallback: true })
useIntervalFn(gengxinSystemStatus, 2000, { immediateCallback: true })
watch(() => props.animationId, chongjianLottie)
onMounted(chongjianLottie)
onUnmounted(() => {
  currentLottieRequest += 1
  lottiePlayer?.destroy()
})
</script>

<style scoped>
.shouqi-status {
  position: absolute;
  z-index: 1;
  inset: 0;
  pointer-events: none;
}

.cat-lottie {
  position: absolute;
  top: 40%;
  left: 0;
  width: 80px;
  height: 80px;
  z-index: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity 180ms ease, transform 260ms var(--motion-easing);
}

.shouqi-xinxi {
  position: absolute;
  inset: 0;
  color: var(--text-on-ink);
  font-family: var(--font-display);
  pointer-events: none;
  transition: opacity 180ms ease, transform 260ms var(--motion-easing);
}

.shouqi-time {
  position: absolute;
  top: 50%;
  left: 50%;
  color: var(--paper-white);
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: .06em;
  text-shadow: 0 0 12px rgba(99, 254, 19, .12), 0 0 2px rgba(255, 255, 255, .36);
  transform: translate(-50%, -50%);
}

.xitong-status {
  position: absolute;
  top: 50%;
  right: 12px;
  display: grid;
  min-width: 66px;
  gap: 3px;
  padding-left: 9px;
  font: 11px/1.1 var(--font-mono);
  font-variant-numeric: tabular-nums;
  transform: translateY(-50%);
}

.xitong-status::before {
  position: absolute;
  top: 1px;
  bottom: 1px;
  left: 0;
  width: 1px;
  background: linear-gradient(transparent, rgba(99, 254, 19, .42), transparent);
  content: "";
}

.xitong-status span {
  display: grid;
  grid-template-columns: 27px 1fr;
  column-gap: 5px;
}

.xitong-status b {
  color: var(--text-on-ink-muted);
  font-weight: 600;
  letter-spacing: .1em;
}

.xitong-status em {
  color: var(--text-on-ink);
  font-size: 12px;
  font-style: normal;
  font-weight: 650;
  text-align: right;
}

.shouqi-status--hidden .cat-lottie,
.shouqi-status--hidden .shouqi-xinxi {
  opacity: 0;
}

.shouqi-status--hidden .cat-lottie { transform: translateY(-50%) scale(.94); }
.shouqi-status--hidden .shouqi-xinxi { transform: scale(.94); }

.shouqi-status--drop .cat-lottie,
.shouqi-status--drop .shouqi-xinxi {
  opacity: .18;
  filter: blur(5px) saturate(.5);
}

.shouqi-status--drop .cat-lottie { transform: translateY(-50%) scale(.96); }
.shouqi-status--drop .shouqi-xinxi { transform: scale(.96); }
</style>
