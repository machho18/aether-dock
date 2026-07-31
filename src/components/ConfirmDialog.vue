<template>
  <Transition name="confirm-fade">
    <div v-if="visible" class="confirm-overlay" @click.self="emit('cancel')">
      <Transition name="confirm-pop" appear>
        <div v-if="visible" class="confirm-card" :class="`confirm-card--${tone}`" role="dialog" aria-modal="true" :aria-labelledby="titleId">
          <div class="confirm-head">
            <span class="confirm-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2" stroke-linecap="round">
                <path d="M12 3 2.5 19a1 1 0 0 0 .86 1.5h17.28A1 1 0 0 0 21.5 19L12 3Z" />
                <path d="M12 9.5v4.2" />
                <circle cx="12" cy="16.4" r=".6" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <h3 :id="titleId" class="confirm-title">{{ title }}</h3>
          </div>
          <p class="confirm-message">{{ message }}</p>
          <p v-if="detail" class="confirm-detail">{{ detail }}</p>
          <div class="confirm-actions">
            <button class="confirm-btn confirm-btn--ghost" type="button" @click="emit('cancel')">{{ cancelText }}</button>
            <button class="confirm-btn confirm-btn--solid" :class="`confirm-btn--${tone}`" type="button" @click="emit('confirm')">{{ confirmText }}</button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup>
import { useId } from 'vue'
import { useEventListener } from '@vueuse/core'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '确认操作' },
  message: { type: String, default: '' },
  detail: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  tone: { type: String, default: 'default' },
})

const emit = defineEmits(['confirm', 'cancel'])
const titleId = `confirm-${useId()}`

// 键盘确认与取消由组件统一处理，并由 VueUse 自动清理监听器。
useEventListener(window, 'keydown', (event) => {
  if (!props.visible || !['Escape', 'Enter'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  emit(event.key === 'Enter' ? 'confirm' : 'cancel')
}, { capture: true })
</script>

<style scoped>
.confirm-overlay {
  position: absolute;
  z-index: 9999;
  inset: 0;
  display: grid;
  padding: 24px;
  place-items: center;
  overflow: hidden;
  border-radius: inherit;
  background: radial-gradient(ellipse at 50% 38%, rgba(38, 38, 38, .38), rgba(15, 17, 16, .72));
  backdrop-filter: blur(10px) saturate(.8);
  -webkit-backdrop-filter: blur(10px) saturate(.8);
}

.confirm-card {
  width: min(360px, calc(100% - 48px));
  padding: 22px 24px 20px;
  border: 1px solid rgba(99, 254, 19, .42);
  border-radius: 22px;
  background: radial-gradient(ellipse at 50% 0%, rgba(99, 254, 19, .12), transparent 55%), linear-gradient(155deg, rgba(38, 40, 39, .98), rgba(15, 17, 16, .99) 62%, rgba(27, 30, 28, .98));
  box-shadow: 0 0 0 1px rgba(15, 17, 16, .9), 0 0 0 4px rgba(99, 254, 19, .08), inset 0 1px rgba(255, 255, 255, .18), inset 0 -16px 26px rgba(0, 0, 0, .36), 0 24px 60px rgba(0, 0, 0, .48);
}

.confirm-card--danger {
  border-color: rgba(232, 93, 93, .62);
  background: radial-gradient(ellipse at 50% 0%, rgba(232, 93, 93, .2), transparent 55%), linear-gradient(155deg, rgba(42, 29, 30, .98), rgba(18, 13, 13, .99) 62%, rgba(34, 20, 21, .98));
  box-shadow: 0 0 0 1px rgba(24, 12, 13, .9), 0 0 0 4px rgba(232, 93, 93, .12), inset 0 1px rgba(255, 220, 220, .18), inset 0 -16px 26px rgba(0, 0, 0, .38), 0 24px 60px rgba(0, 0, 0, .5);
}

.confirm-head { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; }
.confirm-icon { display: grid; width: 30px; height: 30px; flex: none; place-items: center; border: 1px solid rgba(99, 254, 19, .34); border-radius: 9px; color: var(--accent); }
.confirm-card--danger .confirm-icon { border-color: rgba(232, 93, 93, .48); color: var(--danger); }
.confirm-icon svg { width: 17px; height: 17px; }
.confirm-title { margin: 0; color: var(--text-on-ink); font: 600 17px var(--font-display); letter-spacing: .04em; }
.confirm-message { margin: 0 0 6px; color: rgba(245, 245, 245, .9); font: 500 14px/1.55 var(--font-body); }
.confirm-detail { margin: 0 0 18px; color: var(--text-on-ink-muted); font: 12px/1.55 var(--font-mono); white-space: pre-wrap; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }

.confirm-btn {
  min-width: 78px;
  padding: 9px 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  color: var(--text-on-ink);
  font: 600 14px var(--font-display);
  letter-spacing: .06em;
  transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 160ms var(--motion-easing);
}

.confirm-btn--ghost { border-color: rgba(255, 255, 255, .18); background: rgba(255, 255, 255, .04); color: var(--text-on-ink-muted); }
.confirm-btn--ghost:hover { border-color: rgba(255, 255, 255, .34); background: rgba(255, 255, 255, .08); }
.confirm-btn--solid { border-color: rgba(99, 254, 19, .72); background: linear-gradient(145deg, var(--accent-soft), var(--accent)); color: var(--ink-deep); box-shadow: inset 0 1px rgba(255, 255, 255, .38), 0 6px 16px rgba(33, 140, 0, .28); }
.confirm-btn--default:hover { transform: translateY(-1px); box-shadow: inset 0 1px rgba(255, 255, 255, .48), 0 8px 20px rgba(33, 140, 0, .38); }
.confirm-btn--danger { border-color: rgba(232, 93, 93, .7); background: linear-gradient(145deg, var(--danger), var(--danger-deep)); color: rgba(255, 245, 245, .98); box-shadow: inset 0 1px rgba(255, 200, 200, .3), 0 6px 16px rgba(182, 50, 50, .34); }
.confirm-btn--danger:hover { transform: translateY(-1px); box-shadow: inset 0 1px rgba(255, 200, 200, .36), 0 8px 20px rgba(182, 50, 50, .44); }
.confirm-fade-enter-active, .confirm-fade-leave-active { transition: opacity 220ms ease; }
.confirm-fade-enter-from, .confirm-fade-leave-to { opacity: 0; }
.confirm-pop-enter-active, .confirm-pop-leave-active { transition: opacity 240ms ease, transform 320ms var(--motion-easing); }
.confirm-pop-enter-from, .confirm-pop-leave-to { opacity: 0; transform: translateY(10px) scale(.96); }
</style>
