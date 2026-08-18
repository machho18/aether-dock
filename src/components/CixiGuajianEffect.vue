<template>
  <div
    class="cixi-guajian"
    :class="{
      'cixi-guajian--moving': props.isMoving,
      'cixi-guajian--pasting': props.isPasting,
    }"
    aria-hidden="true"
  >
    <span class="cixi-guajian__telemetry cixi-guajian__telemetry--cpu">
      <small>CPU</small>
      <strong>{{ cpuUsageText }}</strong>
    </span>
    <span class="cixi-guajian__telemetry cixi-guajian__telemetry--memory">
      <small>内存</small>
      <strong>{{ neicunUsageText }}</strong>
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
const shouldPollSystemStatus = computed(() => props.isVisible && !props.isMoving)
const cpuUsageText = computed(() => geshiUsageValue(systemStatus.value.cpu))
const neicunUsageText = computed(() => geshiUsageValue(systemStatus.value.neicun))
let isSystemStatusReading = false

function geshiUsageValue(value) {
  if (value === null || value === undefined || value === '') return '--'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return '--'
  return `${Math.min(100, Math.max(0, Math.round(numericValue)))}%`
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
  opacity: .9;
  transition: opacity 150ms ease;
}

.cixi-guajian__telemetry::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  border: 1px solid rgba(219, 230, 224, .11);
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
  color: rgba(177, 191, 183, .74);
  font: 650 7px/1 var(--font-body);
  letter-spacing: .02em;
  white-space: nowrap;
}

.cixi-guajian__telemetry strong {
  color: rgba(242, 225, 210, .98);
  font: 700 9px/1 var(--font-body);
  text-align: right;
  white-space: nowrap;
}

.cixi-guajian__telemetry--cpu {
  left: 25px;
  animation: cixi-telemetry-drift-left 7.4s steps(4, jump-none) infinite alternate;
}

.cixi-guajian__telemetry--cpu::before {
  border-radius: 7px 3px 3px 7px;
  clip-path: polygon(0 0, 100% 0, 87% 100%, 0 100%);
}

.cixi-guajian__telemetry--cpu::after {
  right: 2px;
  transform: rotate(30deg);
}

.cixi-guajian__telemetry--memory {
  top: 44px;
  right: 23px;
  padding: 0 6px 0 7px;
  animation: cixi-telemetry-drift-right 8.2s steps(4, jump-none) infinite alternate;
}

.cixi-guajian__telemetry--memory::before {
  border-radius: 3px 7px 7px 3px;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 13% 100%);
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

.cixi-guajian--moving .cixi-guajian__telemetry,
.cixi-guajian--pasting .cixi-guajian__telemetry {
  /* 拖动期间保留最后一次系统状态，仅冻结漂浮以减少透明窗口重绘。 */
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

@keyframes cixi-telemetry-drift-left {
  from { transform: translate3d(-1px, 0, 0); }
  to { transform: translate3d(2px, 0, 0); }
}

@keyframes cixi-telemetry-drift-right {
  from { transform: translate3d(1px, 0, 0); }
  to { transform: translate3d(-2px, 0, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .cixi-guajian__field { transition-duration: 80ms; }

  .cixi-guajian__telemetry { animation: none; }

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
