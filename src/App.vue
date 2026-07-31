<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light'
import catCryingAnimation from './assets/cat-crying.json'
import catLaughingAnimation from './assets/cat-laughing.json'
import catLovingAnimation from './assets/cat-loving.json'
import startupAnimation from './assets/loading.json'
import searchLensIcon from './assets/icons/sousuo-lens.svg'
import settingsIcon from './assets/icons/shezhi-orbit.svg'
import folderIcon from './assets/icons/wenjian-folder.svg'
import imageFolderIcon from './assets/icons/tupian-folder.svg'
import urlIcon from './assets/icons/wangzhi-link.svg'
import docIcon from './assets/icons/doc.svg'
import pdfIcon from './assets/icons/pdf.svg'
import xlsIcon from './assets/icons/xls.svg'
import fileIcon from './assets/icons/wendang.svg'
import imageIcon from './assets/icons/tupian.svg'
import enterIcon from './assets/icons/enter.svg'
import deleteIcon from './assets/icons/delete.svg'
import ConfirmDialog from './components/ConfirmDialog.vue'
import ToastMessage from './components/ToastMessage.vue'

const isStartupWindow = new URLSearchParams(window.location.search).get('startup') === '1'
const isExpanded = ref(false)
const islandHolder = ref(null)
const lottieHolder = ref(null)
const startupLottieHolder = ref(null)
const currentTime = ref('')
const systemStatus = ref({ cpu: 0, neicun: 0 })
const isDragging = ref(false)
const isStartingUp = ref(isStartupWindow)
const searchKeyword = ref('')
const currentCategory = ref('document')
const categoryList = ['document', 'image', 'url']
const switchDirection = ref(1)
const libraryItems = ref([])
const libraryConfig = ref({ rootdir: '', libraryId: '' })
const previewFailed = ref(new Set())
// 轻量反馈与确认均使用自绘玻璃组件，替代原生弹窗与顶部文本
const toast = ref({ visible: false, text: '', type: 'info' })
const confirmState = ref({
  visible: false,
  title: '确认操作',
  message: '',
  detail: '',
  confirmText: '确定',
  cancelText: '取消',
  tone: 'default',
})
let pendingConfirmAction = null
let toastTimer = null
const isImporting = ref(false)
const currentPage = ref('library')
const currentCollapsedAnimation = ref('kulian')
const libraryCarouselIndex = ref(0)
const shelfDragging = ref(false)
const kulianPreviewHolder = ref(null)
const daxiaoPreviewHolder = ref(null)
const aixinPreviewHolder = ref(null)
const animationList = [
  { id: 'kulian', mingcheng: '委屈', shuoming: '安静陪伴', shuju: catCryingAnimation, chou: kulianPreviewHolder },
  { id: 'daxiao', mingcheng: '大笑', shuoming: '元气回应', shuju: catLaughingAnimation, chou: daxiaoPreviewHolder },
  { id: 'aixin', mingcheng: '心动', shuoming: '温柔问候', shuju: catLovingAnimation, chou: aixinPreviewHolder },
]
let isPassthrough = true
let lottiePlayer = null
let startupPlayer = null
let previewPlayers = []
let timeTimer = null
let statusTimer = null
let startupTimer = null
let relocateTimer = null

const currentItems = computed(() => {
  const typeMap = { document: 'document', image: 'image', url: 'url' }
  const keyword = searchKeyword.value.trim().toLowerCase()
  return libraryItems.value.filter((item) => {
    if (item.type !== typeMap[currentCategory.value]) return false
    if (!keyword) return true
    return [item.title, item.sourcePath, item.sourceUrl].filter(Boolean)
      .some((text) => text.toLowerCase().includes(keyword))
  })
})


