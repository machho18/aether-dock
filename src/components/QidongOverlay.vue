<template>
  <Transition name="startup-fade">
    <div class="startup-overlay" aria-label="正在启动">
      <div ref="lottieHolder" class="startup-lottie" aria-hidden="true"></div>
    </div>
  </Transition>
</template>

<script setup>
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import startupAnimation from '@/assets/loading.json'

const lottieHolder = useTemplateRef('lottieHolder')
let lottiePlayer = null

onMounted(() => {
  lottiePlayer = lottie.loadAnimation({
    container: lottieHolder.value,
    renderer: 'svg',
    // 宠物首帧就绪前持续播放，避免启动期间出现空白窗口。
    loop: true,
    autoplay: true,
    animationData: startupAnimation,
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  })
  lottiePlayer.setSpeed(1)
})

onUnmounted(() => lottiePlayer?.destroy())
</script>

<style scoped>
.startup-overlay {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  pointer-events: none;
}

.startup-lottie {
  width: min(332px, calc(100vw - 28px));
  aspect-ratio: 16 / 9;
}

.startup-fade-leave-active {
  transition: opacity 280ms ease, transform 280ms ease;
}

.startup-fade-leave-to {
  opacity: 0;
  transform: scale(.96);
}
</style>
