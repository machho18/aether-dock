<template>
  <div
    class="cixi-guajian"
    :class="{
      'cixi-guajian--moving': props.isMoving,
      'cixi-guajian--pasting': props.isPasting,
    }"
    aria-hidden="true"
  >
    <span
      class="cixi-guajian__telemetry cixi-guajian__telemetry--cpu"
      :class="`cixi-guajian__telemetry--${cpuYaliLevel}`"
    >
      <!-- 描边与底板共用圆角路径，避免呼吸光退化为矩形轮廓。 -->
      <svg class="cixi-guajian__telemetry-outline" viewBox="0 0 48 20" focusable="false">
        <path class="cixi-guajian__telemetry-glow" d="M7 0H44.5C46.6 0 48 2 47.4 4L42.8 17.7C42.3 19.1 41.5 20 40 20H7C3.1 20 0 16.9 0 13V7C0 3.1 3.1 0 7 0Z" />
        <path class="cixi-guajian__telemetry-core" d="M7 0H44.5C46.6 0 48 2 47.4 4L42.8 17.7C42.3 19.1 41.5 20 40 20H7C3.1 20 0 16.9 0 13V7C0 3.1 3.1 0 7 0Z" />
      </svg>
      <small>CPU</small>
      <strong :class="`cixi-guajian__value--${cpuYaliLevel}`">{{ cpuUsageText }}</strong>
    </span>
    <span
      class="cixi-guajian__telemetry cixi-guajian__telemetry--memory"
      :class="`cixi-guajian__telemetry--${neicunYaliLevel}`"
    >
      <svg class="cixi-guajian__telemetry-outline" viewBox="0 0 48 20" focusable="false">
        <path class="cixi-guajian__telemetry-glow" d="M8 0H41C44.9 0 48 3.1 48 7V13C48 16.9 44.9 20 41 20H8C6.5 20 5.7 19.1 5.2 17.7L.6 4C0 2 1.4 0 3.5 0H8Z" />
        <path class="cixi-guajian__telemetry-core" d="M8 0H41C44.9 0 48 3.1 48 7V13C48 16.9 44.9 20 41 20H8C6.5 20 5.7 19.1 5.2 17.7L.6 4C0 2 1.4 0 3.5 0H8Z" />
      </svg>
      <small>内存</small>
      <strong :class="`cixi-guajian__value--${neicunYaliLevel}`">{{ neicunUsageText }}</strong>
    </span>
    <span class="cixi-guajian__ground"></span>
    <span class="cixi-guajian__field"></span>
    <span class="cixi-guajian__impact"></span>
  </div>
</template>

<script setup>
import { computed, shallowRef, watch } from 'vue'
import { useIntervalFn } from '@vueuse/core'

const props = defineProps({
  isVisible: { type: Boolean, default: true },
  isMoving: { type: Boolean, default: false },
  isPasting: { type: Boolean, default: false },
})

const systemStatus = shallowRef({ cpu: null, neicun: null })
const yaliThreshold = Object.freeze({ warning: 70, critical: 85 })
const shouldPollSystemStatus = computed(() => props.isVisible && !props.isMoving)
const cpuUsageText = computed(() => geshiUsageValue(systemStatus.value.cpu))
const neicunUsageText = computed(() => geshiUsageValue(systemStatus.value.neicun))
const cpuYaliLevel = computed(() => huoquYaliLevel(systemStatus.value.cpu))
const neicunYaliLevel = computed(() => huoquYaliLevel(systemStatus.value.neicun))
let isSystemStatusReading = false

function geshiUsageValue(value) {
  if (value === null || value === undefined || value === '') return '--'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return '--'
  return `${Math.min(100, Math.max(0, Math.round(numericValue)))}%`
}

// 百分比按压力分级，CPU 与内存标签始终保持白色。
function huoquYaliLevel(value) {
  if (value === null || value === undefined || value === '') return 'unknown'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 'unknown'
  if (numericValue >= yaliThreshold.critical) return 'critical'
  if (numericValue >= yaliThreshold.warning) return 'warning'
  return 'healthy'
}

// 仅在挂件可见时读取系统状态，避免展开与上传期间产生无效 IPC。
async function gengxinSystemStatus() {
  if (!shouldPollSystemStatus.value || isSystemStatusReading) return
  isSystemStatusReading = true
  try {
    const status = await window.aetherDock?.getSystemStatus()
    if (status) systemStatus.value = status
  } catch {
    // 短暂读取失败时保留上一帧数据。
  } finally {
    isSystemStatusReading = false
  }
}

const { pause: pauseSystemStatus, resume: resumeSystemStatus } = useIntervalFn(
  gengxinSystemStatus,
  2500,
  { immediate: false },
)

watch(shouldPollSystemStatus, (shouldPoll) => {
  if (!shouldPoll) {
    pauseSystemStatus()
    return
  }
  void gengxinSystemStatus()
  resumeSystemStatus()
}, { immediate: true })
</script>