// 更新收起态中间的本地时间
function updateCurrentTime() {
  currentTime.value = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

// 从主进程读取 CPU 与内存占用
async function updateSystemStatus() {
  try {
    const zhuangtai = await window.aetherDock?.getSystemStatus()
    if (zhuangtai) systemStatus.value = zhuangtai
  } catch {
    // 系统状态读取失败时沿用上一帧数据
  }
}

// 读取资料库配置与当前分类条目
async function loadLibrary() {
  try {
    const [config, item, animation] = await Promise.all([
      window.aetherDock?.getLibraryConfig(),
      window.aetherDock?.getLibraryItems(),
      window.aetherDock?.getCollapsedAnimation(),
    ])
    if (config) libraryConfig.value = config
    if (item) libraryItems.value = item
    if (animation) currentCollapsedAnimation.value = animation
  } catch {
    showToast('资料库暂时不可用', 'error')
  }
}

// 弹出短暂玻璃提示，连续调用时刷新文案并重置倒计时
function showToast(text, type = 'info') {
  if (toastTimer) window.clearTimeout(toastTimer)
  toast.value = { visible: true, text, type }
  toastTimer = window.setTimeout(() => { toast.value.visible = false }, 2400)
}

// 用自绘确认弹窗替代原生 dialog，确认后再执行传入的回调
function requestConfirm(options, onConfirm) {
  confirmState.value = {
    visible: true,
    title: options.title ?? '确认操作',
    message: options.message ?? '',
    detail: options.detail ?? '',
    confirmText: options.confirmText ?? '确定',
    cancelText: options.cancelText ?? '取消',
    tone: options.tone ?? 'default',
  }
  pendingConfirmAction = onConfirm ?? null
}

function handleConfirm() {
  confirmState.value.visible = false
  const action = pendingConfirmAction
  pendingConfirmAction = null
  action?.()
}

function handleCancel() {
  confirmState.value.visible = false
  pendingConfirmAction = null
}

// 重新挂载收起态 Lottie，切换偏好后立即反映在灵动岛上
function initCollapsedAnimation() {
  lottiePlayer?.destroy()
  const animation = animationList.find((item) => item.id === currentCollapsedAnimation.value)
  if (!animation || !lottieHolder.value) return
  lottiePlayer = lottie.loadAnimation({
    container: lottieHolder.value,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: structuredClone(animation.shuju),
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
  })
}

// 设置页展示三个可选动画的实时预览，离开页面时及时销毁播放器
function initAnimationPreview() {
  previewPlayers.forEach((bofangqi) => bofangqi.destroy())
  previewPlayers = animationList.flatMap((animation) => {
    if (!animation.chou.value) return []
    return [lottie.loadAnimation({
      container: animation.chou.value,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: structuredClone(animation.shuju),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })]
  })
}

function disposeAnimationPreview() {
  previewPlayers.forEach((bofangqi) => bofangqi.destroy())
  previewPlayers = []
}

// 打开独立设置页，预览播放器由可见状态监听统一管理
function openSettingsPage() {
  currentPage.value = 'settings'
}

function returnToLibraryPage() {
  currentPage.value = 'library'
}

// 保存收起态动画偏好，并立即更新当前灵动岛
async function selectCollapsedAnimation(animation) {
  try {
    const result = await window.aetherDock?.setCollapsedAnimation(animation)
    if (!result) return
    currentCollapsedAnimation.value = result
  } catch {
    showToast('动画设置未保存', 'error')
  }
}

watch(currentCollapsedAnimation, () => {
  if (!isStartupWindow) initCollapsedAnimation()
})

watch(currentItems, () => {
  libraryCarouselIndex.value = 0
}, { flush: 'post' })

// 计算 3D 轮播中每个可见卡片的偏移与变换
const carouselCards = computed(() => {
  const list = currentItems.value
  const center = libraryCarouselIndex.value
  return list.map((item, index) => {
    const offset = index - center
    return { item, offset, index }
  })
})

function cardInfo(item) {
  const text = (item.title || item.sourcePath || '').toLowerCase()
  let type = item.type === 'image' ? 'IMG' : item.type === 'url' ? 'URL' : 'DOC'
  let icon = ''
  let preview = ''
  if (item.type === 'image') {
    type = 'IMG'
    // 图片条目优先用真实预览，加载失败或文件缺失时回退到通用图片图标
    if (item.status !== 'missing' && !previewFailed.value.has(item.id)) {
      preview = `aetherdock-img://${item.id}`
    } else {
      icon = imageIcon
    }
  } else if (text.endsWith('.pdf')) {
    icon = pdfIcon
    type = 'PDF'
  } else if (text.endsWith('.xls') || text.endsWith('.xlsx')) {
    icon = xlsIcon
    type = 'XLS'
  } else if (text.endsWith('.doc') || text.endsWith('.docx')) {
    icon = docIcon
    type = 'DOC'
  } else {
    icon = fileIcon
    type = 'FILE'
  }
  return {
    type,
    icon,
    preview,
  }
}

// 卡片标题仅展示文件主名，网址条目则保留完整标题
function cardName(item) {
  const title = item.title || '未命名资料'
  return item.type === 'url' ? title : title.replace(/\.[^./\\]+$/, '')
}

// 卡片展示条目归档时间，未记录时回退为空串
function cardTime(item) {
  if (!item.createdAt) return ''
  const d = new Date(item.createdAt)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}

function carouselGoTo(index) {
  if (index < 0 || index >= currentItems.value.length) return
  libraryCarouselIndex.value = index
}

function prevCard() {
  carouselGoTo(libraryCarouselIndex.value - 1)
}

function nextCard() {
  carouselGoTo(libraryCarouselIndex.value + 1)
}

function handleShelfKeyboard(event) {
  if (!isExpanded.value || isDragging.value || currentPage.value !== 'library') return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    prevCard()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    nextCard()
  }
}

