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
  background: radial-gradient(ellipse at 50% 38%, rgba(4, 12, 16, .58), rgba(0, 0, 0, .82));
  backdrop-filter: blur(8px) saturate(.7);
  -webkit-backdrop-filter: blur(8px) saturate(.7);
}

.confirm-card {
  width: min(360px, calc(100% - 48px));
  padding: 22px 24px 20px;
  border: 1px solid rgba(221, 244, 255, .42);
  border-radius: 22px;
  background: radial-gradient(ellipse at 50% 0%, rgba(112, 176, 199, .16), transparent 55%), linear-gradient(155deg, rgba(19, 31, 38, .97), rgba(3, 9, 13, .985) 60%, rgba(10, 22, 28, .97));
  box-shadow: 0 0 0 1px rgba(6, 16, 20, .9), 0 0 0 4px rgba(101, 169, 191, .12), inset 0 1px rgba(244, 254, 255, .26), inset 0 -16px 26px rgba(0, 0, 0, .42), 0 24px 60px rgba(0, 0, 0, .6);
}

.confirm-card--danger {
  border-color: rgba(255, 142, 142, .52);
  background: radial-gradient(ellipse at 50% 0%, rgba(214, 78, 78, .22), transparent 55%), linear-gradient(155deg, rgba(34, 22, 24, .97), rgba(10, 6, 7, .985) 60%, rgba(26, 14, 16, .97));
  box-shadow: 0 0 0 1px rgba(18, 8, 9, .9), 0 0 0 4px rgba(214, 78, 78, .14), inset 0 1px rgba(255, 220, 220, .22), inset 0 -16px 26px rgba(0, 0, 0, .42), 0 24px 60px rgba(0, 0, 0, .6);
}

.confirm-head { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; }
.confirm-icon { display: grid; width: 30px; height: 30px; flex: none; place-items: center; border: 1px solid rgba(221, 244, 255, .28); border-radius: 9px; color: rgba(186, 226, 236, .86); }
.confirm-card--danger .confirm-icon { border-color: rgba(255, 168, 168, .42); color: rgba(255, 124, 124, .96); }
.confirm-icon svg { width: 17px; height: 17px; }
.confirm-title { margin: 0; color: rgba(244, 251, 253, .96); font: 600 16px "Bahnschrift", "Microsoft YaHei UI", sans-serif; letter-spacing: .04em; }
.confirm-message { margin: 0 0 6px; color: rgba(228, 240, 244, .9); font: 500 13px/1.55 "Microsoft YaHei UI", sans-serif; }
.confirm-detail { margin: 0 0 18px; color: rgba(176, 202, 210, .6); font: 11px/1.55 "Cascadia Code", "Microsoft YaHei UI", monospace; white-space: pre-wrap; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }

.confirm-btn {
  min-width: 78px;
  padding: 9px 16px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  color: rgba(245, 252, 255, .98);
  font: 600 13px "Bahnschrift", "Microsoft YaHei UI", sans-serif;
  letter-spacing: .06em;
  transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 160ms var(--motion-easing);
}

.confirm-btn--ghost { border-color: rgba(221, 244, 255, .22); background: rgba(221, 244, 255, .04); color: rgba(214, 236, 242, .82); }
.confirm-btn--ghost:hover { border-color: rgba(221, 244, 255, .42); background: rgba(221, 244, 255, .08); }
.confirm-btn--solid { border-color: rgba(101, 169, 191, .5); background: linear-gradient(145deg, rgba(96, 175, 202, .82), rgba(54, 120, 144, .9)); color: rgba(245, 252, 255, .98); box-shadow: inset 0 1px rgba(255, 255, 255, .28), 0 6px 16px rgba(45, 110, 132, .36); }
.confirm-btn--default:hover { transform: translateY(-1px); box-shadow: inset 0 1px rgba(255, 255, 255, .34), 0 8px 20px rgba(45, 110, 132, .46); }
.confirm-btn--danger { border-color: rgba(214, 78, 78, .62); background: linear-gradient(145deg, rgba(224, 92, 92, .9), rgba(176, 44, 44, .94)); color: rgba(255, 245, 245, .98); box-shadow: inset 0 1px rgba(255, 200, 200, .3), 0 6px 16px rgba(176, 40, 40, .4); }
.confirm-btn--danger:hover { transform: translateY(-1px); box-shadow: inset 0 1px rgba(255, 200, 200, .36), 0 8px 20px rgba(176, 40, 40, .5); }
.confirm-fade-enter-active, .confirm-fade-leave-active { transition: opacity 220ms ease; }
.confirm-fade-enter-from, .confirm-fade-leave-to { opacity: 0; }
.confirm-pop-enter-active, .confirm-pop-leave-active { transition: opacity 240ms ease, transform 320ms var(--motion-easing); }
.confirm-pop-enter-from, .confirm-pop-leave-to { opacity: 0; transform: translateY(10px) scale(.96); }
</style>
