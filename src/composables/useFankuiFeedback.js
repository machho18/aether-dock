import { shallowRef } from 'vue'
import { useTimeoutFn } from '@vueuse/core'

const chushiConfirm = {
  visible: false,
  title: '确认操作',
  message: '',
  detail: '',
  confirmText: '确定',
  alternativeText: '',
  cancelText: '取消',
  showAlternative: false,
  showCancel: true,
  compact: false,
  tone: 'default',
}

// 统一管理轻提示与确认操作，避免页面组件重复维护定时器和回调。
export function useFankuiFeedback() {
  const toastState = shallowRef({ visible: false, text: '', type: 'info' })
  const confirmState = shallowRef({ ...chushiConfirm })
  let pendingAction = null
  let pendingAlternativeAction = null

  const { start: chongqiToastTimer, stop: tingzhiToastTimer } = useTimeoutFn(
    () => {
      toastState.value = { ...toastState.value, visible: false }
    },
    2400,
    { immediate: false },
  )

  function xianshiToast(text, type = 'info') {
    tingzhiToastTimer()
    toastState.value = { visible: true, text, type }
    chongqiToastTimer()
  }

  function qingqiuConfirm(options, action, alternativeAction) {
    confirmState.value = {
      ...chushiConfirm,
      ...options,
      visible: true,
    }
    pendingAction = action ?? null
    pendingAlternativeAction = alternativeAction ?? null
  }

  function guanbiConfirm() {
    confirmState.value = { ...confirmState.value, visible: false }
    pendingAction = null
    pendingAlternativeAction = null
  }

  async function querenAction() {
    confirmState.value = { ...confirmState.value, visible: false }
    const action = pendingAction
    pendingAction = null
    pendingAlternativeAction = null
    await action?.()
  }

  async function zhixingAlternativeAction() {
    confirmState.value = { ...confirmState.value, visible: false }
    const action = pendingAlternativeAction
    pendingAction = null
    pendingAlternativeAction = null
    await action?.()
  }

  return {
    toastState,
    confirmState,
    xianshiToast,
    qingqiuConfirm,
    guanbiConfirm,
    querenAction,
    zhixingAlternativeAction,
  }
}