function handleShelfWheel(event) {
  if (shelfDragging.value || !currentItems.value.length) return
  if (event.deltaY > 0) nextCard()
  else if (event.deltaY < 0) prevCard()
}

function onShelfDragStart() {
  shelfDragging.value = true
}

function onShelfDragEnd() {
  window.setTimeout(() => { shelfDragging.value = false }, 50)
}

function cardStyle(offset) {
  const spacing = 184
  const distance = Math.abs(offset)
  const direction = offset < 0 ? 1 : -1
  const angle = offset === 0 ? 0 : direction * Math.min(32 + distance * 12, 62)
  const depth = -distance * 55
  const scale = Math.max(1 - distance * 0.12, 0.72)
  const opacity = Math.max(1 - distance * 0.22, 0.45)
  const z = 10 - distance
  return {
    transform: `translateX(calc(-50% + ${offset * spacing}px)) translateZ(${depth}px) rotateY(${angle}deg) scale(${scale})`,
    opacity: opacity,
    zIndex: z,
    pointerEvents: distance <= 2 ? 'auto' : 'none',
  }
}

// 页面进入阶段容器已挂载但仍处于透明起始帧，预先渲染可避免动画晚到闪现
async function handlePageEnter() {
  await nextTick()
  if (currentPage.value === 'settings' && isExpanded.value && !isDragging.value) initAnimationPreview()
}

// 页面离开前释放播放器，避免它继续持有已卸载的 DOM 容器
function handlePageLeave() {
  disposeAnimationPreview()
}

// 选择资料库根目录，首次导入前只需执行一次
async function selectLibraryRootdir() {
  const result = await window.aetherDock?.selectLibraryRootdir()
  if (result?.quxiao) return false
  if (result?.config) {
    libraryConfig.value = result.config
    showToast('资料库目录已设置', 'success')
    return true
  }
  return false
}

// 未配置资料库时在首次导入前请求一次目录选择
async function ensureLibrary() {
  if (libraryConfig.value.rootdir) return true
  return selectLibraryRootdir()
}

// 打开条目并将主进程返回的失败信息反馈给用户
async function openLibraryItem(item) {
  if (item.status === 'missing') {
    showToast('来源文件已不可用', 'error')
    return
  }
  const result = await window.aetherDock?.openLibraryItem(item.id)
  if (!result?.chenggong) showToast(result?.xiaoxi || '打开失败', 'error')
}

// 通过主进程在资源管理器中定位本地资料
function locateLibraryItem(item) {
  window.aetherDock?.locateLibraryItem(item.id)
}

