<template>
  <Transition name="toast-rise">
    <div
      v-if="visible && text"
      class="toast"
      :class="[`toast--${type}`, { 'toast--compact': compact, 'toast--corner': corner, 'toast--embedded': embedded }]"
      role="status"
      aria-live="polite"
    >
      <span class="toast-dot" aria-hidden="true"></span>
      <span class="toast-text">{{ text }}</span>
    </div>
  </Transition>
</template>

<script setup>
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
  font: 500 13px var(--font-body);
  letter-spacing: .04em;
  pointer-events: none;
  white-space: nowrap;
  transform: translateX(-50%);
}

.toast-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; }
.toast--success .toast-dot { background: var(--success); box-shadow: 0 0 7px rgba(99, 254, 19, .42); }
.toast--error .toast-dot { background: var(--danger); }
.toast--info .toast-dot { background: var(--info); }
.toast-text { overflow: hidden; text-overflow: ellipsis; }
.toast--compact { gap: 6px; padding: 5px 11px; font-size: 11px; letter-spacing: .02em; }
.toast--compact .toast-dot { width: 5px; height: 5px; }
.toast--corner { right: 18px; left: auto; transform: none; }
.toast--corner.toast-rise-enter-from { transform: translateY(12px); }
.toast--corner.toast-rise-leave-to { transform: translateY(8px); }
.toast--embedded { bottom: 50%; padding-inline: 8px; border-color: transparent; background: transparent; box-shadow: none; transform: translate(-50%, 50%); }
.toast--embedded.toast-rise-enter-from { transform: translate(-50%, calc(50% + 8px)); }
.toast--embedded.toast-rise-leave-to { transform: translate(-50%, calc(50% - 5px)); }
.toast-rise-enter-active, .toast-rise-leave-active { transition: opacity 220ms ease, transform 320ms var(--motion-easing); }
.toast-rise-enter-from { opacity: 0; transform: translate(-50%, 22px); }
.toast-rise-leave-to { opacity: 0; transform: translate(-50%, 10px); }
</style>
