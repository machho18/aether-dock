<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import maomaoKulianDonghua from './assets/cat-crying.json'
import maomaoDaxiaoDonghua from './assets/cat-laughing.json'
import maomaoAixinDonghua from './assets/cat-loving.json'
import kaiJiDonghua from './assets/loading.json'
import sousuoJingtu from './assets/icons/sousuo-lens.svg'
import shezhiTuBiao from './assets/icons/shezhi-orbit.svg'
import wenjianjiaTuBiao from './assets/icons/wenjian-folder.svg'
import tupianjiaTuBiao from './assets/icons/tupian-folder.svg'
import wangzhiTuBiao from './assets/icons/wangzhi-link.svg'
import docTuBiao from './assets/icons/doc.svg'
import pdfTuBiao from './assets/icons/pdf.svg'
import xlsTuBiao from './assets/icons/xls.svg'
import wendangTuBiao from './assets/icons/wendang.svg'
import tupianTuBiao from './assets/icons/tupian.svg'
import dingweTuBiao from './assets/icons/dingwei-target.svg'

const shifouKaiJiChuangkou = new URLSearchParams(window.location.search).get('startup') === '1'
const shifouZhankai = ref(false)
const lingdongChou = ref(null)
const lottieChou = ref(null)
const kaiJiLottieChou = ref(null)
const dangqianShijian = ref('')
const xitongZhuangtai = ref({ cpu: 0, neicun: 0 })
const shifouTuoru = ref(false)
const shifouKaiJiZhong = ref(shifouKaiJiChuangkou)
const sousuoGuanjianzi = ref('')
const dangqianFenlei = ref('wenjian')
const fenleiBiao = ['wenjian', 'tupian', 'wangzhi']
const qiehuanFangxiang = ref(1)
const ziliaokuTiaomu = ref([])
const ziliaokuPeizhi = ref({ genMulu: '', kuId: '' })
const ziliaokuFankui = ref('')
const yulanShibai = ref(new Set())
const shifouYinruZhong = ref(false)
const dangqianYemian = ref('ziliaoku')
const dangqianShouqiDonghua = ref('kulian')
const ziliaokuLunboIndex = ref(0)
const ziliaokuShujiZhengzaituodong = ref(false)
const kulianYulanChou = ref(null)
const daxiaoYulanChou = ref(null)
const aixinYulanChou = ref(null)
const donghuaLiebiao = [
  { id: 'kulian', mingcheng: '委屈', shuoming: '安静陪伴', shuju: maomaoKulianDonghua, chou: kulianYulanChou },
  { id: 'daxiao', mingcheng: '大笑', shuoming: '元气回应', shuju: maomaoDaxiaoDonghua, chou: daxiaoYulanChou },
  { id: 'aixin', mingcheng: '心动', shuoming: '温柔问候', shuju: maomaoAixinDonghua, chou: aixinYulanChou },
]
let shifouChuantou = true
let bofangqiLottie = null
let bofangqiKaiJi = null
let bofangqiYulan = []
let jishiShijian = null
let jishiZhuangtai = null
let jishiKaiJi = null
let jishiDingwei = null

const dangqianTiaomu = computed(() => {
  const leixingYingshe = { wenjian: 'document', tupian: 'image', wangzhi: 'url' }
  const guanjianzi = sousuoGuanjianzi.value.trim().toLowerCase()
  return ziliaokuTiaomu.value.filter((tiaomu) => {
    if (tiaomu.type !== leixingYingshe[dangqianFenlei.value]) return false
    if (!guanjianzi) return true
    return [tiaomu.title, tiaomu.sourcePath, tiaomu.sourceUrl].filter(Boolean)
      .some((wenben) => wenben.toLowerCase().includes(guanjianzi))
  })
})


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