<style scoped>
.cixi-guajian {
  position: absolute;
  z-index: 0;
  top: calc(var(--shouqi-y) - 30px);
  left: calc(var(--shouqi-x) - 28px);
  width: 160px;
  height: 174px;
  pointer-events: none;
}

.cixi-guajian__telemetry {
  position: absolute;
  isolation: isolate;
  z-index: 2;
  top: 40px;
  display: grid;
  width: 48px;
  height: 20px;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 3px;
  padding: 0 7px 0 6px;
  color: rgba(225, 233, 228, .9);
  font-variant-numeric: tabular-nums;
  opacity: 1;
  text-rendering: geometricPrecision;
  transition: opacity 150ms ease;
}

.cixi-guajian__telemetry::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, .055), transparent 45%),
    rgba(24, 30, 27, .82);
  box-shadow: inset 0 -1px rgba(6, 9, 8, .18);
  content: '';
}

.cixi-guajian__telemetry::after {
  position: absolute;
  bottom: -3px;
  width: 9px;
  height: 1px;
  background: rgba(105, 121, 113, .34);
  content: '';
  transform-origin: center;
}

.cixi-guajian__telemetry small {
  position: relative;
  z-index: 1;
  color: #fff;
  font: 650 7px/1 var(--font-body);
  letter-spacing: .02em;
  white-space: nowrap;
}

.cixi-guajian__telemetry strong {
  position: relative;
  z-index: 1;
  color: #fff;
  font: 700 9px/1 var(--font-body);
  text-align: right;
  transition: color 220ms ease;
  transform-origin: right center;
  white-space: nowrap;
}

.cixi-guajian__telemetry-outline {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 48px;
  height: 20px;
  overflow: visible;
  color: rgba(219, 230, 224, .16);
  pointer-events: none;
}

.cixi-guajian__telemetry-outline path {
  fill: none;
  stroke: currentcolor;
  stroke-linejoin: round;
  stroke-width: 1.15;
  vector-effect: non-scaling-stroke;
}

.cixi-guajian__telemetry-glow {
  stroke-width: 1.5;
}

.cixi-guajian__telemetry .cixi-guajian__value--healthy {
  color: #06d6a0;
}

.cixi-guajian__telemetry .cixi-guajian__value--warning {
  color: #ffd166;
}

/* 超过阈值时只沿信息底板轮廓发光，内部材质保持不变。 */
.cixi-guajian__telemetry--warning .cixi-guajian__telemetry-outline {
  color: #ffd166;
}

.cixi-guajian__telemetry--warning .cixi-guajian__telemetry-glow {
  animation: cixi-telemetry-outline-warning 2.2s cubic-bezier(.45, 0, .55, 1) infinite;
  will-change: filter, opacity, stroke-width;
}

.cixi-guajian__telemetry .cixi-guajian__value--critical {
  color: #ef476f;
}

.cixi-guajian__telemetry--critical .cixi-guajian__telemetry-outline {
  color: #ef476f;
}

.cixi-guajian__telemetry--critical .cixi-guajian__telemetry-glow {
  animation: cixi-telemetry-outline-critical 1.65s cubic-bezier(.45, 0, .55, 1) infinite;
  will-change: filter, opacity, stroke-width;
}

.cixi-guajian__telemetry--cpu {
  left: 25px;
}

.cixi-guajian__telemetry--cpu::before {
  clip-path: path('M7 0H44.5C46.6 0 48 2 47.4 4L42.8 17.7C42.3 19.1 41.5 20 40 20H7C3.1 20 0 16.9 0 13V7C0 3.1 3.1 0 7 0Z');
}

.cixi-guajian__telemetry--cpu::after {
  right: 2px;
  transform: rotate(30deg);
}

.cixi-guajian__telemetry--memory {
  top: 44px;
  right: 23px;
  padding: 0 6px 0 7px;
}

.cixi-guajian__telemetry--memory::before {
  clip-path: path('M8 0H41C44.9 0 48 3.1 48 7V13C48 16.9 44.9 20 41 20H8C6.5 20 5.7 19.1 5.2 17.7L.6 4C0 2 1.4 0 3.5 0H8Z');
}

.cixi-guajian__telemetry--memory .cixi-guajian__telemetry-glow {
  animation-delay: -.38s;
}

.cixi-guajian__telemetry--memory::after {
  left: 2px;
  transform: rotate(-30deg);
}

.cixi-guajian__ground {
  position: absolute;
  bottom: 22px;
  left: 52px;
  width: 56px;
  height: 13px;
  border-radius: 50%;
  background: rgba(36, 52, 45, .24);
  opacity: .34;
  filter: blur(6px);
  transform: scaleX(1);
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.16, 1, .3, 1);
}