// 删除卡片：先以自绘玻璃弹窗确认，确认后再交由主进程删除数据库记录与本地文件
function deleteLibraryItem(item) {
  requestConfirm(
    {
      title: '删除资料',
      message: '确定删除该资料？',
      detail: `将同时删除本地文件与资料库记录，此操作不可撤销。\n${item.title || ''}`.trim(),
      confirmText: '删除',
      cancelText: '取消',
      tone: 'danger',
    },
    async () => {
      try {
        const result = await window.aetherDock?.deleteLibraryItem(item.id)
        if (!result?.chenggong) {
          showToast(result?.xiaoxi || '删除失败', 'error')
          return
        }
        libraryItems.value = libraryItems.value.filter((xiang) => xiang.id !== item.id)
        previewFailed.value.delete(item.id)
        showToast('已删除', 'success')
      } catch {
        showToast('删除失败', 'error')
      }
    },
  )
}

// 初始化收起态左侧的猫咪动画
onMounted(() => {
  if (!isStartupWindow && lottieHolder.value) {
    initCollapsedAnimation()
  }
  if (isStartupWindow && startupLottieHolder.value) {
    startupPlayer = lottie.loadAnimation({
      container: startupLottieHolder.value,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: startupAnimation,
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })
    // 将一秒原始动画降速至两秒，形成完整的开机节奏
    startupPlayer.setSpeed(.5)
    startupPlayer.addEventListener('complete', completeStartupAnimation)
  }
  if (!isStartupWindow) {
    updateCurrentTime()
    updateSystemStatus()
    loadLibrary()
    timeTimer = window.setInterval(updateCurrentTime, 1000)
    statusTimer = window.setInterval(updateSystemStatus, 2000)
    window.addEventListener('blur', clearDragState)
    window.addEventListener('keydown', handleShelfKeyboard)
  } else {
    // 动画资源异常时仍在预期时长后进入灵动岛
    startupTimer = window.setTimeout(completeStartupAnimation, 2600)
  }
})

// 释放动画实例，避免窗口关闭后残留渲染任务
onUnmounted(() => {
  lottiePlayer?.destroy()
  startupPlayer?.destroy()
  disposeAnimationPreview()
  window.clearInterval(timeTimer)
  window.clearInterval(statusTimer)
  window.clearTimeout(startupTimer)
  window.clearTimeout(relocateTimer)
  window.clearTimeout(toastTimer)
  window.removeEventListener('blur', clearDragState)
  window.removeEventListener('keydown', handleShelfKeyboard)
})

// 开机动画结束后关闭临时窗口，显示已在顶部预加载的灵动岛
function completeStartupAnimation() {
  if (!isStartingUp.value) return
  isStartingUp.value = false
  window.clearTimeout(startupTimer)
  relocateTimer = window.setTimeout(() => window.aetherDock?.completeStartup(), 280)
}

// 固定透明安全区内仅切换组件状态，避免原生窗口重设造成跳动
function toggleIslandState(shifou) {
  if (isDragging.value) return
  // 确认弹窗打开期间保持展开，避免鼠标移出灵动岛导致弹窗被收起
  if (!shifou && confirmState.value.visible) return
  isExpanded.value = shifou
}

// 鼠标进入主体时立即关闭穿透，确保首击直接交给内部控件
function disableMousePassthrough() {
  if (!isPassthrough) return
  isPassthrough = false
  window.aetherDock?.setIslandPassthrough(false)
}

// 收起与展开状态均由主体边界统一切换鼠标接收能力
function handleIslandEnter() {
  disableMousePassthrough()
  toggleIslandState(true)
}

function handleIslandLeave() {
  if (isDragging.value) clearDragState()
  toggleIslandState(false)
  restoreMousePassthrough()
}

// 切换展开态中当前高亮的文件夹
function selectCategory(fenlei) {
  const oldIndex = categoryList.indexOf(currentCategory.value)
  const newIndex = categoryList.indexOf(fenlei)
  // 以分类左右次序决定滑入方向：正向(→)新内容从右进、旧内容向左出；反向(←)则相反
  switchDirection.value = newIndex >= oldIndex ? 1 : -1
  currentCategory.value = fenlei
}

// 判断当前拖拽是否包含本地文件或浏览器提供的网址数据
function hasDragContent(event) {
  const type = Array.from(event.dataTransfer?.types ?? [])
  return type.includes('Files') || type.includes('text/uri-list') || type.includes('text/plain')
}