// 读取资料库配置与当前分类条目
async function duquZiliaoku() {
  try {
    const [peizhi, tiaomu, donghua] = await Promise.all([
      window.aetherDock?.duquZiliaokuPeizhi(),
      window.aetherDock?.duquZiliaokuTiaomu(),
      window.aetherDock?.duquShouqiDonghua(),
    ])
    if (peizhi) ziliaokuPeizhi.value = peizhi
    if (tiaomu) ziliaokuTiaomu.value = tiaomu
    if (donghua) dangqianShouqiDonghua.value = donghua
  } catch {
    ziliaokuFankui.value = '资料库暂时不可用'
  }
}

// 重新挂载收起态 Lottie，切换偏好后立即反映在灵动岛上
function chushihuaShouqiDonghua() {
  bofangqiLottie?.destroy()
  const donghua = donghuaLiebiao.find((tiaomu) => tiaomu.id === dangqianShouqiDonghua.value)
  if (!donghua || !lottieChou.value) return
  bofangqiLottie = lottie.loadAnimation({
    container: lottieChou.value,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: structuredClone(donghua.shuju),
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  })
}

// 设置页展示三个可选动画的实时预览，离开页面时及时销毁播放器
function chushihuaDonghuaYulan() {
  bofangqiYulan.forEach((bofangqi) => bofangqi.destroy())
  bofangqiYulan = donghuaLiebiao.flatMap((donghua) => {
    if (!donghua.chou.value) return []
    return [lottie.loadAnimation({
      container: donghua.chou.value,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: structuredClone(donghua.shuju),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })]
  })
}

function qingliDonghuaYulan() {
  bofangqiYulan.forEach((bofangqi) => bofangqi.destroy())
  bofangqiYulan = []
}

// 打开独立设置页，预览播放器由可见状态监听统一管理
function dakaiShezhiYemian() {
  dangqianYemian.value = 'shezhi'
}

function fanhuiZiliaokuYemian() {
  dangqianYemian.value = 'ziliaoku'
}

// 保存收起态动画偏好，并立即更新当前灵动岛
async function xuanzeShouqiDonghua(donghua) {
  try {
    const jieguo = await window.aetherDock?.sheZhiShouqiDonghua(donghua)
    if (!jieguo) return
    dangqianShouqiDonghua.value = jieguo
  } catch {
    ziliaokuFankui.value = '动画设置未保存'
  }
}

watch(dangqianShouqiDonghua, () => {
  if (!shifouKaiJiChuangkou) chushihuaShouqiDonghua()
})

watch(dangqianTiaomu, () => {
  ziliaokuLunboIndex.value = 0
}, { flush: 'post' })

// 计算 3D 轮播中每个可见卡片的偏移与变换
const lunboKapian = computed(() => {
  const liebiao = dangqianTiaomu.value
  const zhongxin = ziliaokuLunboIndex.value
  return liebiao.map((tiaomu, index) => {
    const pianyi = index - zhongxin
    return { tiaomu, pianyi, index }
  })
})

function kapianXinxi(tiaomu) {
  const wenben = (tiaomu.title || tiaomu.sourcePath || '').toLowerCase()
  let leixing = tiaomu.type === 'image' ? 'IMG' : tiaomu.type === 'url' ? 'URL' : 'DOC'
  let tubiao = ''
  let yulan = ''
  if (tiaomu.type === 'image') {
    leixing = 'IMG'
    // 图片条目优先用真实预览，加载失败或文件缺失时回退到通用图片图标
    if (tiaomu.status !== 'missing' && !yulanShibai.value.has(tiaomu.id)) {
      yulan = `aetherdock-img://${tiaomu.id}`
    } else {
      tubiao = tupianTuBiao
    }
  } else if (wenben.endsWith('.pdf')) {
    tubiao = pdfTuBiao
    leixing = 'PDF'
  } else if (wenben.endsWith('.xls') || wenben.endsWith('.xlsx')) {
    tubiao = xlsTuBiao
    leixing = 'XLS'
  } else if (wenben.endsWith('.doc') || wenben.endsWith('.docx')) {
    tubiao = docTuBiao
    leixing = 'DOC'
  } else {
    tubiao = wendangTuBiao
    leixing = 'FILE'
  }
  return {
    leixing,
    tubiao,
    yulan,
  }
}

