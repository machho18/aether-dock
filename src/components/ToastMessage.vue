<template>
  <Transition name="toast-rise">
    <div
      v-if="visible && text"
      class="toast"
      :class="[`toast--${type}`, { 'toast--compact': compact, 'toast--corner': corner, 'toast--embedded': embedded }]"
      :role="type === 'error' ? 'alert' : 'status'"
      :aria-live="type === 'error' ? 'assertive' : 'polite'"
      aria-atomic="true"
    >
      <span v-if="embedded" class="toast-symbol" aria-hidden="true">
        <PhCheck v-if="type === 'success'" :size="10" weight="bold" />
        <PhWarning v-else-if="type === 'error'" :size="10" weight="bold" />
        <PhInfo v-else :size="10" weight="bold" />
      </span>
      <span v-else class="toast-dot" aria-hidden="true"></span>
      <span class="toast-text">{{ text }}</span>
    </div>
  </Transition>
</template>

<script setup>
import { PhCheck, PhInfo, PhWarning } from '@phosphor-icons/vue'

defineProps({
  visible: { type: Boolean, default: false },
  text: { type: String, default: '' },
  type: { type: String, default: 'info' },
  compact: { type: Boolean, default: false },
  corner: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
})
</script>

<style scoped>
.toast {
  position: absolute;
  z-index: 9998;
  bottom: 18px;
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 36px);
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, .14);
  background: rgba(15, 17, 16, .9);
  box-shadow: inset 0 1px rgba(255, 255, 255, .08), 0 8px 22px rgba(15, 17, 16, .32);
  color: var(--text-on-ink);
  font: 500 14px/1.55 var(--font-body);
  letter-spacing: normal;
  pointer-events: none;
  white-space: nowrap;
  transform: translateX(-50%);
}

.toast-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; }
.toast--success .toast-dot { background: var(--success); box-shadow: 0 0 7px rgba(99, 254, 19, .42); }
.toast--error .toast-dot { background: var(--danger); }
.toast--info .toast-dot { background: var(--info); }
.toast-text { overflow: hidden; text-overflow: ellipsis; }
.toast--compact { gap: 6px; padding: 5px 11px; font-size: 11px; letter-spacing: normal; }
.toast--compact .toast-dot { width: 5px; height: 5px; }
.toast--corner { right: 18px; left: auto; transform: none; }
.toast--corner.toast-rise-enter-from { transform: translateY(12px); }
.toast--corner.toast-rise-leave-to { transform: translateY(8px); }
/* 收起态提示采用独立状态标签，避免文字直接叠在动画上产生脏边。 */
.toast--embedded {
  bottom: calc(100% + 8px);
  max-width: 160px;
  min-height: 26px;
  gap: 6px;
  padding: 5px 8px 5px 6px;
  border-color: rgba(255, 255, 255, .13);
  border-radius: 8px;
  background: rgba(25, 30, 27, .92);
  box-shadow: inset 0 1px rgba(255, 255, 255, .08), 0 4px 12px rgba(7, 10, 8, .26);
  color: rgba(244, 248, 244, .94);
  font: 500 11px/1.25 var(--font-body);
  letter-spacing: normal;
  text-shadow: none;
  transform: translate(-50%, 0);
}
.toast--embedded .toast-symbol { display: grid; width: 14px; height: 14px; flex: none; place-items: center; border-radius: 4px; }
.toast--embedded.toast--success .toast-symbol { background: rgba(129, 213, 105, .18); color: #a8e79a; }
.toast--embedded.toast--info .toast-symbol { background: rgba(120, 175, 216, .18); color: #afd5ed; }
.toast--embedded.toast--error .toast-symbol { background: rgba(225, 114, 114, .18); color: #f0a2a2; }
.toast--embedded .toast-text { line-height: 1.25; }
.toast--embedded.toast-rise-enter-from { transform: translate(-50%, 8px); }
.toast--embedded.toast-rise-leave-to { transform: translate(-50%, -5px); }
.toast-rise-enter-active, .toast-rise-leave-active { transition: opacity 220ms ease, transform 320ms var(--motion-easing); }
.toast-rise-enter-from { opacity: 0; transform: translate(-50%, 22px); }
.toast-rise-leave-to { opacity: 0; transform: translate(-50%, 10px); }

@media (prefers-reduced-motion: reduce) {
  .toast-rise-enter-active, .toast-rise-leave-active { transition: none; }
}
</style>
