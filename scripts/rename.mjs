// 一次性拼音→英文重命名脚本。执行后可删除。
// 用法: node scripts/rename.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 整标识符/精确串替换：大小写敏感，前后非 [A-Za-z0-9_] 边界
function replaceWord(text, oldW, newW) {
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRe(oldW)}(?![A-Za-z0-9_])`, 'g')
  return text.replaceAll(re, newW)
}
// kebab 段替换：前后非字母数字
function replaceSegment(text, oldS, newS) {
  const re = new RegExp(`(?<![A-Za-z0-9])${escapeRe(oldS)}(?![A-Za-z0-9])`, 'g')
  return text.replaceAll(re, newS)
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// 按长度降序排列，避免短段误匹配长段前缀（如 wenjian vs wenjianjia）
function sortByLenDesc(arr) { return [...arr].sort((a, b) => b[0].length - a[0].length) }

// ── IPC 通道（精确串） ──
const ipc = [
  ['yingyong:get-banben', 'app:get-version'],
  ['xitong:duqu-zhuangtai', 'system:read-status'],
  ['lingdongdao:set-chuantou', 'island:set-passthrough'],
  ['lingdongdao:dingwei-dingbu', 'island:locate-top'],
  ['lingdongdao:kaiji-wancheng', 'island:startup-complete'],
  ['ziliaoku:xuanze-genmulu', 'library:select-rootdir'],
  ['ziliaoku:duqu-peizhi', 'library:read-config'],
  ['ziliaoku:duqu-tiaomu', 'library:read-items'],
  ['ziliaoku:yinru', 'library:import'],
  ['ziliaoku:dakai-tiaomu', 'library:open-item'],
  ['ziliaoku:dingwei-tiaomu', 'library:locate-item'],
  ['ziliaoku:shanchu-tiaomu', 'library:delete-item'],
  ['shezhi:duqu-shouqi-donghua', 'settings:read-collapsed-animation'],
  ['shezhi:shezhi-shouqi-donghua', 'settings:set-collapsed-animation'],
]

// ── window.aetherDock 方法（精确整标识符） ──
const api = [
  ['getBanben', 'getVersion'],
  ['getXitongZhuangtai', 'getSystemStatus'],
  ['setLingdongChuantou', 'setIslandPassthrough'],
  ['dingweiDaoDingbu', 'locateToTop'],
  ['wanchengKaiJi', 'completeStartup'],
  ['xuanzeZiliaokuGenmulu', 'selectLibraryRootdir'],
  ['duquZiliaokuPeizhi', 'getLibraryConfig'],
  ['duquShouqiDonghua', 'getCollapsedAnimation'],
  ['sheZhiShouqiDonghua', 'setCollapsedAnimation'],
  ['yinruTuoruNeirong', 'importDragContent'],
  ['duquZiliaokuTiaomu', 'getLibraryItems'],
  ['dakaiZiliaokuTiaomu', 'openLibraryItem'],
  ['dingweZiliaokuTiaomu', 'locateLibraryItem'],
  ['shanchuZiliaokuTiaomu', 'deleteLibraryItem'],
]

// ── 自定义属性（精确串） ──
const customProps = [
  ['--donghua-zhong', '--anim-duration'],
  ['--quxian-lingdong', '--motion-easing'],
  ['--qiehuan-fangxiang', '--switch-direction'],
]

// ── JS 全标识符（camelCase，整词边界，作用于 script 与 .cjs） ──
const jsIds = [
  // App.vue imports
  ['maomaoKulianDonghua', 'catCryingAnimation'],
  ['maomaoDaxiaoDonghua', 'catLaughingAnimation'],
  ['maomaoAixinDonghua', 'catLovingAnimation'],
  ['kaiJiDonghua', 'startupAnimation'],
  ['sousuoJingtu', 'searchLensIcon'],
  ['shezhiTuBiao', 'settingsIcon'],
  ['wenjianjiaTuBiao', 'folderIcon'],
  ['tupianjiaTuBiao', 'imageFolderIcon'],
  ['wangzhiTuBiao', 'urlIcon'],
  ['docTuBiao', 'docIcon'],
  ['pdfTuBiao', 'pdfIcon'],
  ['xlsTuBiao', 'xlsIcon'],
  ['wendangTuBiao', 'fileIcon'],
  ['tupianTuBiao', 'imageIcon'],
  ['dingweTuBiao', 'locateIcon'],
  // App.vue state
  ['shifouKaiJiChuangkou', 'isStartupWindow'],
  ['shifouZhankai', 'isExpanded'],
  ['lingdongChou', 'islandHolder'],
  ['lottieChou', 'lottieHolder'],
  ['kaiJiLottieChou', 'startupLottieHolder'],
  ['dangqianShijian', 'currentTime'],
  ['xitongZhuangtai', 'systemStatus'],
  ['shifouTuoru', 'isDragging'],
  ['shifouKaiJiZhong', 'isStartingUp'],
  ['sousuoGuanjianzi', 'searchKeyword'],
  ['dangqianFenlei', 'currentCategory'],
  ['fenleiBiao', 'categoryList'],
  ['qiehuanFangxiang', 'switchDirection'],
  ['ziliaokuTiaomu', 'libraryItems'],
  ['ziliaokuPeizhi', 'libraryConfig'],
  ['ziliaokuFankui', 'libraryFeedback'],
  ['yulanShibai', 'previewFailed'],
  ['shifouYinruZhong', 'isImporting'],
  ['dangqianYemian', 'currentPage'],
  ['shezhi', 'settings'],
  ['dangqianShouqiDonghua', 'currentCollapsedAnimation'],
  ['ziliaokuLunboIndex', 'libraryCarouselIndex'],
  ['ziliaokuShujiZhengzaituodong', 'shelfDragging'],
  ['kulianYulanChou', 'kulianPreviewHolder'],
  ['daxiaoYulanChou', 'daxiaoPreviewHolder'],
  ['aixinYulanChou', 'aixinPreviewHolder'],
  ['donghuaLiebiao', 'animationList'],
  ['shifouChuantou', 'isPassthrough'],
  ['bofangqiLottie', 'lottiePlayer'],
  ['bofangqiKaiJi', 'startupPlayer'],
  ['bofangqiYulan', 'previewPlayers'],
  ['jishiShijian', 'timeTimer'],
  ['jishiZhuangtai', 'statusTimer'],
  ['jishiKaiJi', 'startupTimer'],
  ['jishiDingwei', 'relocateTimer'],
  // App.vue computed / functions
  ['dangqianTiaomu', 'currentItems'],
  ['lunboKapian', 'carouselCards'],
  ['gengxinDangqianShijian', 'updateCurrentTime'],
  ['gengxinXitongZhuangtai', 'updateSystemStatus'],
  ['duquZiliaoku', 'loadLibrary'],
  ['chushihuaShouqiDonghua', 'initCollapsedAnimation'],
  ['chushihuaDonghuaYulan', 'initAnimationPreview'],
  ['qingliDonghuaYulan', 'disposeAnimationPreview'],
  ['dakaiShezhiYemian', 'openSettingsPage'],
  ['fanhuiZiliaokuYemian', 'returnToLibraryPage'],
  ['xuanzeShouqiDonghua', 'selectCollapsedAnimation'],
  ['kapianXinxi', 'cardInfo'],
  ['kapianMingcheng', 'cardName'],
  ['kapianShijian', 'cardTime'],
  ['lunboXiang', 'carouselGoTo'],
  ['shangyiZhang', 'prevCard'],
  ['xiayiZhang', 'nextCard'],
  ['chulishujiJianpan', 'handleShelfKeyboard'],
  ['chulishujiGunlun', 'handleShelfWheel'],
  ['shujiKaishituodong', 'onShelfDragStart'],
  ['shujiJieshutuodong', 'onShelfDragEnd'],
  ['kapianYangshi', 'cardStyle'],
  ['chuliYemianJinru', 'handlePageEnter'],
  ['chuliYemianLik', 'handlePageLeave'],
  ['xuanzeZiliaokuGenmulu', 'selectLibraryRootdir'],
  ['quebaoZiliaoku', 'ensureLibrary'],
  ['dakaiZiliaokuTiaomu', 'openLibraryItem'],
  ['dingweZiliaokuTiaomu', 'locateLibraryItem'],
  ['shanchuZiliaokuTiaomu', 'deleteLibraryItem'],
  ['wanchengKaiJiDonghua', 'completeStartupAnimation'],
  ['qiehuanLingdongZhuangtai', 'toggleIslandState'],
  ['guanbiShubiaoChuantou', 'disableMousePassthrough'],
  ['chuliLingdongJinru', 'handleIslandEnter'],
  ['chuliLingdongLik', 'handleIslandLeave'],
  ['xuanzeFenlei', 'selectCategory'],
  ['shifouTuoruNeirong', 'hasDragContent'],
  ['tiquTuoruWangzhi', 'extractDraggedUrls'],
  ['chuliTuoruJinru', 'handleDragEnter'],
  ['chuliTuoruYidong', 'handleDragOver'],
  ['chuliTuoruLik', 'handleDragLeave'],
  ['chuliTuoruFangzhi', 'handleDrop'],
  ['qingliTuoruZhuangtai', 'clearDragState'],
  ['gengxinShubiaoChuantou', 'updateMousePassthrough'],
  ['huiFuShubiaoChuantou', 'restoreMousePassthrough'],
  // App.vue 局部裸词（无歧义）
  ['leixingYingshe', 'typeMap'],
  ['mubiaoChuantou', 'targetPassthrough'],
  ['shifouZaiLingdongDao', 'isOverIsland'],
  ['rengzaiBianjieNei', 'stillInside'],
  ['shujuzhuanYi', 'dataTransfer'],
  ['jiuIndex', 'oldIndex'],
  ['xinIndex', 'newIndex'],
  ['guanjianzi', 'keyword'],
  ['dangqianWenjian', 'currentFile'],
  ['zhenshiLujing', 'realPath'],
  ['xiangduiLujing', 'relativePath'],
  ['zuizhongLujing', 'finalPath'],
  ['zancunLujing', 'stagingPath'],
  ['genMuluJuedui', 'rootdirAbsolute'],
  ['wenjianLujing', 'filePath'],
  ['fuzhiJieguo', 'copyResult'],
  ['shifouCunzai', 'exists'],
  ['wangzhiDuixiang', 'urlObject'],
  ['yuanWangzhi', 'rawUrl'],
  ['shibieBendiWenjian', 'classifyLocalFile'],
  ['shengchengGuankongWenjianMing', 'generateManagedFilename'],
  ['fuzhiDaoGuankongMulu', 'copyToManagedDir'],
  ['fenleiMulu', 'categoryDir'],
  ['jiexiGuankongLujing', 'resolveManagedPath'],
  ['guifanHuaWangzhi', 'normalizeUrl'],
  ['yinruNeirong', 'importContent'],
  ['duquTiaomuLiebiao', 'getItemList'],
  ['duquTiaomuXiangqing', 'getItemDetail'],
  ['duquTiaomuBendiLujing', 'getItemLocalPath'],
  ['shanchuTiaomu', 'deleteItem'],
  ['shanchuTiaomuYuju', 'deleteItemStmt'],
  ['duquTiaomu', 'readItemsStmt'],
  ['duquDanGeTiaomu', 'readItemStmt'],
  ['gengxinGuankongTiaomu', 'updateManagedItemStmt'],
  ['xieruTiaomu', 'insertItemStmt'],
  ['chazhaoTiaomu', 'findItemStmt'],
  ['xieruShezhi', 'writeSettingStmt'],
  ['duquShezhi', 'readSettingStmt'],
  ['jiuTiaomuBiao', 'oldItemsTable'],
  ['shujuKuLujing', 'dbPath'],
  ['shujuKu', 'db'],
  ['chuangjianZiliaoku', 'createLibrary'],
  ['sheZhiGenMulu', 'setRootdir'],
  ['duquPeizhi', 'getConfig'],
  ['duquShouqiDonghua', 'getCollapsedAnimation'],
  ['sheZhiShouqiDonghua', 'setCollapsedAnimation'],
  ['guanbi', 'close'],
  ['keYongDonghua', 'availableAnimations'],
  ['biaoshiLujing', 'markerPath'],
  ['biaoshi', 'marker'],
  ['kuozhan', 'ext'],
  ['yuanMing', 'baseName'],
  ['chongfu', 'duplicates'],
  ['tongji', 'stat'],
  ['yicunzai', 'existing'],
  ['cuowu', 'error'],
  ['tupianKuozhan', 'imageExts'],
  ['wenjianKuozhan', 'documentExts'],
  ['genMulu', 'rootdir'],
  ['kuId', 'libraryId'],
  // main.cjs
  ['zhuChuangkou', 'mainWindow'],
  ['kaijiChuangkou', 'startupWindow'],
  ['shangciCpuTongji', 'lastCpuStat'],
  ['ziliaoku', 'library'],
  ['chicunChuangkou', 'mainWindowSize'],
  ['chicunKaiJi', 'startupWindowSize'],
  ['dingweChuangkou', 'positionWindow'],
  ['shifouJuzhong', 'centered'],
  ['gongzuoqu', 'workArea'],
  ['zuobiaoX', 'coordX'],
  ['zuobiaoY', 'coordY'],
  ['jiazaiRanyechuangkou', 'loadRendererWindow'],
  ['chuangkou', 'win'],
  ['shifouKaiJi', 'isStartup'],
  ['dizhi', 'url'],
  ['duquCpuShiyonglv', 'getCpuUsage'],
  ['dangqianCpuTongji', 'currentCpuStat'],
  ['zongjiCha', 'totalDelta'],
  ['shiyonglv', 'usage'],
  ['duquXitongZhuangtai', 'getSystemStatus'],
  ['zongNeicun', 'totalMem'],
  ['chuangjianZhuChuangkou', 'createMainWindow'],
  ['chuangjianKaiJiChuangkou', 'createStartupWindow'],
  ['qingqiu', 'request'],
  ['tiaomuId', 'itemId'],
  ['miaoshu', 'payload'],
  ['tupianMime', 'imageMime'],
  ['shijianzhi', 'value'],
  // preload.cjs
  ['zhuanHuanTuoruWenjian', 'convertDragFile'],
  ['zuihouTuoruWenjian', 'lastDragFiles'],
  ['lujing', 'path'],
  // 裸词（无歧义，全局 script）
  ['tiaomu', 'item'],
  ['donghua', 'animation'],
  ['wenben', 'text'],
  ['leixing', 'type'],
  ['tubiao', 'icon'],
  ['yulan', 'preview'],
  ['jieguo', 'result'],
  ['peizhi', 'config'],
  ['pianyi', 'offset'],
  ['jianju', 'spacing'],
  ['juli', 'distance'],
  ['fangxiang', 'direction'],
  ['jiaodu', 'angle'],
  ['shen', 'depth'],
  ['suo', 'scale'],
  ['touming', 'opacity'],
  ['zhongxin', 'center'],
  ['liebiao', 'list'],
  ['biaoti', 'title'],
  ['yue', 'month'],
  ['ri', 'day'],
  ['shi', 'hour'],
  ['fen', 'minute'],
  ['xinZeng', 'added'],
  ['yuanwen', 'raw'],
  ['hang', 'line'],
  ['queren', 'confirm'],
  ['wangzhi', 'url'],
  ['tupian', 'image'],
  ['zongji', 'total'],
  ['kongxian', 'idle'],
  ['zonghe', 'sum'],
  ['benDiLujing', 'localPath'],
  ['huanchong', 'buffer'],
]

// ── 歧义裸词（按文件） ──
const perFileBare = {
  'src/App.vue': [['shijian', 'event'], ['wenjian', 'document']],
  'electron/ziliaoku.cjs': [['shijian', 'timestamp'], ['wenjian', 'file']],
  'electron/preload.cjs': [['shijian', 'event'], ['wenjian', 'file']],
  'electron/main.cjs': [['shijian', 'times']],
}

// ── CSS 段词表（kebab 段，作用于 style.css 与 App.vue 模板） ──
const cssSegments = [
  ['ziliaoku', 'library'], ['shuji', 'shelf'], ['kapian', 'card'], ['zhongxin', 'center'],
  ['zuo', 'left'], ['you', 'right'], ['quexi', 'missing'], ['shitu', 'view'],
  ['tubiao', 'icon'], ['yulan', 'preview'], ['fengmian', 'cover'], ['shijian', 'time'],
  ['dingwei', 'locate'], ['shanchu', 'delete'], ['zhu', 'main'], ['kongzhuangtai', 'empty'],
  ['liebiao', 'list'], ['yemian', 'page'], ['zhuangtai', 'status'], ['lianjie', 'connection'],
  ['zhengchang', 'normal'], ['yichang', 'abnormal'], ['tishi', 'hint'], ['jiahao', 'plus'],
  ['tuoru', 'drop'], ['boli', 'glass'], ['qieye', 'switch'], ['shuju', 'data'],
  ['qiehuan', 'switch'], ['kaiji', 'startup'], ['danchu', 'fade'], ['mengban', 'overlay'],
  ['maomao', 'cat'], ['neibu', 'inner'], ['yingying', 'glow'], ['wuye', 'root'],
  ['lingdong', 'island'], ['chuangkou', 'window'], ['zhankai', 'expanded'], ['wenjianjia', 'folder'],
  ['wenjian', 'document'], ['tupian', 'image'], ['wangzhi', 'url'], ['cang', 'panel'],
  ['xuanzhong', 'selected'], ['shezhi', 'settings'], ['biaoti', 'title'], ['fanhui', 'back'],
  ['fenzu', 'group'], ['mulu', 'directory'], ['xianshi', 'display'], ['donghua', 'animation'],
  ['xuanze', 'choice'], ['sousuo', 'search'], ['dingbu', 'top'], ['jingtu', 'lens'],
  ['fuhao', 'symbol'], ['guangquan', 'halo'], ['kedu', 'ticks'], ['ceng', 'layer'],
  ['wenzi', 'text'], ['yepian', 'blade'], ['neirong', 'content'], ['xiangmu', 'project'],
  ['xiazai', 'download'], ['zhibiao', 'pointer'], ['shang', 'up'], ['xia', 'down'],
  ['guidao', 'orbit'], ['luopan', 'compass'], ['xingtu', 'starmap'], ['tiaomu', 'item'],
  ['leixing', 'type'], ['wenben', 'text'], ['webgl', 'webgl'], ['lottie', 'lottie'],
]

// ── 应用 ──
const exactAll = [...ipc, ...api, ...customProps] // 精确串，全文件
const jsSorted = sortByLenDesc(jsIds)
const cssSorted = sortByLenDesc(cssSegments)

// 资料库文件沿用现有文件名，避免标识符替换误改 CommonJS 引用路径
function restoreModulePaths(text) {
  return text.replaceAll("require('./library.cjs')", "require('./ziliaoku.cjs')")
}

// 图标文件未参与重命名，避免路径段替换后出现不存在的资源
function restoreAssetPaths(text) {
  return text
    .replaceAll('./assets/icons/settings-orbit.svg', './assets/icons/shezhi-orbit.svg')
    .replaceAll('./assets/icons/document-folder.svg', './assets/icons/wenjian-folder.svg')
    .replaceAll('./assets/icons/image-folder.svg', './assets/icons/tupian-folder.svg')
    .replaceAll('./assets/icons/url-link.svg', './assets/icons/wangzhi-link.svg')
    .replaceAll('./assets/icons/image.svg', './assets/icons/tupian.svg')
}

function applyScript(text) {
  // 先精确串（IPC/API/自定义属性不在此区出现，安全），再整标识符
  for (const [o, n] of exactAll) text = replaceWord(text, o, n)
  for (const [o, n] of jsSorted) text = replaceWord(text, o, n)
  return text
}
function applyCss(text) {
  for (const [o, n] of customProps) text = text.split(o).join(n)
  for (const [o, n] of cssSorted) text = replaceSegment(text, o, n)
  return text
}

function processAppVue(src) {
  // 切分 script / template 区段
  const scriptOpen = src.indexOf('<script setup>')
  const scriptClose = src.indexOf('</script>')
  const tplOpen = src.indexOf('<template>')
  const tplClose = src.lastIndexOf('</template>')
  const head = src.slice(0, scriptOpen + '<script setup>'.length)
  const script = src.slice(scriptOpen + '<script setup>'.length, scriptClose)
  const mid = src.slice(scriptClose, tplOpen + '<template>'.length)
  const tpl = src.slice(tplOpen + '<template>'.length, tplClose)
  const tail = src.slice(tplClose)
  // script: 精确串 + 整标识符 + 文件级裸词
  let s = script
  for (const [o, n] of exactAll) s = replaceWord(s, o, n)
  for (const [o, n] of jsSorted) s = replaceWord(s, o, n)
  for (const [o, n] of (perFileBare['src/App.vue'] || [])) s = replaceWord(s, o, n)
  // template: 同步脚本标识符后再替换 CSS 段，避免绑定仍指向旧变量
  let t = tpl
  for (const [o, n] of exactAll) t = replaceWord(t, o, n)
  for (const [o, n] of jsSorted) t = replaceWord(t, o, n)
  for (const [o, n] of customProps) t = t.split(o).join(n)
  for (const [o, n] of cssSorted) t = replaceSegment(t, o, n)
  return restoreAssetPaths(head + s + mid + t + tail)
}

const files = [
  'src/App.vue',
  'src/style.css',
  'electron/main.cjs',
  'electron/preload.cjs',
  'electron/ziliaoku.cjs',
]

for (const rel of files) {
  const fp = path.join(root, rel)
  let src = readFileSync(fp, 'utf8')
  const before = src
  if (rel === 'src/App.vue') {
    src = processAppVue(src)
  } else if (rel === 'src/style.css') {
    src = applyCss(src)
  } else {
    // .cjs: 精确串 + 整标识符 + 文件级裸词
    let s = src
    for (const [o, n] of exactAll) s = replaceWord(s, o, n)
    for (const [o, n] of jsSorted) s = replaceWord(s, o, n)
    for (const [o, n] of (perFileBare[rel] || [])) s = replaceWord(s, o, n)
    src = restoreModulePaths(s)
  }
  if (src !== before) {
    writeFileSync(fp, src)
    console.log('updated', rel)
  } else {
    console.log('no-change', rel)
  }
}