// 卡片标题仅展示文件主名，网址条目则保留完整标题
function kapianMingcheng(tiaomu) {
  const biaoti = tiaomu.title || '未命名资料'
  return tiaomu.type === 'url' ? biaoti : biaoti.replace(/\.[^./\\]+$/, '')
}

// 卡片展示条目归档时间，未记录时回退为空串
function kapianShijian(tiaomu) {
  if (!tiaomu.createdAt) return ''
  const d = new Date(tiaomu.createdAt)
  const yue = String(d.getMonth() + 1).padStart(2, '0')
  const ri = String(d.getDate()).padStart(2, '0')
  const shi = String(d.getHours()).padStart(2, '0')
  const fen = String(d.getMinutes()).padStart(2, '0')
  return `${yue}/${ri} ${shi}:${fen}`
}

function lunboXiang(index) {
  if (index < 0 || index >= dangqianTiaomu.value.length) return
  ziliaokuLunboIndex.value = index
}

function shangyiZhang() {
  lunboXiang(ziliaokuLunboIndex.value - 1)
}

function xiayiZhang() {
  lunboXiang(ziliaokuLunboIndex.value + 1)
}

function chulishujiJianpan(shijian) {
  if (!shifouZhankai.value || shifouTuoru.value || dangqianYemian.value !== 'ziliaoku') return
  if (shijian.key === 'ArrowLeft') {
    shijian.preventDefault()
    shangyiZhang()
  } else if (shijian.key === 'ArrowRight') {
    shijian.preventDefault()
    xiayiZhang()
  }
}

function chulishujiGunlun(shijian) {
  if (ziliaokuShujiZhengzaituodong.value || !dangqianTiaomu.value.length) return
  if (shijian.deltaY > 0) xiayiZhang()
  else if (shijian.deltaY < 0) shangyiZhang()
}

function shujiKaishituodong() {
  ziliaokuShujiZhengzaituodong.value = true
}

function shujiJieshutuodong() {
  window.setTimeout(() => { ziliaokuShujiZhengzaituodong.value = false }, 50)
}

function kapianYangshi(pianyi) {
  const jianju = 184
  const juli = Math.abs(pianyi)
  const fangxiang = pianyi < 0 ? 1 : -1
  const jiaodu = pianyi === 0 ? 0 : fangxiang * Math.min(32 + juli * 12, 62)
  const shen = -juli * 55
  const suo = Math.max(1 - juli * 0.12, 0.72)
  const touming = Math.max(1 - juli * 0.22, 0.45)
  const z = 10 - juli
  return {
    transform: `translateX(calc(-50% + ${pianyi * jianju}px)) translateZ(${shen}px) rotateY(${jiaodu}deg) scale(${suo})`,
    opacity: touming,
    zIndex: z,
    pointerEvents: juli <= 2 ? 'auto' : 'none',
  }
}

// 页面进入阶段容器已挂载但仍处于透明起始帧，预先渲染可避免动画晚到闪现
async function chuliYemianJinru() {
  await nextTick()
  if (dangqianYemian.value === 'shezhi' && shifouZhankai.value && !shifouTuoru.value) chushihuaDonghuaYulan()
}

// 页面离开前释放播放器，避免它继续持有已卸载的 DOM 容器
function chuliYemianLik() {
  qingliDonghuaYulan()
}

// 选择资料库根目录，首次导入前只需执行一次
async function xuanzeZiliaokuGenmulu() {
  const jieguo = await window.aetherDock?.xuanzeZiliaokuGenmulu()
  if (jieguo?.quxiao) return false
  if (jieguo?.peizhi) {
    ziliaokuPeizhi.value = jieguo.peizhi
    ziliaokuFankui.value = '资料库目录已设置'
    return true
  }
  return false
}

// 未配置资料库时在首次导入前请求一次目录选择
async function quebaoZiliaoku() {
  if (ziliaokuPeizhi.value.genMulu) return true
  return xuanzeZiliaokuGenmulu()
}

