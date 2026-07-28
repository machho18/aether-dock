<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import maomaoKulianDonghua from './assets/cat-crying.json'
import kaiJiDonghua from './assets/loading.json'

const shifouKaiJiChuangkou = new URLSearchParams(window.location.search).get('startup') === '1'
const shifouZhankai = ref(false)
const lingdongChou = ref(null)
const lottieChou = ref(null)
const kaiJiLottieChou = ref(null)
const dangqianShijian = ref('')
const xitongZhuangtai = ref({ cpu: 0, neicun: 0 })
const shifouTuoru = ref(false)
const shifouKaiJiZhong = ref(shifouKaiJiChuangkou)
let shifouChuantou = true
let bofangqiLottie = null
let bofangqiKaiJi = null
let jishiShijian = null
let jishiZhuangtai = null
let jishiKaiJi = null
let jishiDingwei = null
let cishuTuoru = 0

// 更新收起态中间的本地时间
function gengxinDangqianShijian() {
  dangqianShijian.value = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

// 从主进程读取 CPU 与内存占用
async function gengxinXitongZhuangtai() {
  try {
    const zhuangtai = await window.aetherDock?.getXitongZhuangtai()
    if (zhuangtai) xitongZhuangtai.value = zhuangtai
  } catch {
    // 系统状态读取失败时沿用上一帧数据
  }
}

// 初始化收起态左侧的猫咪动画
onMounted(() => {
  if (!shifouKaiJiChuangkou && lottieChou.value) {
    bofangqiLottie = lottie.loadAnimation({
      container: lottieChou.value,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: maomaoKulianDonghua,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })
  }
  if (shifouKaiJiChuangkou && kaiJiLottieChou.value) {
    bofangqiKaiJi = lottie.loadAnimation({
      container: kaiJiLottieChou.value,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: kaiJiDonghua,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })
    // 将一秒原始动画降速至两秒，形成完整的开机节奏
    bofangqiKaiJi.setSpeed(.5)
    bofangqiKaiJi.addEventListener('complete', wanchengKaiJiDonghua)
  }
  if (!shifouKaiJiChuangkou) {
    gengxinDangqianShijian()
    gengxinXitongZhuangtai()
    jishiShijian = window.setInterval(gengxinDangqianShijian, 1000)
    jishiZhuangtai = window.setInterval(gengxinXitongZhuangtai, 2000)
  } else {
    // 动画资源异常时仍在预期时长后进入灵动岛
    jishiKaiJi = window.setTimeout(wanchengKaiJiDonghua, 2600)
  }
})

// 释放动画实例，避免窗口关闭后残留渲染任务
onUnmounted(() => {
  bofangqiLottie?.destroy()
  bofangqiKaiJi?.destroy()
  window.clearInterval(jishiShijian)
  window.clearInterval(jishiZhuangtai)
  window.clearTimeout(jishiKaiJi)
  window.clearTimeout(jishiDingwei)
})

// 开机动画结束后关闭临时窗口，显示已在顶部预加载的灵动岛
function wanchengKaiJiDonghua() {
  if (!shifouKaiJiZhong.value) return
  shifouKaiJiZhong.value = false
  window.clearTimeout(jishiKaiJi)
  jishiDingwei = window.setTimeout(() => window.aetherDock?.wanchengKaiJi(), 280)
}

// 固定透明安全区内仅切换组件状态，避免原生窗口重设造成跳动
function qiehuanLingdongZhuangtai(shifou) {
  if (shifouTuoru.value) return
  shifouZhankai.value = shifou
}

// 判断当前拖拽内容是否包含本地文件
function shifouTuoruWenjian(shijian) {
  return Array.from(shijian.dataTransfer?.types ?? []).includes('Files')
}

// 进入拖拽范围时切换为上传投放态
function chuliTuoruJinru(shijian) {
  if (!shifouTuoruWenjian(shijian)) return
  shijian.preventDefault()
  cishuTuoru += 1
  shifouTuoru.value = true
  shifouZhankai.value = false
}

// 拖拽经过时声明可投放状态
function chuliTuoruYidong(shijian) {
  if (!shifouTuoruWenjian(shijian)) return
  shijian.preventDefault()
  shijian.dataTransfer.dropEffect = 'copy'
}

// 仅在完全离开灵动岛后恢复默认显示
function chuliTuoruLik(shijian) {
  if (!shifouTuoru.value) return
  shijian.preventDefault()
  cishuTuoru = Math.max(0, cishuTuoru - 1)
  if (cishuTuoru === 0) shifouTuoru.value = false
}

// 当前只提供投放反馈，不保存被放下的文件
function chuliTuoruFangzhi(shijian) {
  if (!shifouTuoru.value) return
  shijian.preventDefault()
  cishuTuoru = 0
  shifouTuoru.value = false
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
    <Transition name="kaiji-danchu">
      <div v-if="shifouKaiJiZhong" class="kaiji-mengban" aria-label="正在启动">
        <div ref="kaiJiLottieChou" class="kaiji-lottie" aria-hidden="true"></div>
      </div>
    </Transition>
    <section
      v-show="!shifouKaiJiZhong && !shifouKaiJiChuangkou"
      class="lingdongchuangkou"
      ref="lingdongChou"
      :class="{ 'lingdongchuangkou--zhankai': shifouZhankai, 'lingdongchuangkou--tuoru': shifouTuoru }"
      aria-label="黑色玻璃灵动窗口"
      tabindex="0"
      @mouseenter="qiehuanLingdongZhuangtai(true)"
      @mouseleave="qiehuanLingdongZhuangtai(false)"
      @dragenter="chuliTuoruJinru"
      @dragover="chuliTuoruYidong"
      @dragleave="chuliTuoruLik"
      @drop="chuliTuoruFangzhi"
      @focus="qiehuanLingdongZhuangtai(true)"
      @blur="qiehuanLingdongZhuangtai(false)"
    >
      <div class="neibu-yingying"></div>
      <!-- 收起态左侧 Lottie 动画 -->
      <div ref="lottieChou" class="maomao-lottie" aria-hidden="true"></div>
      <!-- 收起态时间与系统状态 -->
      <div class="shouqi-xinxi" aria-hidden="true">
        <time class="shouqi-shijian">{{ dangqianShijian }}</time>
        <div class="xitong-zhuangtai">
          <span><b>CPU</b><em>{{ xitongZhuangtai.cpu }}%</em></span>
          <span><b>MEM</b><em>{{ xitongZhuangtai.neicun }}%</em></span>
        </div>
      </div>
      <!-- 文件拖入时显示的上传投放提示 -->
      <div class="tuoru-tishi" aria-hidden="true">
        <span class="tuoru-jiahao">+</span>
        <span>拖放上传</span>
      </div>
    </section>
  </main>
</template>
