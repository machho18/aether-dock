<script setup>
import { ref } from 'vue'

const shifouZhankai = ref(false)
const lingdongChou = ref(null)
let shifouChuantou = true

// 固定透明安全区内仅切换组件状态，避免原生窗口重设造成跳动
function qiehuanLingdongZhuangtai(shifou) {
  shifouZhankai.value = shifou
}

// 仅在鼠标落在灵动岛轮廓内时拦截点击，其余安全区保持穿透
function gengxinShubiaoChuantou(shijian) {
  const rect = lingdongChou.value?.getBoundingClientRect()
  if (!rect) return

  const shifouZaiLingdongDao = shijian.clientX >= rect.left && shijian.clientX <= rect.right
    && shijian.clientY >= rect.top && shijian.clientY <= rect.bottom
  const mubiaoChuantou = !shifouZaiLingdongDao

  if (mubiaoChuantou === shifouChuantou) return
  shifouChuantou = mubiaoChuantou
  window.aetherDock?.setLingdongChuantou(mubiaoChuantou)
}

function huiFuShubiaoChuantou() {
  if (shifouChuantou) return
  shifouChuantou = true
  window.aetherDock?.setLingdongChuantou(true)
}

</script>

<template>
  <main class="wuye" @mousemove="gengxinShubiaoChuantou" @mouseleave="huiFuShubiaoChuantou">
    <!-- 黑色玻璃灵动窗口 -->
    <section
      class="lingdongchuangkou"
      ref="lingdongChou"
      :class="{ 'lingdongchuangkou--zhankai': shifouZhankai }"
      aria-label="黑色玻璃灵动窗口"
      tabindex="0"
      @mouseenter="qiehuanLingdongZhuangtai(true)"
      @mouseleave="qiehuanLingdongZhuangtai(false)"
      @focus="qiehuanLingdongZhuangtai(true)"
      @blur="qiehuanLingdongZhuangtai(false)"
    >
      <div class="neibu-yingying"></div>
    </section>
  </main>
</template>