// 打开条目并将主进程返回的失败信息反馈给用户
async function dakaiZiliaokuTiaomu(tiaomu) {
  if (tiaomu.status === 'missing') {
    ziliaokuFankui.value = '来源文件已不可用'
    return
  }
  const jieguo = await window.aetherDock?.dakaiZiliaokuTiaomu(tiaomu.id)
  ziliaokuFankui.value = jieguo?.chenggong ? '' : (jieguo?.xiaoxi || '打开失败')
}

function dingweZiliaokuTiaomu(tiaomu) {
  window.aetherDock?.dingweZiliaokuTiaomu(tiaomu.id)
}

// 删除卡片：主进程弹出原生确认框，确认后删除数据库记录与本地文件，成功后从本地列表移除
async function shanchuZiliaokuTiaomu(tiaomu) {
  try {
    const jieguo = await window.aetherDock?.shanchuZiliaokuTiaomu(tiaomu.id)
    if (jieguo?.quxiao) return
    if (!jieguo?.chenggong) {
      ziliaokuFankui.value = jieguo?.xiaoxi || '删除失败'
      return
    }
    ziliaokuTiaomu.value = ziliaokuTiaomu.value.filter((xiang) => xiang.id !== tiaomu.id)
    yulanShibai.value.delete(tiaomu.id)
    ziliaokuFankui.value = '已删除'
  } catch {
    ziliaokuFankui.value = '删除失败'
  }
}

// 初始化收起态左侧的猫咪动画
onMounted(() => {
  if (!shifouKaiJiChuangkou && lottieChou.value) {
    chushihuaShouqiDonghua()
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
    duquZiliaoku()
    jishiShijian = window.setInterval(gengxinDangqianShijian, 1000)
    jishiZhuangtai = window.setInterval(gengxinXitongZhuangtai, 2000)
    window.addEventListener('blur', qingliTuoruZhuangtai)
    window.addEventListener('keydown', chulishujiJianpan)
  } else {
    // 动画资源异常时仍在预期时长后进入灵动岛
    jishiKaiJi = window.setTimeout(wanchengKaiJiDonghua, 2600)
  }
})