// 从拖放数据中提取可收藏的网址，忽略 URI 列表中的注释行
function extractDraggedUrls(dataTransfer) {
  const raw = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain')
  return raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
}

// 进入拖拽范围时切换为上传投放态
function handleDragEnter(event) {
  if (!hasDragContent(event)) return
  event.preventDefault()
  isDragging.value = true
  isExpanded.value = false
}

// 拖拽经过时声明可投放状态
function handleDragOver(event) {
  if (!hasDragContent(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

// 拖拽离开真实边界时立即清理投放状态，避免子节点事件造成计数残留
function handleDragLeave(event) {
  if (!isDragging.value) return
  event.preventDefault()
  const rect = islandHolder.value?.getBoundingClientRect()
  const stillInside = rect
    && event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom
  if (!stillInside) clearDragState()
}

// 投放后导入本地引用或网址收藏，资料库未设置时先请求用户选择目录
async function handleDrop(event) {
  if (!hasDragContent(event)) return
  event.preventDefault()
  clearDragState()
  if (isImporting.value || !(await ensureLibrary())) return

  isImporting.value = true
  try {
    const result = await window.aetherDock?.importDragContent({
      document: event.dataTransfer?.files,
      url: extractDraggedUrls(event.dataTransfer),
    })
    const added = result?.added ?? []
    if (!added.length) {
      showToast('未发现可导入的新内容', 'info')
      return
    }
    const typeMap = { document: 'document', image: 'image', url: 'url' }
    currentCategory.value = typeMap[added[0].type] ?? 'document'
    isExpanded.value = true
    showToast(`已添加 ${added.length} 项`, 'success')
    await loadLibrary()
  } catch {
    showToast('导入失败，请稍后重试', 'error')
  } finally {
    isImporting.value = false
  }
}

// 统一恢复拖放前状态，供离开边界、放下内容与窗口失焦共同调用
function clearDragState() {
  isDragging.value = false
}

// 仅在鼠标落在灵动岛轮廓内时拦截点击，其余安全区保持穿透
function updateMousePassthrough(event) {
  const rect = islandHolder.value?.getBoundingClientRect()
  if (!rect) return

  const isOverIsland = event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom
  const targetPassthrough = !isOverIsland

  if (targetPassthrough === isPassthrough) return
  isPassthrough = targetPassthrough
  window.aetherDock?.setIslandPassthrough(targetPassthrough)
}

function restoreMousePassthrough() {
  if (isPassthrough) return
  isPassthrough = true
  window.aetherDock?.setIslandPassthrough(true)
}

</script>

<template>
  <main class="root" @mousemove="updateMousePassthrough" @mouseleave="restoreMousePassthrough">
    <!-- 黑色玻璃灵动窗口 -->
    <Transition name="startup-fade">
      <div v-if="isStartingUp" class="startup-overlay" aria-label="正在启动">
        <div ref="startupLottieHolder" class="startup-lottie" aria-hidden="true"></div>
      </div>
    </Transition>
    <section
      v-show="!isStartingUp && !isStartupWindow"
      class="lingdongchuangkou"
      ref="islandHolder"
      :class="{ 'lingdongchuangkou--expanded': isExpanded, 'lingdongchuangkou--drop': isDragging }"
      aria-label="黑色玻璃灵动窗口"
      tabindex="0"
      @mouseenter="handleIslandEnter"
      @mouseleave="handleIslandLeave"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @dragend="clearDragState"
      @drop="handleDrop"
      @focus="handleIslandEnter"
      @blur="toggleIslandState(false)"
    >
      <div class="inner-glow"></div>
      <!-- 收起态左侧 Lottie 动画 -->
      <div ref="lottieHolder" class="cat-lottie" aria-hidden="true"></div>
      <!-- 收起态时间与系统状态 -->
      <div class="shouqi-xinxi" aria-hidden="true">
        <time class="shouqi-time">{{ currentTime }}</time>
        <div class="xitong-status">
          <span><b>CPU</b><em>{{ systemStatus.cpu }}%</em></span>
          <span><b>MEM</b><em>{{ systemStatus.neicun }}%</em></span>
        </div>
      </div>
      <!-- 文件拖入时显示的上传投放提示 -->
      <div class="drop-hint" aria-hidden="true">
        <span class="drop-plus">+</span>
        <span>{{ isImporting ? '正在归档' : '拖放归档' }}</span>
      </div>
      <!-- 两个独立页面以同一段玻璃过渡切换，避免内容直接跳变 -->
      <Transition name="glass-switch" mode="out-in" @enter="handlePageEnter" @before-leave="handlePageLeave">
        <section v-if="isExpanded && !isDragging && currentPage === 'library'" key="library" class="library-page">
          <div class="library-status">
            <span class="library-connection" :class="libraryConfig.rootdir ? 'library-connection--normal' : 'library-connection--abnormal'">{{ libraryConfig.rootdir ? '资料库已连接' : '资料库未连接' }}</span>
          </div>
          <!-- 展开态仅保留顶部检索与设置入口 -->
          <section class="expanded-top" aria-label="窗口工具栏">
        <label class="expanded-search">
          <img :src="searchLensIcon" alt="" aria-hidden="true" draggable="false">
          <input v-model="searchKeyword" type="search" placeholder="搜索" aria-label="搜索">
        </label>
        <button class="expanded-settings" type="button" aria-label="打开设置" @click.stop="openSettingsPage">
          <img :src="settingsIcon" alt="" aria-hidden="true" draggable="false">
        </button>
          </section>
          <!-- 展开态下方展示常用文件夹入口 -->
          <section class="folder-panel" aria-label="常用文件夹">
        <button
          class="folder-card folder-card--document"
          :class="{ 'folder-card--selected': currentCategory === 'document' }"
          type="button"
          aria-label="文档文件夹"
          @click.stop="selectCategory('document')"
        >
          <img :src="folderIcon" alt="" aria-hidden="true" draggable="false">
          <span><strong>文档</strong><small>128 个文件</small></span>
          <i>DOC · PDF · TXT</i>
        </button>
        <button
          class="folder-card folder-card--image"
          :class="{ 'folder-card--selected': currentCategory === 'image' }"
          type="button"
          aria-label="图片文件夹"
          @click.stop="selectCategory('image')"
        >
          <img :src="imageFolderIcon" alt="" aria-hidden="true" draggable="false">
          <span><strong>图片</strong><small>342 个文件</small></span>
          <i>JPG · PNG · RAW</i>
        </button>
        <button
          class="folder-card folder-card--url"
          :class="{ 'folder-card--selected': currentCategory === 'url' }"
          type="button"
          aria-label="网址"
          @click.stop="selectCategory('url')"
        >
          <img :src="urlIcon" alt="" aria-hidden="true" draggable="false">
          <span><strong>网址</strong><small>常用链接</small></span>
          <i>WEB · URL</i>
        </button>
          </section>
          <!-- 资料以 3D 卡片轮播陈列，中心卡片为当前可直接打开的焦点 -->
          <section class="library-list" aria-label="资料库内容" :style="{ '--switch-direction': switchDirection }" @wheel.prevent="handleShelfWheel">
            <Transition name="data-switch" mode="out-in">
            <div v-if="currentItems.length" :key="currentCategory" class="library-shelf">
              <article
                v-for="{ item, offset, index } in carouselCards"
                :key="item.id"
                class="library-shelf-card"
                :class="{
                  'library-shelf-card--center': offset === 0,
                  'library-shelf-card--left': offset < 0,
                  'library-shelf-card--right': offset > 0,
                  'library-shelf-card--missing': item.status === 'missing',
                }"
                :style="cardStyle(offset)"
                @mousedown="onShelfDragStart"
                @mouseup="onShelfDragEnd"
              >
                <button class="library-shelf-main" type="button" @click.stop="offset === 0 ? openLibraryItem(item) : carouselGoTo(index)">
                  <div class="library-shelf-view" aria-hidden="true">
                    <img v-if="cardInfo(item).preview" class="library-shelf-preview" :src="cardInfo(item).preview" :alt="cardInfo(item).type" draggable="false" @error="previewFailed.add(item.id)">
                    <img v-else-if="cardInfo(item).icon" class="library-shelf-icon" :src="cardInfo(item).icon" :alt="cardInfo(item).type" draggable="false">
                  </div>
                  <span class="library-shelf-cover">
                    <strong>{{ cardName(item) }}</strong>
                    <small class="library-shelf-time">{{ cardTime(item) }}</small>
                  </span>
                </button>
                <!-- 卡片悬停后显示进入与删除操作，避免干扰封面浏览 -->
                <button v-if="item.storageMode !== 'bookmark'" class="library-shelf-enter" type="button" aria-label="在文件夹中定位" @click.stop="locateLibraryItem(item)">
                  <img :src="enterIcon" alt="" aria-hidden="true" draggable="false">
                </button>
                <button class="library-shelf-delete" type="button" aria-label="删除" @click.stop="deleteLibraryItem(item)">
                  <img :src="deleteIcon" alt="" aria-hidden="true" draggable="false">
                </button>
              </article>
            </div>
            <p v-else key="kong" class="library-empty">拖入文件或网址，即可在此处统一管理。</p>
            </Transition>
          </section>
        </section>
        <!-- 设置以独立页面承载，避免与资料库操作争夺视觉层级 -->
        <section v-else-if="isExpanded && !isDragging && currentPage === 'settings'" key="settings" class="settings-page" aria-label="灵动岛设置">
        <header class="settings-title">
          <button class="settings-back" type="button" aria-label="返回资料库" @click.stop="returnToLibraryPage">←</button>
          <div><small>AETHERDOCK / SETTINGS</small><h2>灵动配置</h2></div>
        </header>
        <section class="settings-group" aria-labelledby="animation-title">
          <div class="settings-group-title"><span id="animation-title">收起态动画</span><small>选择常驻的情绪伙伴</small></div>
          <div class="animation-choice-panel">
            <button class="animation-choice" :class="{ 'animation-choice--selected': currentCollapsedAnimation === 'kulian' }" type="button" @click.stop="selectCollapsedAnimation('kulian')">
              <span ref="kulianPreviewHolder" class="animation-preview" aria-hidden="true"></span>
              <span><strong>委屈</strong><small>安静陪伴</small></span>
            </button>
            <button class="animation-choice" :class="{ 'animation-choice--selected': currentCollapsedAnimation === 'daxiao' }" type="button" @click.stop="selectCollapsedAnimation('daxiao')">
              <span ref="daxiaoPreviewHolder" class="animation-preview" aria-hidden="true"></span>
              <span><strong>大笑</strong><small>元气回应</small></span>
            </button>
            <button class="animation-choice" :class="{ 'animation-choice--selected': currentCollapsedAnimation === 'aixin' }" type="button" @click.stop="selectCollapsedAnimation('aixin')">
              <span ref="aixinPreviewHolder" class="animation-preview" aria-hidden="true"></span>
              <span><strong>心动</strong><small>温柔问候</small></span>
            </button>
          </div>
        </section>
        <section class="settings-group settings-group--directory" aria-labelledby="directory-title">
          <div class="settings-group-title"><span id="directory-title">资料库目录</span><small>网络归档与本地索引的统一入口</small></div>
          <div class="library-directory-display"><span>{{ libraryConfig.rootdir || '尚未设置资料库目录' }}</span><button type="button" @click.stop="selectLibraryRootdir">{{ libraryConfig.rootdir ? '更换目录' : '选择目录' }}</button></div>
        </section>
        </section>
      </Transition>
      <!-- 自绘玻璃确认弹窗与轻量提示，均在展开的灵动岛内呈现 -->
      <ConfirmDialog
        v-model:visible="confirmState.visible"
        :title="confirmState.title"
        :message="confirmState.message"
        :detail="confirmState.detail"
        :confirm-text="confirmState.confirmText"
        :cancel-text="confirmState.cancelText"
        :tone="confirmState.tone"
        @confirm="handleConfirm"
        @cancel="handleCancel"
      />
      <ToastMessage v-model:visible="toast.visible" :text="toast.text" :type="toast.type" />
    </section>
  </main>
</template>