.cixi-guajian__field,
.cixi-guajian__impact {
  position: absolute;
  border-radius: 50%;
  opacity: 0;
}

.cixi-guajian__field {
  top: 20px;
  left: 22px;
  width: 116px;
  height: 116px;
  background:
    radial-gradient(ellipse at 63% 38%, rgba(222, 236, 228, .14), rgba(151, 181, 165, .055) 28%, transparent 51%),
    radial-gradient(ellipse at 41% 66%, rgba(82, 123, 102, .12), rgba(82, 123, 102, .045) 42%, transparent 72%);
  backface-visibility: hidden;
  transform: translateZ(0) scale(.92);
  transition: opacity 180ms ease, transform 240ms cubic-bezier(.16, 1, .3, 1);
}

.cixi-guajian__impact {
  bottom: 20px;
  left: 43px;
  width: 74px;
  height: 18px;
  background: radial-gradient(ellipse, rgba(114, 151, 132, .2), rgba(114, 151, 132, .065) 48%, transparent 74%);
  transform: translateZ(0) scaleX(.58) scaleY(.7);
}

/* 无描边磁场仅通过材质明暗建立纵深，避免产生雷达光圈感。 */
.cixi-guajian--moving .cixi-guajian__ground {
  opacity: .15;
  transform: translateY(2px) scaleX(.68);
}

.cixi-guajian--moving .cixi-guajian__telemetry-glow,
.cixi-guajian--pasting .cixi-guajian__telemetry-glow {
  /* 拖动期间保留最后一次系统状态，仅冻结柔光以减少透明窗口重绘。 */
  animation-play-state: paused;
}

.cixi-guajian--moving .cixi-guajian__field {
  opacity: .72;
  transform: translateZ(0) scale(1);
  will-change: transform, opacity;
}

.cixi-guajian--pasting .cixi-guajian__impact {
  animation: cixi-impact-settle 380ms cubic-bezier(.16, 1, .3, 1) both;
}

.cixi-guajian--pasting .cixi-guajian__ground {
  animation: cixi-ground-settle 420ms cubic-bezier(.16, 1, .3, 1) both;
}

@keyframes cixi-impact-settle {
  0% { opacity: 0; transform: translateZ(0) scaleX(.5) scaleY(.66); }
  36% { opacity: .28; }
  100% { opacity: 0; transform: translateZ(0) scaleX(1.5) scaleY(1.04); }
}

@keyframes cixi-ground-settle {
  0% { opacity: .18; transform: scaleX(.72); }
  58% { opacity: .42; transform: scaleX(1.12) scaleY(.78); }
  100% { opacity: .34; transform: scaleX(1); }
}

@keyframes cixi-telemetry-outline-warning {
  0%, 100% {
    opacity: .12;
    stroke-width: 1.5;
    filter:
      drop-shadow(0 0 1px rgba(117, 56, 0, .38))
      drop-shadow(0 0 3px rgba(36, 18, 0, .28));
  }
  50% {
    opacity: 1;
    stroke-width: 2.4;
    filter:
      drop-shadow(0 0 4px rgba(142, 72, 0, 1))
      drop-shadow(0 0 10px rgba(39, 19, 0, .96));
  }
}

@keyframes cixi-telemetry-outline-critical {
  0%, 100% {
    opacity: .16;
    stroke-width: 1.5;
    filter:
      drop-shadow(0 0 1px rgba(113, 8, 39, .42))
      drop-shadow(0 0 3px rgba(34, 2, 13, .3));
  }
  50% {
    opacity: 1;
    stroke-width: 2.5;
    filter:
      drop-shadow(0 0 4px rgba(139, 13, 49, 1))
      drop-shadow(0 0 10px rgba(38, 2, 15, .98));
  }
}

@keyframes cixi-telemetry-outline-reduced {
  0%, 100% { opacity: .72; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .cixi-guajian__field { transition-duration: 80ms; }

  .cixi-guajian__telemetry--warning .cixi-guajian__telemetry-glow {
    animation: cixi-telemetry-outline-reduced 4.4s ease-in-out infinite;
    filter:
      drop-shadow(0 0 2px rgba(128, 63, 0, .86))
      drop-shadow(0 0 6px rgba(38, 19, 0, .78));
  }

  .cixi-guajian__telemetry--critical .cixi-guajian__telemetry-glow {
    animation: cixi-telemetry-outline-reduced 3.8s ease-in-out infinite;
    filter:
      drop-shadow(0 0 2px rgba(121, 9, 42, .88))
      drop-shadow(0 0 6px rgba(36, 2, 14, .8));
  }

  .cixi-guajian--pasting .cixi-guajian__impact,
  .cixi-guajian--pasting .cixi-guajian__ground {
    animation: none;
  }

  .cixi-guajian--moving .cixi-guajian__field {
    opacity: .48;
    transform: none;
  }
}
</style>