// 释放动画实例，避免窗口关闭后残留渲染任务
onUnmounted(() => {
  bofangqiLottie?.destroy()
  bofangqiKaiJi?.destroy()
  qingliDonghuaYulan()
  window.clearInterval(jishiShijian)
  window.clearInterval(jishiZhuangtai)
  window.clearTimeout(jishiKaiJi)
  window.clearTimeout(jishiDingwei)
  window.removeEventListener('blur', qingliTuoruZhuangtai)
  window.removeEventListener('keydown', chulishujiJianpan)
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

// 鼠标进入主体时立即关闭穿透，确保首击直接交给内部控件
function guanbiShubiaoChuantou() {
  if (!shifouChuantou) return
  shifouChuantou = false
  window.aetherDock?.setLingdongChuantou(false)
}

// 收起与展开状态均由主体边界统一切换鼠标接收能力
function chuliLingdongJinru() {
  guanbiShubiaoChuantou()
  qiehuanLingdongZhuangtai(true)
}

function chuliLingdongLik() {
  if (shifouTuoru.value) qingliTuoruZhuangtai()
  qiehuanLingdongZhuangtai(false)
  huiFuShubiaoChuantou()
}

// 切换展开态中当前高亮的文件夹
function xuanzeFenlei(fenlei) {
  const jiuIndex = fenleiBiao.indexOf(dangqianFenlei.value)
  const xinIndex = fenleiBiao.indexOf(fenlei)
  // 以分类左右次序决定滑入方向：正向(→)新内容从右进、旧内容向左出；反向(←)则相反
  qiehuanFangxiang.value = xinIndex >= jiuIndex ? 1 : -1
  dangqianFenlei.value = fenlei
}

// 判断当前拖拽是否包含本地文件或浏览器提供的网址数据
function shifouTuoruNeirong(shijian) {
  const leixing = Array.from(shijian.dataTransfer?.types ?? [])
  return leixing.includes('Files') || leixing.includes('text/uri-list') || leixing.includes('text/plain')
}

// 从拖放数据中提取可收藏的网址，忽略 URI 列表中的注释行
function tiquTuoruWangzhi(shujuzhuanYi) {
  const yuanwen = shujuzhuanYi.getData('text/uri-list') || shujuzhuanYi.getData('text/plain')
  return yuanwen.split(/\r?\n/).map((hang) => hang.trim()).filter((hang) => hang && !hang.startsWith('#'))
}

// 进入拖拽范围时切换为上传投放态
function chuliTuoruJinru(shijian) {
  if (!shifouTuoruNeirong(shijian)) return
  shijian.preventDefault()
  shifouTuoru.value = true
  shifouZhankai.value = false
}

// 拖拽经过时声明可投放状态
function chuliTuoruYidong(shijian) {
  if (!shifouTuoruNeirong(shijian)) return
  shijian.preventDefault()
  shijian.dataTransfer.dropEffect = 'copy'
}

// 拖拽离开真实边界时立即清理投放状态，避免子节点事件造成计数残留
function chuliTuoruLik(shijian) {
  if (!shifouTuoru.value) return
  shijian.preventDefault()
  const rect = lingdongChou.value?.getBoundingClientRect()
  const rengzaiBianjieNei = rect
    && shijian.clientX >= rect.left
    && shijian.clientX <= rect.right
    && shijian.clientY >= rect.top
    && shijian.clientY <= rect.bottom
  if (!rengzaiBianjieNei) qingliTuoruZhuangtai()
}

// 投放后导入本地引用或网址收藏，资料库未设置时先请求用户选择目录
async function chuliTuoruFangzhi(shijian) {
  if (!shifouTuoruNeirong(shijian)) return
  shijian.preventDefault()
  qingliTuoruZhuangtai()
  if (shifouYinruZhong.value || !(await quebaoZiliaoku())) return

  shifouYinruZhong.value = true
  try {
    const jieguo = await window.aetherDock?.yinruTuoruNeirong({
      wenjian: shijian.dataTransfer?.files,
      wangzhi: tiquTuoruWangzhi(shijian.dataTransfer),
    })
    const xinZeng = jieguo?.xinZeng ?? []
    if (!xinZeng.length) {
      ziliaokuFankui.value = '未发现可导入的新内容'
      return
    }
    const leixingYingshe = { document: 'wenjian', image: 'tupian', url: 'wangzhi' }
    dangqianFenlei.value = leixingYingshe[xinZeng[0].type] ?? 'wenjian'
    shifouZhankai.value = true
    ziliaokuFankui.value = `已添加 ${xinZeng.length} 项`
    await duquZiliaoku()
  } catch {
    ziliaokuFankui.value = '导入失败，请稍后重试'
  } finally {
    shifouYinruZhong.value = false
  }
}

// 统一恢复拖放前状态，供离开边界、放下内容与窗口失焦共同调用
function qingliTuoruZhuangtai() {
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
      @mouseenter="chuliLingdongJinru"
      @mouseleave="chuliLingdongLik"
      @dragenter="chuliTuoruJinru"
      @dragover="chuliTuoruYidong"
      @dragleave="chuliTuoruLik"
      @dragend="qingliTuoruZhuangtai"
      @drop="chuliTuoruFangzhi"
      @focus="chuliLingdongJinru"
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
        <span>{{ shifouYinruZhong ? '正在归档' : '拖放归档' }}</span>
      </div>
      <!-- 两个独立页面以同一段玻璃过渡切换，避免内容直接跳变 -->
      <Transition name="boli-qieye" mode="out-in" @enter="chuliYemianJinru" @before-leave="chuliYemianLik">
        <section v-if="shifouZhankai && !shifouTuoru && dangqianYemian === 'ziliaoku'" key="ziliaoku" class="ziliaoku-yemian">
          <div class="ziliaoku-zhuangtai">
            <span class="ziliaoku-lianjie" :class="ziliaokuPeizhi.genMulu ? 'ziliaoku-lianjie--zhengchang' : 'ziliaoku-lianjie--yichang'">{{ ziliaokuPeizhi.genMulu ? '资料库已连接' : '资料库未连接' }}</span>
            <em v-if="ziliaokuFankui">{{ ziliaokuFankui }}</em>
          </div>
          <!-- 展开态仅保留顶部检索与设置入口 -->
          <section class="zhankai-dingbu" aria-label="窗口工具栏">
        <label class="zhankai-sousuo">
          <img :src="sousuoJingtu" alt="" aria-hidden="true" draggable="false">
          <input v-model="sousuoGuanjianzi" type="search" placeholder="搜索" aria-label="搜索">
        </label>
        <button class="zhankai-shezhi" type="button" aria-label="打开设置" @click.stop="dakaiShezhiYemian">
          <img :src="shezhiTuBiao" alt="" aria-hidden="true" draggable="false">
        </button>
          </section>
          <!-- 展开态下方展示常用文件夹入口 -->
          <section class="wenjianjia-cang" aria-label="常用文件夹">
        <button
          class="wenjianjia-kapian wenjianjia-kapian--wenjian"
          :class="{ 'wenjianjia-kapian--xuanzhong': dangqianFenlei === 'wenjian' }"
          type="button"
          aria-label="文档文件夹"
          @click.stop="xuanzeFenlei('wenjian')"
        >
          <img :src="wenjianjiaTuBiao" alt="" aria-hidden="true" draggable="false">
          <span><strong>文档</strong><small>128 个文件</small></span>
          <i>DOC · PDF · TXT</i>
        </button>
        <button
          class="wenjianjia-kapian wenjianjia-kapian--tupian"
          :class="{ 'wenjianjia-kapian--xuanzhong': dangqianFenlei === 'tupian' }"
          type="button"
          aria-label="图片文件夹"
          @click.stop="xuanzeFenlei('tupian')"
        >
          <img :src="tupianjiaTuBiao" alt="" aria-hidden="true" draggable="false">
          <span><strong>图片</strong><small>342 个文件</small></span>
          <i>JPG · PNG · RAW</i>
        </button>
        <button
          class="wenjianjia-kapian wenjianjia-kapian--wangzhi"
          :class="{ 'wenjianjia-kapian--xuanzhong': dangqianFenlei === 'wangzhi' }"
          type="button"
          aria-label="网址"
          @click.stop="xuanzeFenlei('wangzhi')"
        >
          <img :src="wangzhiTuBiao" alt="" aria-hidden="true" draggable="false">
          <span><strong>网址</strong><small>常用链接</small></span>
          <i>WEB · URL</i>
        </button>
          </section>
          <!-- 资料以 3D 卡片轮播陈列，中心卡片为当前可直接打开的焦点 -->
          <section class="ziliaoku-liebiao" aria-label="资料库内容" :style="{ '--qiehuan-fangxiang': qiehuanFangxiang }" @wheel.prevent="chulishujiGunlun">
            <Transition name="shuju-qiehuan" mode="out-in">
            <div v-if="dangqianTiaomu.length" :key="dangqianFenlei" class="ziliaoku-shuji">
              <article
                v-for="{ tiaomu, pianyi, index } in lunboKapian"
                :key="tiaomu.id"
                class="ziliaoku-shuji-kapian"
                :class="{
                  'ziliaoku-shuji-kapian--zhongxin': pianyi === 0,
                  'ziliaoku-shuji-kapian--zuo': pianyi < 0,
                  'ziliaoku-shuji-kapian--you': pianyi > 0,
                  'ziliaoku-shuji-kapian--quexi': tiaomu.status === 'missing',
                }"
                :style="kapianYangshi(pianyi)"
                @mousedown="shujiKaishituodong"
                @mouseup="shujiJieshutuodong"
              >
                <button class="ziliaoku-shuji-zhu" type="button" @click.stop="pianyi === 0 ? dakaiZiliaokuTiaomu(tiaomu) : lunboXiang(index)">
                  <div class="ziliaoku-shuji-shitu" aria-hidden="true">
                    <img v-if="kapianXinxi(tiaomu).yulan" class="ziliaoku-shuji-yulan" :src="kapianXinxi(tiaomu).yulan" :alt="kapianXinxi(tiaomu).leixing" draggable="false" @error="yulanShibai.add(tiaomu.id)">
                    <img v-else-if="kapianXinxi(tiaomu).tubiao" class="ziliaoku-shuji-tubiao" :src="kapianXinxi(tiaomu).tubiao" :alt="kapianXinxi(tiaomu).leixing" draggable="false">
                  </div>
                  <span class="ziliaoku-shuji-fengmian">
                    <strong>{{ kapianMingcheng(tiaomu) }}</strong>
                    <small class="ziliaoku-shuji-shijian">{{ kapianShijian(tiaomu) }}</small>
                  </span>
                </button>
                <button v-if="tiaomu.storageMode !== 'bookmark'" class="ziliaoku-shuji-dingwei" type="button" aria-label="在文件夹中定位" @click.stop="dingweZiliaokuTiaomu(tiaomu)">
                  <img :src="dingweTuBiao" alt="" aria-hidden="true" draggable="false">
                </button>
                <button class="ziliaoku-shuji-shanchu" type="button" aria-label="删除" @click.stop="shanchuZiliaokuTiaomu(tiaomu)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 6h18"/>
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                  </svg>
                </button>
              </article>
            </div>
            <p v-else key="kong" class="ziliaoku-kongzhuangtai">拖入文件或网址，即可在此处统一管理。</p>
            </Transition>
          </section>
        </section>
        <!-- 设置以独立页面承载，避免与资料库操作争夺视觉层级 -->
        <section v-else-if="shifouZhankai && !shifouTuoru && dangqianYemian === 'shezhi'" key="shezhi" class="shezhi-yemian" aria-label="灵动岛设置">
        <header class="shezhi-biaoti">
          <button class="shezhi-fanhui" type="button" aria-label="返回资料库" @click.stop="fanhuiZiliaokuYemian">←</button>
          <div><small>AETHERDOCK / SETTINGS</small><h2>灵动配置</h2></div>
        </header>
        <section class="shezhi-fenzu" aria-labelledby="donghua-biaoti">
          <div class="shezhi-fenzu-biaoti"><span id="donghua-biaoti">收起态动画</span><small>选择常驻的情绪伙伴</small></div>
          <div class="donghua-xuanze-cang">
            <button class="donghua-xuanze" :class="{ 'donghua-xuanze--xuanzhong': dangqianShouqiDonghua === 'kulian' }" type="button" @click.stop="xuanzeShouqiDonghua('kulian')">
              <span ref="kulianYulanChou" class="donghua-yulan" aria-hidden="true"></span>
              <span><strong>委屈</strong><small>安静陪伴</small></span>
            </button>
            <button class="donghua-xuanze" :class="{ 'donghua-xuanze--xuanzhong': dangqianShouqiDonghua === 'daxiao' }" type="button" @click.stop="xuanzeShouqiDonghua('daxiao')">
              <span ref="daxiaoYulanChou" class="donghua-yulan" aria-hidden="true"></span>
              <span><strong>大笑</strong><small>元气回应</small></span>
            </button>
            <button class="donghua-xuanze" :class="{ 'donghua-xuanze--xuanzhong': dangqianShouqiDonghua === 'aixin' }" type="button" @click.stop="xuanzeShouqiDonghua('aixin')">
              <span ref="aixinYulanChou" class="donghua-yulan" aria-hidden="true"></span>
              <span><strong>心动</strong><small>温柔问候</small></span>
            </button>
          </div>
        </section>
        <section class="shezhi-fenzu shezhi-fenzu--mulu" aria-labelledby="mulu-biaoti">
          <div class="shezhi-fenzu-biaoti"><span id="mulu-biaoti">资料库目录</span><small>网络归档与本地索引的统一入口</small></div>
          <div class="ziliaoku-mulu-xianshi"><span>{{ ziliaokuPeizhi.genMulu || '尚未设置资料库目录' }}</span><button type="button" @click.stop="xuanzeZiliaokuGenmulu">{{ ziliaokuPeizhi.genMulu ? '更换目录' : '选择目录' }}</button></div>
        </section>
        </section>
      </Transition>
    </section>
  </main>
</template>
