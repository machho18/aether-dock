// Pi 助手集成：主进程通过动态 import 加载 ESM 的 Pi SDK。
// 仅启用文档与知识处理所需的应用工具，避免暴露编码工作流。
// Pi SDK 为 ESM 包，使用动态 import 避免将主进程整体迁移到 ESM。

const path = require('node:path')
const { tuidaoProviderName, tuidaoCompatibleXieyi } = require('./provider-name.cjs')

let pi = null
let modelRuntime = null
let session = null
let initPromise = null
let authPath = ''
let modelsPath = ''
let selectedModelPath = ''
let agentDir = ''
let workspaceDir = ''
let sessionDir = ''
let quxiaoSessionDingyue = () => {}
let sendEvent = () => {}
let searchLibrary = () => Promise.resolve({ items: [] })
let libraryRead = () => ({ chenggong: false, xiaoxi: '读取功能不可用' })
let fetchUrl = () => ({ chenggong: false, xiaoxi: '抓取功能不可用' })
let saveNote = () => ({ chenggong: false, xiaoxi: '保存功能不可用' })
let createDocxCopy = () => ({ chenggong: false, xiaoxi: 'Word 修订副本功能不可用' })
let createXlsxWorkbook = () => ({ chenggong: false, xiaoxi: 'Excel 工作簿生成功能不可用' })
let createMarkdownFile = () => ({ chenggong: false, xiaoxi: 'Markdown 文件生成功能不可用' })
let createPdfDocument = () => ({ chenggong: false, xiaoxi: 'PDF 文件生成功能不可用' })
let requestLibraryApproval = () => Promise.resolve({ approved: false })
let listInbox = () => ({ items: [] })
let archiveInbox = () => ({ chenggong: false, xiaoxi: '归档功能不可用' })
let removeInbox = () => ({ chenggong: false, xiaoxi: '移除功能不可用' })
let renameLibraryItem = () => ({ chenggong: false, xiaoxi: '重命名功能不可用' })
let deleteLibraryItem = () => ({ chenggong: false, xiaoxi: '删除功能不可用' })
let updateLibraryNotes = () => ({ chenggong: false, xiaoxi: '更新笔记功能不可用' })
let getLibraryItem = () => null
// 仅记录当前一轮已确认的目标格式，实际工具调用时一次性消费，避免扩大授权范围。
let yuxianShouquanWenjianToolName = ''

const toolLabels = {
  read: '读取文件',
  bash: '执行命令',
  edit: '编辑文件',
  write: '写入文件',
  find: '查找文件',
  grep: '搜索文件内容',
  ls: '浏览目录',
  web_search: '联网搜索',
  fetch_url: '抓取网页',
  library_search: '资料库搜索',
  library_read: '读取资料库文件',
  save_note: '保存到收集箱',
  create_docx_copy: '生成 DOCX Word 修订副本',
  create_xlsx_workbook: '生成 Excel 工作簿',
  create_markdown_file: '生成 Markdown 文件',
  create_pdf_document: '生成 PDF 文件',
  inbox_list: '查看收集箱',
  inbox_archive: '归档收集箱内容',
  inbox_remove: '移除收集箱内容',
  library_rename: '重命名资料库条目',
  library_delete: '删除资料库条目',
  library_update_notes: '更新资料库笔记',
}

// 这些工具的执行结果需按原始时序写入对话，而非仅显示在折叠步骤中。
const shouquanXieruGongjuNames = new Set([
  'save_note',
  'create_docx_copy',
  'create_xlsx_workbook',
  'create_markdown_file',
  'create_pdf_document',
  'inbox_archive',
  'inbox_remove',
  'library_rename',
  'library_delete',
  'library_update_notes',
])
// 保存到收集箱无需二次确认，其余写入工具均需将结果标记为授权结果。
const zhenZhengShouquanGongjuNames = new Set([...shouquanXieruGongjuNames].filter((name) => name !== 'save_note'))

const wenjianShengchengPeizhi = [
  { toolName: 'create_pdf_document', label: 'PDF', suffix: 'PDF|\\.pdf' },
  { toolName: 'create_markdown_file', label: 'Markdown', suffix: 'Markdown|MD|\\.md' },
  { toolName: 'create_xlsx_workbook', label: 'Excel', suffix: 'Excel|XLSX|\\.xlsx' },
  { toolName: 'create_docx_copy', label: 'Word', suffix: 'Word|DOCX|\\.docx' },
]
const shengchengXingweiPattern = '(?:生成|导出|创建|制作|输出|保存为|转(?:换)?为|整理成|写成)'

// 只识别明确的文件生成意图，避免把“如何生成 PDF”一类咨询误当作写入请求。
function tiquWenjianShengchengQingqiu(rawText) {
  const text = String(rawText ?? '').trim()
  if (!text || new RegExp(`^(?:如何|怎么|怎样|能否|是否|可否|请问).{0,24}${shengchengXingweiPattern}`, 'u').test(text)) return null
  return wenjianShengchengPeizhi.find((item) => new RegExp(`${shengchengXingweiPattern}[\\s\\S]{0,24}(?:${item.suffix})`, 'iu').test(text)) ?? null
}

// 本次格式授权只允许匹配的一次工具写入，后续调用仍必须单独请求用户确认。
function xiaofeiYuxianWenjianShouquan(toolName) {
  if (yuxianShouquanWenjianToolName !== toolName) return false
  yuxianShouquanWenjianToolName = ''
  return true
}

// 记录工具完成后才能得到的补充信息，例如网页真实标题；在结束事件中写回对话记录。
const gongjuWanchengXiangqingMap = new Map()

const ziliaoTypeLabels = {
  document: '文档',
  image: '图片',
  url: '链接',
  application: '应用',
}

// 将工具参数转成可读摘要，避免界面只重复显示笼统的工具名称。
function huoquGongjuXiangqing(name, args = {}, toolCallId = '', shiJieshu = false) {
  const completedDetail = gongjuWanchengXiangqingMap.get(toolCallId)
  if (completedDetail) {
    if (shiJieshu) gongjuWanchengXiangqingMap.delete(toolCallId)
    return completedDetail
  }
  const value = (key) => String(args?.[key] ?? '').trim()
  const jianhuaWenben = (text, limit = 28) => (text.length > limit ? `${text.slice(0, limit)}…` : text)

  switch (name) {
    case 'web_search':
      return value('query') ? `搜索“${jianhuaWenben(value('query'))}”` : ''
    case 'fetch_url': {
      try {
        return value('url') ? `阅读 ${new URL(value('url')).hostname}` : ''
      } catch {
        return '阅读网页'
      }
    }
    case 'library_search':
      return value('keyword') ? `检索“${jianhuaWenben(value('keyword'))}”` : '查看资料库概览'
    case 'library_read':
      return '读取资料内容'
    case 'save_note':
      return value('title') ? `保存“${jianhuaWenben(value('title'))}”` : '保存笔记'
    case 'create_docx_copy':
      return value('title') ? `生成“${jianhuaWenben(value('title'))}”` : '生成 Word 副本'
    case 'create_xlsx_workbook':
      return value('title') ? `生成“${jianhuaWenben(value('title'))}”` : '生成 Excel 工作簿'
    case 'create_markdown_file':
      return value('title') ? `生成“${jianhuaWenben(value('title'))}”` : '生成 Markdown 文件'
    case 'create_pdf_document':
      return value('title') ? `生成“${jianhuaWenben(value('title'))}”` : '生成 PDF 文件'
    default:
      return ''
  }
}

// 标准工具结果以内容块返回；仅提取文本，避免把内部详情暴露到对话。
function tiquGongjuWenbenJieguo(result) {
  return (result?.content ?? [])
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join('\n')
}

// 定义产品级身份，避免底层 SDK 的默认“编码助手”提示词影响对话。
const AETHERDOCK_SYSTEM_PROMPT = `你是 AetherDock 的文档与知识助手，帮助用户整理、理解和沉淀信息。

身份与表达：
- 当用户询问“你是谁”或要求自我介绍时，称自己为“AetherDock 文档与知识助手”。
- 介绍能力时聚焦资料库检索、网页搜索与阅读、文档内容梳理、总结、改写、提纲和笔记整理。
- 不要自称“编码智能体”“编程助手”或“代码助手”，也不要将代码编写、运行脚本、调试项目列为能力。

工作方式：
- 默认采用“本地资料库优先、按需联网”的顺序：与用户资料、已有笔记、文档主题相关的问题，先搜索资料库，再读取最相关的条目；不要编造未读取到的资料内容。
- 用户询问“资料库中有什么”但未提供关键词时，使用资料库概览并明确各分类数量；“最近打开”仅是使用记录，不能表述为资料库的全部内容。
- 用户提到“收集箱”“收件箱”或“待归档”时，只能依据程序注入的收集箱实时清单回答；绝不能以资料库搜索或资料库概览推断收集箱为空。
- 资料库未命中或内容不足且用户需要补充事实时，再使用联网搜索；需要核对搜索结果细节时，使用网页抓取。
- 对新闻、天气、价格、时效性政策等明确需要最新信息的问题，可直接联网搜索。
- 用户明确要求保存内容时，使用收集箱保存；保存前确保标题和正文完整、易于回看。
- 用户明确要求把资料库中的 Word、Markdown 或 TXT 文档整理为 Word 修订副本时，先读取原文，再使用“生成 Word 修订副本”。TXT 内容可直接生成 DOCX，无需先转为 Markdown。该功能会新建并归档一份 DOCX，绝不覆盖原文件；当前版本采用清晰的统一排版，不承诺还原原文复杂版式。
- 用户明确要求生成 Markdown 或 MD 文件时，使用“生成 Markdown 文件”。该功能会将当前整理出的正文写入新的 UTF-8 Markdown 文件并加入资料库，不覆盖原文件。
- 用户明确要求生成 PDF 文件时，使用“生成 PDF 文件”。该功能会将当前整理出的正文排版为新的 A4 PDF 并加入资料库，不覆盖原文件；当前版本支持标题、段落、三级标题、列表和代码块等常用 Markdown 结构。
- 输出格式必须精确匹配用户要求。某格式没有对应工具、工具不可用、生成失败或用户拒绝授权时，直接说明无法生成该格式；严禁调用其他文档工具作为降级方案，也不能更改扩展名冒充目标格式。
- 用户要求 Excel（未指定后缀）或明确要求 XLSX 时，使用“生成 Excel 工作簿”，绝不能改用 Word 工具。将表格内容以 Markdown 表格传入；该工具只生成 XLSX。用户明确要求旧式 XLS 时，当前不支持生成，必须直接说明无法生成 XLS，不能改为生成 XLSX、DOCX、CSV 或其他格式。该功能可直接根据用户提供或当前整理出的内容生成，不要求存在原始文件。
- 用户明确要求归档收集箱、重命名、删除资料或更新资料笔记时，先用对应工具执行；每一次写入都会在界面中等待用户确认，未确认时不得声称操作已完成。工具结束后的真实操作结果由界面按对话顺序展示；继续回复时仅补充后续建议，不重复复述操作结果。
- 用户拒绝授权时，拒绝即为操作终态。工具返回拒绝结果后，只说明“已拒绝，未执行操作”，不得表述为“已提交”“等待确认”，也不要引导用户再次查看确认提示。
- 无法确认的信息要清楚说明不确定性，并给出下一步建议。

回复要求：
- 默认使用简洁、自然的中文；需要结构化表达时使用清晰的 Markdown 标题、列表和重点。
- 优先给出可以直接使用的总结、提纲、改写稿或行动建议。`

async function huoquPi() {
  if (!pi) pi = await import('@earendil-works/pi-coding-agent')
  return pi
}

// 注入应用级路径与资料库能力；仅配置，不触发 Pi SDK 的加载。
function peizhi(options = {}) {
  const nextAgentDir = String(options.agentDir ?? '').trim()
  const nextWorkspaceDir = String(options.workspaceDir ?? '').trim()
  const nextSessionDir = String(options.sessionDir ?? '').trim()
  if (initPromise && ((nextAgentDir && nextAgentDir !== agentDir) || (nextWorkspaceDir && nextWorkspaceDir !== workspaceDir) || (nextSessionDir && nextSessionDir !== sessionDir))) {
    throw new Error('Pi 助手已初始化，无法切换运行目录')
  }
  if (nextAgentDir) agentDir = nextAgentDir
  if (nextWorkspaceDir) workspaceDir = nextWorkspaceDir
  if (nextSessionDir) sessionDir = nextSessionDir
  if (typeof options.sendEvent === 'function') sendEvent = options.sendEvent
  if (typeof options.searchLibrary === 'function') searchLibrary = options.searchLibrary
  if (typeof options.libraryRead === 'function') libraryRead = options.libraryRead
  if (typeof options.fetchUrl === 'function') fetchUrl = options.fetchUrl
  if (typeof options.saveNote === 'function') saveNote = options.saveNote
  if (typeof options.createDocxCopy === 'function') createDocxCopy = options.createDocxCopy
  if (typeof options.createXlsxWorkbook === 'function') createXlsxWorkbook = options.createXlsxWorkbook
  if (typeof options.createMarkdownFile === 'function') createMarkdownFile = options.createMarkdownFile
  if (typeof options.createPdfDocument === 'function') createPdfDocument = options.createPdfDocument
  if (typeof options.requestLibraryApproval === 'function') requestLibraryApproval = options.requestLibraryApproval
  if (typeof options.listInbox === 'function') listInbox = options.listInbox
  if (typeof options.archiveInbox === 'function') archiveInbox = options.archiveInbox
  if (typeof options.removeInbox === 'function') removeInbox = options.removeInbox
  if (typeof options.renameLibraryItem === 'function') renameLibraryItem = options.renameLibraryItem
  if (typeof options.deleteLibraryItem === 'function') deleteLibraryItem = options.deleteLibraryItem
  if (typeof options.updateLibraryNotes === 'function') updateLibraryNotes = options.updateLibraryNotes
  if (typeof options.getLibraryItem === 'function') getLibraryItem = options.getLibraryItem
}

// 所有会改变资料库的工具先等待用户确认，拒绝后不调用主进程写入能力。
async function querenZiliaokuXieru(payload) {
  const result = await requestLibraryApproval(payload)
  return result?.approved === true
}

// 收集箱状态由确定性代码读取，避免模型将资料库概览误当成待归档内容。
function zhuruJiantiebanShishiShangxiawen(text) {
  if (!/(收集箱|收件箱|待归档)/u.test(text)) return text
  const callId = `inbox-preload-${Date.now()}`
  sendEvent({ type: 'tool', callId, name: 'inbox_list', label: toolLabels.inbox_list, detail: '查看收集箱' })
  try {
    const items = (listInbox().items ?? []).slice(0, 50)
    const content = items.length
      ? items.map((item, index) => `${index + 1}. [${ziliaoTypeLabels[item.type] || '资料'}] ${item.title}\n   id: ${item.id}`).join('\n')
      : '收集箱中没有待处理内容。'
    sendEvent({ type: 'tool-end', callId, name: 'inbox_list', label: toolLabels.inbox_list, detail: `${items.length} 项待处理内容`, failed: false })
    return `${text}\n\n【收集箱实时清单（由程序读取）】\n${content}\n\n请只依据以上清单回答收集箱状态；不得用资料库概览替代。`
  } catch (error) {
    sendEvent({ type: 'tool-end', callId, name: 'inbox_list', label: toolLabels.inbox_list, detail: '读取收集箱失败', failed: true })
    return `${text}\n\n【收集箱实时清单读取失败】\n${error?.message ?? '未知错误'}\n请明确说明无法读取，不要推断收集箱为空。`
  }
}

const BING_SEARCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

// 解码 Bing 结果中的 HTML 实体。
function jiexiBingShiti(text) {
  return String(text ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&ensp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&#(\d+);/g, (_, number) => {
      try {
        return String.fromCodePoint(Number(number))
      } catch {
        return ''
      }
    })
}

// 使用 cn.bing.com 作为无需密钥的联网搜索来源，返回标题、链接与摘要。
async function lianwangSousuo(query, count = 6) {
  const keyword = String(query ?? '').trim().slice(0, 300)
  if (!keyword) throw new Error('搜索关键词不能为空')
  const params = new URLSearchParams({ q: keyword, setlang: 'zh-CN', mkt: 'zh-CN', count: '10' })
  const response = await fetch(`https://cn.bing.com/search?${params}`, {
    headers: { 'User-Agent': BING_SEARCH_UA },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`搜索服务返回 ${response.status}`)
  const html = await response.text()
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? []

  const results = []
  for (const block of blocks) {
    if (results.length >= count) break
    const url = block.match(/<a[^>]+href="([^"]+)"[^>]*>/)?.[1]?.trim()
    const title = jiexiBingShiti(block.match(/<h2[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]).replace(/\s+/g, ' ').trim()
    const snippet = jiexiBingShiti(block.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1]).replace(/\s+/g, ' ').trim()
    if (!title || !url) continue
    if (results.some((item) => item.url === url)) continue
    results.push({ title, url, snippet })
  }
  return results
}

// 将搜索结果渲染为模型可读的紧凑文本。
function geshiSousuoJieguo(query, results) {
  if (!results.length) return `未找到与“${query}”相关的网页结果。`
  return results
    .map((item, index) => {
      const lines = [`${index + 1}. ${item.title}`]
      if (item.snippet) lines.push(`   ${item.snippet}`)
      lines.push(`   ${item.url}`)
      return lines.join('\n')
    })
    .join('\n')
}

// 为模型构造自定义工具，统一返回 { content, details } 结构。
function jiangzaoGongju(Type) {
  const webSearchTool = pi.defineTool({
    name: 'web_search',
    label: '联网搜索',
    description: '联网搜索网页资料，返回标题、链接与摘要，用于回答需要最新信息的问题。',
    parameters: Type.Object({
      query: Type.String({ description: '搜索关键词' }),
      count: Type.Optional(Type.Integer({ description: '返回结果数，默认 6' })),
    }),
    execute: async (_toolCallId, params) => {
      const count = Math.max(1, Math.min(Number(params.count) || 6, 10))
      try {
        const results = await lianwangSousuo(params.query, count)
        return { content: [{ type: 'text', text: geshiSousuoJieguo(params.query, results) }], details: {} }
      } catch (error) {
        return { content: [{ type: 'text', text: `搜索失败：${error?.message ?? '网络异常'}` }], details: {} }
      }
    },
  })

  const fetchUrlTool = pi.defineTool({
    name: 'fetch_url',
    label: '抓取网页',
    description: '抓取指定 http(s) 网页并提取正文文本，用于读取搜索结果的具体内容（如查询实时天气、股价等需要打开页面的信息）。',
    parameters: Type.Object({
      url: Type.String({ description: '要抓取的网页链接' }),
    }),
    execute: async (toolCallId, params) => {
      try {
        const result = await fetchUrl(String(params.url ?? ''))
        if (!result.chenggong) return { content: [{ type: 'text', text: `抓取失败：${result.xiaoxi ?? '未知错误'}` }], details: {} }
        const url = String(params.url ?? '').trim()
        const title = String(result.title ?? '').trim()
        if (url && title) gongjuWanchengXiangqingMap.set(toolCallId, `网页：${title}\n链接：${url}`)
        const head = result.title ? `【${result.title}】\n` : ''
        return { content: [{ type: 'text', text: `${head}${result.content}` }], details: {} }
      } catch (error) {
        return { content: [{ type: 'text', text: `抓取失败：${error?.message ?? '未知错误'}` }], details: {} }
      }
    },
  })

  const librarySearchTool = pi.defineTool({
    name: 'library_search',
    label: '资料库搜索',
    description: '在用户本地 AetherDock 全部已索引资料中搜索条目，返回标题、类型与条目 id（id 可用于 library_read 读取内容）。不填 keyword 时返回全库概览，最近打开会单独标注为使用记录。',
    parameters: Type.Object({
      keyword: Type.Optional(Type.String({ description: '搜索关键词，可选' })),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const keyword = String(params.keyword ?? '').trim()
        const result = await searchLibrary(keyword)
        if (!keyword && result?.overview) {
          const counts = result.overview.counts ?? {}
          const categoryLines = [
            ['document', '文档'],
            ['image', '图片'],
            ['url', '链接'],
            ['application', '应用'],
          ]
            .map(([type, label]) => `${label}：${Number(counts[type]) || 0} 项`)
            .join('\n')
          const total = ['document', 'image', 'url', 'application']
            .reduce((sum, type) => sum + (Number(counts[type]) || 0), 0)
          if (!total) return { content: [{ type: 'text', text: '资料库中还没有已索引内容。' }], details: {} }
          const recentCount = Number(counts.recent) || 0
          return {
            content: [{
              type: 'text',
              text: `资料库概览（共 ${total} 项）\n${categoryLines}\n\n最近打开：${recentCount} 项。这是使用记录，不代表资料库全部内容。`,
            }],
            details: {},
          }
        }
        const items = (result?.items ?? []).slice(0, 10)
        if (!items.length) return { content: [{ type: 'text', text: keyword ? `资料库中没有找到与“${keyword}”匹配的内容。` : '资料库中还没有内容。' }], details: {} }
        const lines = items.map((item, index) => {
          const typeLabel = ziliaoTypeLabels[item.type] || '资料'
          const source = item.sourceUrl || item.relativePath || item.sourcePath || ''
          return `${index + 1}. [${typeLabel}] ${item.title}\n   id: ${item.id}${source ? `\n   来源: ${source}` : ''}`
        })
        return { content: [{ type: 'text', text: lines.join('\n') }], details: {} }
      } catch (error) {
        return { content: [{ type: 'text', text: `资料库搜索失败：${error?.message ?? '未知错误'}` }], details: {} }
      }
    },
  })

  const libraryReadTool = pi.defineTool({
    name: 'library_read',
    label: '读取资料库文件',
    description: '读取资料库中指定条目的内容，用于回答“这篇文档/笔记讲了什么”。id 来自 library_search 返回的 id。',
    parameters: Type.Object({
      id: Type.String({ description: '资料库条目 id' }),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const result = await libraryRead(String(params.id ?? ''))
        if (!result.chenggong) return { content: [{ type: 'text', text: `读取失败：${result.xiaoxi ?? '未知错误'}` }], details: {} }
        if (result.type === 'url') return { content: [{ type: 'text', text: `【链接】${result.title}\n${result.content}` }], details: {} }
        if (result.type === 'image') return { content: [{ type: 'text', text: `【图片】${result.title}（图片暂不支持文本读取）` }], details: {} }
        if (result.type === 'binary') return { content: [{ type: 'text', text: `【${result.title}】${result.hint ?? '该文件类型暂不支持文本读取'}` }], details: {} }
        return { content: [{ type: 'text', text: `【${result.title}】\n${result.content}` }], details: {} }
      } catch (error) {
        return { content: [{ type: 'text', text: `读取失败：${error?.message ?? '未知错误'}` }], details: {} }
      }
    },
  })

  const saveNoteTool = pi.defineTool({
    name: 'save_note',
    label: '保存到收集箱',
    description: '把一段知识、总结或搜索结果保存到 AetherDock 资料库的收集箱。title 为笔记标题，content 为正文，sourceUrl 为可选的来源链接。',
    parameters: Type.Object({
      title: Type.String({ description: '笔记标题' }),
      content: Type.String({ description: '要保存的知识正文' }),
      sourceUrl: Type.Optional(Type.String({ description: '来源链接，可选' })),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const result = await saveNote({
          title: String(params.title ?? ''),
          content: String(params.content ?? ''),
          sourceUrl: String(params.sourceUrl ?? ''),
        })
        if (!result.chenggong) {
          return { content: [{ type: 'text', text: `保存失败：${result.xiaoxi ?? '未知错误'}` }], details: {} }
        }
        const duplicateHint = result.duplicate ? '（该内容已在收集箱中，未重复添加）' : ''
        return { content: [{ type: 'text', text: `已保存到收集箱：${result.title ?? ''}${duplicateHint}。可到收集箱确认后归档到资料库。` }], details: {} }
      } catch (error) {
        return { content: [{ type: 'text', text: `保存失败：${error?.message ?? '未知错误'}` }], details: {} }
      }
    },
  })

  const inboxListTool = pi.defineTool({
    name: 'inbox_list',
    label: '查看收集箱',
    description: '列出收集箱中的待归档内容及其 id。仅用于查看，不会修改任何内容。',
    parameters: Type.Object({}),
    execute: async () => {
      const items = listInbox().items ?? []
      if (!items.length) return { content: [{ type: 'text', text: '收集箱中没有待处理内容。' }], details: {} }
      return { content: [{ type: 'text', text: items.map((item, index) => `${index + 1}. [${ziliaoTypeLabels[item.type] || '资料'}] ${item.title}\n   id: ${item.id}`).join('\n') }], details: {} }
    },
  })

  const inboxArchiveTool = pi.defineTool({
    name: 'inbox_archive',
    label: '归档收集箱内容',
    description: '将收集箱中指定 id 的内容归档到资料库。调用后会展示操作明细，只有用户确认才会执行。',
    parameters: Type.Object({ ids: Type.Array(Type.String({ description: '收集箱条目 id' })) }),
    execute: async (_toolCallId, params) => {
      const ids = [...new Set((params.ids ?? []).map((id) => String(id).trim()).filter(Boolean))].slice(0, 20)
      if (!ids.length) return { content: [{ type: 'text', text: '请提供要归档的收集箱条目。' }], details: {} }
      const items = new Map((listInbox().items ?? []).map((item) => [item.id, item]))
      const selectedItems = ids.map((id) => items.get(id)).filter(Boolean)
      if (!selectedItems.length) return { content: [{ type: 'text', text: '指定的收集箱内容已不存在。' }], details: {} }
        if (!(await querenZiliaokuXieru({ title: '允许归档到资料库？', message: `将归档 ${selectedItems.length} 项收集箱内容。`, detail: selectedItems.map((item) => `• ${item.title}`).join('\n'), tone: 'default' }))) {
          return { content: [{ type: 'text', text: '已拒绝归档，收集箱内容未变更。' }], details: {} }
      }
      const result = await archiveInbox(selectedItems.map((item) => item.id))
      return { content: [{ type: 'text', text: result.chenggong ? `已归档 ${result.removedIds.length} 项内容。` : (result.xiaoxi || '归档未完成。') }], details: {} }
    },
  })

  const inboxRemoveTool = pi.defineTool({
    name: 'inbox_remove',
    label: '移除收集箱内容',
    description: '移除收集箱中指定 id 的内容。调用后只有用户确认才会执行。',
    parameters: Type.Object({ ids: Type.Array(Type.String({ description: '收集箱条目 id' })) }),
    execute: async (_toolCallId, params) => {
      const ids = [...new Set((params.ids ?? []).map((id) => String(id).trim()).filter(Boolean))].slice(0, 20)
      if (!ids.length) return { content: [{ type: 'text', text: '请提供要移除的收集箱条目。' }], details: {} }
      const items = new Map((listInbox().items ?? []).map((item) => [item.id, item]))
      const selectedItems = ids.map((id) => items.get(id)).filter(Boolean)
      if (!selectedItems.length) return { content: [{ type: 'text', text: '指定的收集箱内容已不存在。' }], details: {} }
        if (!(await querenZiliaokuXieru({ title: '允许移除收集箱内容？', message: `将移除 ${selectedItems.length} 项收集箱内容。`, detail: selectedItems.map((item) => `• ${item.title}`).join('\n'), tone: 'danger' }))) {
          return { content: [{ type: 'text', text: '已拒绝移除，收集箱内容未变更。' }], details: {} }
      }
      const result = removeInbox(selectedItems.map((item) => item.id))
      return { content: [{ type: 'text', text: result.removedIds?.length ? `已移除 ${result.removedIds.length} 项收集箱内容。` : '未找到可移除的收集箱内容。' }], details: {} }
    },
  })

  const libraryRenameTool = pi.defineTool({
    name: 'library_rename',
    label: '重命名资料库条目',
    description: '重命名指定资料库条目。调用后只有用户确认才会执行。',
    parameters: Type.Object({ id: Type.String({ description: '资料库条目 id' }), title: Type.String({ description: '新名称' }) }),
    execute: async (_toolCallId, params) => {
      const id = String(params.id ?? '').trim()
      const title = String(params.title ?? '').trim()
      if (!id || !title) return { content: [{ type: 'text', text: '条目 id 和新名称不能为空。' }], details: {} }
      const item = getLibraryItem(id)
      if (!item) return { content: [{ type: 'text', text: '指定的资料库条目已不存在。' }], details: {} }
      if (!(await querenZiliaokuXieru({ title: '允许重命名资料？', message: `将“${item.title}”重命名为“${title}”。`, detail: `条目 ID：${id}`, tone: 'default' }))) {
        return { content: [{ type: 'text', text: '已拒绝重命名，资料名称未变更。' }], details: {} }
      }
      const result = await renameLibraryItem(id, title)
      return { content: [{ type: 'text', text: result.chenggong ? `已重命名为“${result.title}”。` : (result.xiaoxi || '重命名失败。') }], details: {} }
    },
  })

  const libraryDeleteTool = pi.defineTool({
    name: 'library_delete',
    label: '删除资料库条目',
    description: '删除指定资料库条目及其受管文件。调用后只有用户确认才会执行。',
    parameters: Type.Object({ id: Type.String({ description: '资料库条目 id' }) }),
    execute: async (_toolCallId, params) => {
      const id = String(params.id ?? '').trim()
      if (!id) return { content: [{ type: 'text', text: '请提供要删除的资料库条目 id。' }], details: {} }
      const item = getLibraryItem(id)
      if (!item) return { content: [{ type: 'text', text: '指定的资料库条目已不存在。' }], details: {} }
      const impact = item.storageMode === 'managed' ? '受管文件会一并删除，且无法恢复。' : '仅移除 AetherDock 中的资料记录。'
      if (!(await querenZiliaokuXieru({ title: '允许删除资料？', message: `将删除“${item.title}”。`, detail: `${impact}\n条目 ID：${id}`, tone: 'danger' }))) {
        return { content: [{ type: 'text', text: '已拒绝删除，资料未删除。' }], details: {} }
      }
      const result = await deleteLibraryItem(id)
      return { content: [{ type: 'text', text: result.chenggong ? '资料已删除。' : (result.xiaoxi || '删除失败。') }], details: {} }
    },
  })

  const libraryUpdateNotesTool = pi.defineTool({
    name: 'library_update_notes',
    label: '更新资料库笔记',
    description: '更新指定资料库条目的笔记。调用后只有用户确认才会执行。',
    parameters: Type.Object({ id: Type.String({ description: '资料库条目 id' }), notes: Type.String({ description: '完整笔记内容' }) }),
    execute: async (_toolCallId, params) => {
      const id = String(params.id ?? '').trim()
      const notes = String(params.notes ?? '').trim()
      if (!id) return { content: [{ type: 'text', text: '请提供要更新的资料库条目 id。' }], details: {} }
      const item = getLibraryItem(id)
      if (!item) return { content: [{ type: 'text', text: '指定的资料库条目已不存在。' }], details: {} }
      if (!(await querenZiliaokuXieru({ title: '允许更新资料笔记？', message: `将覆盖“${item.title}”的笔记内容。`, detail: `新笔记：${notes.slice(0, 500)}`, tone: 'default' }))) {
        return { content: [{ type: 'text', text: '已拒绝更新，资料笔记未变更。' }], details: {} }
      }
      const result = updateLibraryNotes(id, notes)
      return { content: [{ type: 'text', text: result.chenggong ? '资料笔记已更新。' : (result.xiaoxi || '更新笔记失败。') }], details: {} }
    },
  })

  const createDocxCopyTool = pi.defineTool({
    name: 'create_docx_copy',
    label: '生成 DOCX Word 修订副本',
    description: '仅用于用户明确要求 DOCX/Word 修订副本的情况。根据已读取的资料库 DOCX、Markdown 或 TXT 内容生成新的 DOCX 并加入资料库。不得用于 Excel、XLS、XLSX、CSV 或其他格式请求；不支持目标格式时应直接说明无法生成。',
    parameters: Type.Object({
      sourceItemId: Type.String({ description: '原始资料库 DOCX、Markdown 或 TXT 条目 id' }),
      title: Type.String({ description: '修订副本标题，不需要扩展名' }),
      content: Type.String({ description: '写入修订副本的正文内容，TXT 可直接使用原文' }),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const result = await createDocxCopy({
          sourceItemId: String(params.sourceItemId ?? ''),
          title: String(params.title ?? ''),
          content: String(params.content ?? ''),
          yixianShouquan: xiaofeiYuxianWenjianShouquan('create_docx_copy'),
        })
        if (!result.chenggong) {
          if (result.daima === 'user_declined') return { content: [{ type: 'text', text: '已拒绝生成，Word 副本未创建。' }], details: {} }
          return { content: [{ type: 'text', text: `生成失败：${result.xiaoxi ?? '未知错误'}` }], details: {} }
        }
        return { content: [{ type: 'text', text: `已生成 Word 修订副本《${result.title}》并加入资料库，原文件未被修改。` }], details: {} }
      } catch (error) {
        return { content: [{ type: 'text', text: `生成失败：${error?.message ?? '未知错误'}` }], details: {} }
      }
    },
  })

  const createXlsxWorkbookTool = pi.defineTool({
    name: 'create_xlsx_workbook',
    label: '生成 Excel 工作簿',
    description: '仅生成 XLSX 格式的 Excel 工作簿并加入资料库。用户要求 Excel（未指定后缀）或明确要求 XLSX 时使用；不得用于明确要求旧式 XLS、DOCX、CSV 或其他格式的请求。目标格式不受支持时必须直接说明无法生成，不能降级或改用其他工具。Markdown 表格会转换为工作表中的列和行；仅在用户明确要求生成表格时调用。',
    parameters: Type.Object({
      sourceItemId: Type.Optional(Type.String({ description: '可选：用于命名的原始资料库条目 id' })),
      title: Type.String({ description: '工作簿标题，不需要扩展名' }),
      content: Type.String({ description: '工作表内容；表格必须使用 Markdown 表格格式' }),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const result = await createXlsxWorkbook({
          sourceItemId: String(params.sourceItemId ?? ''),
          title: String(params.title ?? ''),
          content: String(params.content ?? ''),
          yixianShouquan: xiaofeiYuxianWenjianShouquan('create_xlsx_workbook'),
        })
        if (!result.chenggong) {
          if (result.daima === 'user_declined') return { content: [{ type: 'text', text: '已拒绝生成，Excel 工作簿未创建。' }], details: {} }
          return { content: [{ type: 'text', text: `生成失败：${result.xiaoxi ?? '未知错误'}` }], details: {} }
        }
        return { content: [{ type: 'text', text: `已生成 Excel 工作簿《${result.title}》并加入资料库。` }], details: {} }
      } catch (error) {
        return { content: [{ type: 'text', text: `生成失败：${error?.message ?? '未知错误'}` }], details: {} }
      }
    },
  })

  const createMarkdownFileTool = pi.defineTool({
    name: 'create_markdown_file',
    label: '生成 Markdown 文件',
    description: '仅用于用户明确要求 Markdown 或 MD 文件的情况。根据用户提供或当前整理出的内容创建新的 UTF-8 Markdown 文件并加入资料库，不会覆盖任何原始资料。不得用于 PDF、DOCX、XLSX、CSV 或其他格式请求。',
    parameters: Type.Object({
      title: Type.String({ description: 'Markdown 文件标题，不需要扩展名' }),
      content: Type.String({ description: '写入 Markdown 文件的正文' }),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const result = await createMarkdownFile({
          title: String(params.title ?? ''),
          content: String(params.content ?? ''),
          yixianShouquan: xiaofeiYuxianWenjianShouquan('create_markdown_file'),
        })
        if (!result.chenggong) {
          if (result.daima === 'user_declined') return { content: [{ type: 'text', text: '已拒绝生成，Markdown 文件未创建。' }], details: {} }
          return { content: [{ type: 'text', text: `生成失败：${result.xiaoxi ?? '未知错误'}` }], details: {} }
        }
        return { content: [{ type: 'text', text: `已生成 Markdown 文件《${result.title}》并加入资料库。` }], details: {} }
      } catch (error) {
        return { content: [{ type: 'text', text: `生成失败：${error?.message ?? '未知错误'}` }], details: {} }
      }
    },
  })

  const createPdfDocumentTool = pi.defineTool({
    name: 'create_pdf_document',
    label: '生成 PDF 文件',
    description: '仅用于用户明确要求 PDF 文件的情况。根据用户提供或当前整理出的内容创建新的 A4 PDF 文件并加入资料库，不会覆盖任何原始资料。支持常用 Markdown 的标题、段落、列表和代码块；不得用于 DOCX、XLSX、CSV 或其他格式请求。',
    parameters: Type.Object({
      title: Type.String({ description: 'PDF 文件标题，不需要扩展名' }),
      content: Type.String({ description: '写入 PDF 文件的正文，支持常用 Markdown 结构' }),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const result = await createPdfDocument({
          title: String(params.title ?? ''),
          content: String(params.content ?? ''),
          yixianShouquan: xiaofeiYuxianWenjianShouquan('create_pdf_document'),
        })
        if (!result.chenggong) {
          if (result.daima === 'user_declined') return { content: [{ type: 'text', text: '已拒绝生成，PDF 文件未创建。' }], details: {} }
          return { content: [{ type: 'text', text: `生成失败：${result.xiaoxi ?? '未知错误'}` }], details: {} }
        }
        return { content: [{ type: 'text', text: `已生成 PDF 文件《${result.title}》并加入资料库。` }], details: {} }
      } catch (error) {
        return { content: [{ type: 'text', text: `生成失败：${error?.message ?? '未知错误'}` }], details: {} }
      }
    },
  })

  return [webSearchTool, fetchUrlTool, librarySearchTool, libraryReadTool, inboxListTool, saveNoteTool, createDocxCopyTool, createXlsxWorkbookTool, createMarkdownFileTool, createPdfDocumentTool, inboxArchiveTool, inboxRemoveTool, libraryRenameTool, libraryDeleteTool, libraryUpdateNotesTool]
}

// 流式文本按短间隔聚合后统一推送，避免逐 token 触发主进程到渲染层的 IPC 洪峰。
const TEXT_FLUSH_MS = 50
const MAX_TEXT_BATCH_CHARS = 12 * 1024
let pendingText = ''
let flushTextTimer = null

function paifaText(delta) {
  pendingText += String(delta ?? '')
  if (pendingText.length >= MAX_TEXT_BATCH_CHARS) {
    qingkongTextDuilie()
    return
  }
  if (flushTextTimer) return
  flushTextTimer = setTimeout(qingkongTextDuilie, TEXT_FLUSH_MS)
  flushTextTimer.unref?.()
}

function qingkongTextDuilie() {
  if (flushTextTimer) {
    clearTimeout(flushTextTimer)
    flushTextTimer = null
  }
  if (!pendingText) return
  const delta = pendingText
  pendingText = ''
  sendEvent({ type: 'text', delta })
}

function anzhuangDingyue() {
  quxiaoSessionDingyue()
  quxiaoSessionDingyue = session.subscribe((event) => {
    switch (event.type) {
      case 'agent_start':
        // 清掉上一轮可能残留的未推送文本，避免串入新一轮回复。
        qingkongTextDuilie()
        sendEvent({ type: 'start' })
        break
      case 'agent_settled':
        qingkongTextDuilie()
        yuxianShouquanWenjianToolName = ''
        sendEvent({ type: 'end' })
        break
      case 'message_update': {
        const detail = event.assistantMessageEvent
        // 仅推送文本增量；thinking 等渲染层不消费，避免无效 IPC。
        if (detail?.type === 'text_delta') paifaText(detail.delta)
        break
      }
      case 'message_end': {
        const message = event.message
        // 模型层错误会附在最终消息上，不会使 session.prompt() 抛出异常。
        if (message?.role === 'assistant' && message.stopReason === 'error') {
          qingkongTextDuilie()
          sendEvent({ type: 'error', message: message.errorMessage ?? '模型调用失败' })
        } else if (message?.role === 'assistant') {
          // 用供应商返回的真实输出 token 计算速率，缺失用量时保持为 0 并由界面隐藏。
          const outputTokens = Number(message.usage?.output)
          sendEvent({ type: 'usage', outputTokens: Number.isFinite(outputTokens) && outputTokens > 0 ? Math.round(outputTokens) : 0 })
        }
        break
      }
      case 'tool_execution_start':
        // 先推送工具调用前积压的文本，保证授权卡和结果节点位于正确的对话位置。
        qingkongTextDuilie()
        sendEvent({
          type: 'tool',
          callId: event.toolCallId,
          name: event.toolName,
          label: toolLabels[event.toolName] ?? event.toolName ?? '处理中',
          detail: huoquGongjuXiangqing(event.toolName, event.args, event.toolCallId),
        })
        break
      case 'tool_execution_end': {
        qingkongTextDuilie()
        const resultText = shouquanXieruGongjuNames.has(event.toolName)
          ? tiquGongjuWenbenJieguo(event.result)
          : ''
        sendEvent({
          type: 'tool-end',
          callId: event.toolCallId,
          name: event.toolName,
          label: toolLabels[event.toolName] ?? event.toolName ?? '处理中',
          detail: resultText || huoquGongjuXiangqing(event.toolName, event.args, event.toolCallId, true),
          resultText,
          resultType: zhenZhengShouquanGongjuNames.has(event.toolName) ? 'approval' : 'operation',
          failed: Boolean(event.isError),
        })
        break
      }
      default:
        break
    }
  })
}

// 读取当前 JSON 配置；不存在时返回空对象，异常内容不覆盖原文件。
async function duquJsonDuiXiang(filePath) {
  const fsp = require('node:fs/promises')
  try {
    const value = JSON.parse(await fsp.readFile(filePath, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置内容不是对象')
    return value
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

// 通过临时文件原子写入配置，避免异常退出损坏模型或凭据记录。
async function yuanziXieruJson(filePath, value, mode = 0o600) {
  const fsp = require('node:fs/promises')
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(tempPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode })
  await fsp.rename(tempPath, filePath)
}

// 保存用户最后主动选择的模型，重启后优先恢复其工作上下文。
async function baocunYixuanMoxing(model) {
  if (!selectedModelPath || !model?.provider || !model?.id) return
  await yuanziXieruJson(selectedModelPath, { provider: model.provider, modelId: model.id })
}

// 当前没有可用模型时清除旧选择，避免下次启动尝试恢复已删除的供应商。
async function qingchuYixuanMoxing() {
  if (!selectedModelPath) return
  const fsp = require('node:fs/promises')
  try {
    await fsp.unlink(selectedModelPath)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function duquYixuanMoxing() {
  if (!selectedModelPath) return null
  try {
    const value = await duquJsonDuiXiang(selectedModelPath)
    if (typeof value.provider !== 'string' || typeof value.modelId !== 'string') return null
    return value
  } catch {
    return null
  }
}

// 统一维护不同兼容接口的推理请求格式；仅在可确定识别时启用。
const tuiliMosshiPeizhi = {
  openai: {
    reasoning: true,
    compat: { supportsReasoningEffort: true, thinkingFormat: 'openai' },
  },
  deepseek: {
    reasoning: true,
    thinkingLevelMap: {
      minimal: null,
      low: null,
      medium: null,
      high: 'high',
      xhigh: null,
      max: 'max',
    },
    compat: { supportsReasoningEffort: true, thinkingFormat: 'deepseek' },
  },
  openrouter: {
    reasoning: true,
    compat: { supportsReasoningEffort: true, thinkingFormat: 'openrouter' },
  },
  together: {
    reasoning: true,
    compat: { supportsReasoningEffort: true, thinkingFormat: 'together' },
  },
  qwen: {
    reasoning: true,
    compat: { thinkingFormat: 'qwen' },
  },
  anthropic: {
    reasoning: true,
    compat: { forceAdaptiveThinking: true },
  },
}

// 从官方地址与已确认的模型 ID 推导推理格式，避免同一供应商的非推理模型被误开启。
function tuidaoTuiliMosshi(modelId, baseUrl) {
  const id = String(modelId ?? '').trim().toLowerCase()
  const shifouDeepSeek = /(?:^|\/)deepseek-(?:r1|reasoner|v4-pro)(?:[.-]|$)/.test(id)
  const shifouOpenAI = /(?:^|\/)(?:o[134](?:[.-]|$)|gpt-5(?:[.-]|$))/.test(id)
  const shifouQwen = /(?:^|\/)qwen3(?:[.-]|$)/.test(id)
  const shifouClaude = /(?:^|\/)claude-(?:(?:[\w-]+-)?(?:3-7|4)(?:[.-]|$)|3-7-)/.test(id)
  const shifouYizhiTuiliMoxing = shifouDeepSeek || shifouOpenAI || shifouQwen || shifouClaude
  try {
    const hostname = new URL(String(baseUrl ?? '')).hostname.toLowerCase()
    if ((hostname === 'openrouter.ai' || hostname === 'api.together.xyz') && shifouYizhiTuiliMoxing) {
      return hostname === 'openrouter.ai' ? 'openrouter' : 'together'
    }
    if (hostname === 'api.deepseek.com' && shifouDeepSeek) return 'deepseek'
    if ((hostname === 'api.openai.com' || hostname.endsWith('.openai.azure.com')) && shifouOpenAI) return 'openai'
    if ((hostname === 'dashscope.aliyuncs.com' || hostname.endsWith('.dashscope.aliyuncs.com')) && shifouQwen) return 'qwen'
    if (hostname === 'api.anthropic.com' && shifouClaude) return 'anthropic'
  } catch {}
  return id === 'deepseek-v4-pro' ? 'deepseek' : ''
}

// 为模型生成 Pi 所需的推理配置，全程由模型与供应商自动判断。
function huoquMoxingTuiliPeizhi(modelId, baseUrl) {
  const mosshi = tuidaoTuiliMosshi(modelId, baseUrl)
  const peizhi = tuiliMosshiPeizhi[mosshi]
  if (!peizhi) return null
  return {
    ...peizhi,
    thinkingLevelMap: peizhi.thinkingLevelMap ? { ...peizhi.thinkingLevelMap } : undefined,
    compat: { ...peizhi.compat },
  }
}

// 迁移本应用旧版本写入的模型配置，使已支持推理的模型无需重新接入供应商。
async function qianyiMoxingTuiliPeizhi() {
  const current = await duquJsonDuiXiang(modelsPath)
  const providers = current.providers
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return false
  let changed = false
  for (const provider of Object.values(providers)) {
    if (!provider || !Array.isArray(provider.models)) continue
    const shiyongSystemRole = provider.api === 'openai-completions'
    for (let index = 0; index < provider.models.length; index += 1) {
      const model = provider.models[index]
      const tuiliPeizhi = huoquMoxingTuiliPeizhi(model?.id, provider.baseUrl)
      const needsTuiliPeizhi = tuiliPeizhi && model?.reasoning !== true && !model?.thinkingLevelMap
      const needsSystemRole = shiyongSystemRole && model?.compat?.supportsDeveloperRole === undefined
      if (!needsTuiliPeizhi && !needsSystemRole) continue
      provider.models[index] = {
        ...model,
        ...(needsTuiliPeizhi ? tuiliPeizhi : {}),
        // OpenAI 兼容接口差异较大，统一使用 system 角色以保证通用兼容性。
        compat: {
          ...(needsTuiliPeizhi ? tuiliPeizhi.compat : model.compat),
          ...model.compat,
          ...(needsSystemRole ? { supportsDeveloperRole: false } : {}),
        },
      }
      changed = true
    }
  }
  if (changed) await yuanziXieruJson(modelsPath, current)
  return changed
}

// 选择持久化模型或首个可用模型作为默认值，密钥变更后重新解析。
async function tiaozhengMoxing() {
  const available = await modelRuntime.getAvailable()
  if (!available.length) {
    await qingchuYixuanMoxing()
    return null
  }
  const current = session?.model
  if (current && available.some((model) => model.provider === current.provider && model.id === current.id)) return current
  const preferred = await duquYixuanMoxing()
  const model = available.find((item) => item.provider === preferred?.provider && item.id === preferred?.modelId) ?? available[0]
  if (session) await session.setModel(model)
  await baocunYixuanMoxing(model)
  return model
}

async function chuangjianSession(options = {}) {
  const [{ Type }] = await Promise.all([import('typebox')])
  const currentWorkspaceDir = workspaceDir || process.cwd()
  const currentAgentDir = agentDir || pi.getAgentDir()
  // 以产品专属提示词替换 Pi 默认提示词，确保所有新会话保持一致定位。
  const resourceLoader = new pi.DefaultResourceLoader({
    cwd: currentWorkspaceDir,
    agentDir: currentAgentDir,
    systemPrompt: AETHERDOCK_SYSTEM_PROMPT,
  })
  await resourceLoader.reload()
  quxiaoSessionDingyue()
  quxiaoSessionDingyue = () => {}
  session?.dispose?.()
  const sessionManager = options.sessionFile
    ? pi.SessionManager.open(options.sessionFile, sessionDir || undefined, currentWorkspaceDir)
    : pi.SessionManager.create(currentWorkspaceDir, sessionDir || undefined, options.sessionId ? { id: options.sessionId } : undefined)
  const result = await pi.createAgentSession({
    cwd: currentWorkspaceDir,
    agentDir: currentAgentDir,
    sessionManager,
    modelRuntime,
    resourceLoader,
    // 关闭 Pi 默认的文件与命令工具，仅保留下方注册的资料处理工具。
    noTools: 'builtin',
    customTools: jiangzaoGongju(Type),
  })
  session = result.session
  anzhuangDingyue()
  const model = await tiaozhengMoxing()
  return { model, modelFallbackMessage: result.modelFallbackMessage, sessionFile: sessionManager.getSessionFile() }
}

async function querenJiuxu() {
  if (!initPromise) init()
  await initPromise
  if (!session) throw new Error('助手尚未初始化')
}

function init(options = {}) {
  if (initPromise) return initPromise
  peizhi(options)
  initPromise = (async () => {
    await huoquPi()
    const configDir = agentDir || pi.getAgentDir()
    authPath = path.join(configDir, 'auth.json')
    modelsPath = path.join(configDir, 'models.json')
    selectedModelPath = path.join(configDir, 'selected-model.json')
    const fsp = require('node:fs/promises')
    await Promise.all([
      fsp.mkdir(configDir, { recursive: true }),
      workspaceDir ? fsp.mkdir(workspaceDir, { recursive: true }) : Promise.resolve(),
    ])
    await qianyiMoxingTuiliPeizhi()
    modelRuntime = await pi.ModelRuntime.create({ authPath, modelsPath })
    await chuangjianSession()
  })()
  initPromise.catch(() => {
    // 初始化失败后释放状态，用户修正网络或配置后可直接重试。
    initPromise = null
    modelRuntime = null
    session = null
  })
  return initPromise
}

// 发送消息；运行中的会话按转向消息排队，避免覆盖当前回合。
async function faSong(message) {
  const text = String(message ?? '').trim()
  if (!text) return { accepted: false, xiaoxi: '消息不能为空' }
  const wenjianShengchengQingqiu = tiquWenjianShengchengQingqiu(text)
  if (wenjianShengchengQingqiu) {
    const approved = await querenZiliaokuXieru({
      title: `允许生成 ${wenjianShengchengQingqiu.label} 文件？`,
      message: `将根据当前对话整理标题和内容，并创建新的 ${wenjianShengchengQingqiu.label} 文件加入资料库。`,
      detail: '不会修改任何原始资料。',
      tone: 'default',
    })
    if (!approved) {
      sendEvent({ type: 'text', delta: `已拒绝，未执行 ${wenjianShengchengQingqiu.label} 文件生成。` })
      sendEvent({ type: 'end' })
      return { accepted: true, mode: 'generation-declined' }
    }
    yuxianShouquanWenjianToolName = wenjianShengchengQingqiu.toolName
    sendEvent({ type: 'document-preparing', label: '正在整理标题和内容' })
  }
  try {
    await querenJiuxu()
  } catch (error) {
    yuxianShouquanWenjianToolName = ''
    throw error
  }
  const textWithInboxContext = zhuruJiantiebanShishiShangxiawen(text)
  const textWithGenerationApproval = wenjianShengchengQingqiu
    ? `${textWithInboxContext}\n\n[系统提示：用户已确认生成 ${wenjianShengchengQingqiu.label} 文件。请先整理标题和正文，再调用 ${wenjianShengchengQingqiu.toolName} 写入文件；本次对应格式的写入已获一次性授权，无需再次请求确认。]`
    : textWithInboxContext
  if (session.isStreaming) {
    void session.steer(textWithGenerationApproval).catch((error) => sendEvent({ type: 'error', message: error?.message ?? '发送失败' }))
    return { accepted: true, mode: 'steer' }
  }
  // Promise 完成是生命周期事件丢失时的最终兜底，确保授权后的会话不会永久卡在处理中。
  void session.prompt(textWithGenerationApproval)
    .then(() => sendEvent({ type: 'end' }))
    .catch((error) => {
      yuxianShouquanWenjianToolName = ''
      sendEvent({ type: 'error', message: error?.message ?? '请求失败' })
    })
  return { accepted: true, mode: 'prompt' }
}

async function zhongzhi() {
  if (!session) return
  try {
    await session.abort()
  } catch {}
}

// 切换到指定的持久化会话，Pi 负责恢复该会话的上下文树。
async function qiehuanHuihua(options = {}) {
  await querenJiuxu()
  if (session?.isStreaming) return { chenggong: false, xiaoxi: '请先停止当前回复，再切换对话' }
  const sessionId = String(options.id ?? '').trim()
  if (!sessionId) return { chenggong: false, xiaoxi: '会话标识无效' }
  const result = await chuangjianSession({ sessionId, sessionFile: String(options.sessionFile ?? '').trim() })
  return { chenggong: true, sessionFile: result.sessionFile }
}

async function getStatus() {
  await querenJiuxu()
  const available = await modelRuntime.getAvailable()
  // 未配置任何模型时，Pi 会给出 id/name 为 "unknown" 的占位对象，需归一为「未选择」。
  const rawCurrent = session.model
  const current = rawCurrent && rawCurrent.id && rawCurrent.id !== 'unknown'
    && available.some((model) => model.provider === rawCurrent.provider && model.id === rawCurrent.id)
    ? rawCurrent
    : null
  const thinkingLevels = current && session.supportsThinking?.()
    ? session.getAvailableThinkingLevels?.() ?? []
    : []
  // 列出所有支持 API key 的供应商（含 token plan 类），供助手页配置。
  const providers = modelRuntime.getProviders()
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name || provider.id]))
  const customProviderIds = await duquCustomProviderIds()
  for (const providerId of modelRuntime.getRegisteredProviderIds()) customProviderIds.add(providerId)
  const keyProviders = providers
    .filter((provider) => provider.auth?.apiKey || customProviderIds.has(provider.id))
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      configured: modelRuntime.getProviderAuthStatus(provider.id).configured,
      custom: customProviderIds.has(provider.id),
    }))
  return {
    initialized: true,
    models: available.map((model) => ({
      provider: model.provider,
      id: model.id,
      name: model.name,
      providerName: providerNames.get(model.provider) ?? model.provider,
    })),
    current: current ? {
      provider: current.provider,
      id: current.id,
      name: current.name,
      thinkingLevel: thinkingLevels.includes(session.thinkingLevel) ? session.thinkingLevel : '',
      thinkingLevels,
    } : null,
    keyProviders,
  }
}

// 将自定义供应商及其模型写入 models.json，使用临时文件避免异常退出时损坏配置。
async function baocunModelsJson(providerId, providerConfig) {
  const current = await duquJsonDuiXiang(modelsPath)
  current.providers = current.providers ?? {}
  if (!current.providers || typeof current.providers !== 'object' || Array.isArray(current.providers)) {
    throw new Error('models.json 的 providers 配置无效')
  }
  current.providers[providerId] = providerConfig
  await yuanziXieruJson(modelsPath, current)
}

// 从持久化模型配置读取自定义供应商，重启后仍可正确区分内置与自定义项。
async function duquCustomProviderIds() {
  const current = await duquJsonDuiXiang(modelsPath)
  const providers = current.providers ?? {}
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) {
    throw new Error('models.json 的 providers 配置无效')
  }
  return new Set(Object.keys(providers))
}

// 将 API Key 写入 Pi 标准凭据文件，重启后由 ModelRuntime 自动恢复。
async function baocunProviderApiKey(providerId, apiKey) {
  const current = await duquJsonDuiXiang(authPath)
  current[providerId] = { type: 'api_key', key: apiKey }
  await yuanziXieruJson(authPath, current)
}

// 清除指定供应商持久化的密钥，运行时密钥由调用方同步移除。
async function qingchuProviderApiKey(providerId) {
  const current = await duquJsonDuiXiang(authPath)
  if (!Object.hasOwn(current, providerId)) return
  delete current[providerId]
  await yuanziXieruJson(authPath, current)
}

function zhuanProviderId(name, baseUrl, xieyi) {
  const slug = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const { createHash } = require('node:crypto')
  const suffix = createHash('sha1').update(`${xieyi}:${baseUrl}`).digest('hex').slice(0, 10)
  return `custom-${(slug || 'provider').slice(0, 28)}-${suffix}`
}

// 自定义供应商支持的接口协议及其模型运行方式。
const customXieyiConfigs = {
  openai: {
    api: 'openai-completions',
    label: 'OpenAI',
    endpointPattern: /\/(?:chat\/completions|responses|models)\/?$/i,
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }),
  },
  anthropic: {
    api: 'anthropic-messages',
    label: 'Anthropic',
    endpointPattern: /\/(?:messages|models)\/?$/i,
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      Accept: 'application/json',
    }),
  },
}

// 读取受支持协议的配置，非法值默认回退到 OpenAI 兼容协议。
function huoquXieyiConfig(xieyi) {
  return customXieyiConfigs[xieyi] ?? customXieyiConfigs.openai
}

// 规范化常见接口路径，支持直接粘贴消息或模型端点。
function guifanCompatibleBaseUrl(rawUrl, xieyi) {
  const xieyiConfig = huoquXieyiConfig(xieyi)
  const url = new URL(String(rawUrl ?? '').trim())
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname
    .replace(xieyiConfig.endpointPattern, '')
    .replace(/\/+$/, '')
  // Anthropic SDK 会自行追加 /v1/messages，基础路径不能保留版本段。
  if (xieyi === 'anthropic') url.pathname = url.pathname.replace(/\/v\d+$/i, '')
  return url.toString().replace(/\/$/, '')
}

// 生成模型目录的候选路径，兼容根路径和缺少 /v1 的常见填写方式。
function huoquModelsCandidates(baseUrl, xieyi) {
  if (xieyi === 'anthropic') return [...new Set([`${baseUrl}/v1`, baseUrl])]
  const candidates = [baseUrl]
  if (!/\/v\d+$/i.test(baseUrl)) candidates.push(`${baseUrl}/v1`)
  return [...new Set(candidates)]
}

// 读取兼容端点的模型目录，按协议发送鉴权头并返回实际可用的基础地址。
async function jianceCompatibleModels(rawBaseUrl, apiKey, xieyi) {
  const xieyiConfig = huoquXieyiConfig(xieyi)
  const normalizedBaseUrl = guifanCompatibleBaseUrl(rawBaseUrl, xieyi)
  const failures = []

  for (const baseUrl of huoquModelsCandidates(normalizedBaseUrl, xieyi)) {
    const endpoint = `${baseUrl}/models`
    try {
      const response = await fetch(endpoint, {
        headers: xieyiConfig.headers(apiKey),
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) {
        failures.push(`HTTP ${response.status}`)
        continue
      }

      const payload = await response.json()
      const data = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.models) ? payload.models : [])
      const models = data
        .map((entry) => {
          const id = String(entry?.id ?? entry?.model ?? entry?.name ?? '').trim()
          const name = String(entry?.display_name ?? entry?.name ?? id).trim()
          return id ? { id, name: name || id } : null
        })
        .filter(Boolean)
      if (models.length) {
        return { baseUrl: xieyi === 'anthropic' ? normalizedBaseUrl : baseUrl, models }
      }
      failures.push('未返回模型列表')
    } catch (error) {
      failures.push(error?.name === 'TimeoutError' ? '请求超时' : '连接失败')
    }
  }

  const reason = [...new Set(failures)].join('、') || '未知错误'
  throw new Error(`无法读取模型列表（${reason}）。请确认路径、密钥和 ${xieyiConfig.label} 兼容性`)
}

// 新增自定义供应商：填名称 + 路径 + 密钥后自动识别模型并接入。
async function tianjiaGongyingshang(raw) {
  await querenJiuxu()
  let name = String(raw?.name ?? '').trim()
  const baseUrl = String(raw?.baseUrl ?? '').trim().replace(/\/+$/, '')
  const manualModelId = String(raw?.modelId ?? '').trim()
  const xieyi = raw?.xieyi === 'anthropic' || raw?.xieyi === 'openai'
    ? raw.xieyi
    : (tuidaoCompatibleXieyi(baseUrl) || 'openai')
  const xieyiConfig = huoquXieyiConfig(xieyi)
  const apiKey = String(raw?.apiKey ?? '').trim()
  if (!/^https?:\/\//i.test(baseUrl)) return { chenggong: false, xiaoxi: '路径需以 http(s):// 开头' }
  if (!apiKey) return { chenggong: false, xiaoxi: '请填写密钥' }
  if (!name) name = tuidaoProviderName(baseUrl) || '自定义供应商'

  let discovery
  try {
    discovery = await jianceCompatibleModels(baseUrl, apiKey, xieyi)
  } catch (error) {
    if (!manualModelId) {
      return {
        chenggong: false,
        xiaoxi: `自动识别模型失败：${error?.message ?? '未知错误'}。该服务可能不提供 /models，请填写模型 ID 后重试`,
      }
    }
    discovery = {
      baseUrl: guifanCompatibleBaseUrl(baseUrl, xieyi),
      models: [{ id: manualModelId, name: manualModelId }],
    }
  }
  const modelList = discovery.models
  const resolvedBaseUrl = discovery.baseUrl

  const providerId = zhuanProviderId(name, resolvedBaseUrl, xieyi)
  const providerConfig = {
    name,
    baseUrl: resolvedBaseUrl,
    api: xieyiConfig.api,
    models: modelList.map((model) => {
      const tuiliPeizhi = huoquMoxingTuiliPeizhi(model.id, resolvedBaseUrl)
      return {
        id: model.id,
        name: model.name,
        reasoning: false,
        input: ['text'],
        contextWindow: 128000,
        maxTokens: 8192,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        ...tuiliPeizhi,
        // 自定义 OpenAI 兼容服务统一使用 system，避免接口拒绝 developer 角色。
        compat: { ...tuiliPeizhi?.compat, supportsDeveloperRole: false },
      }
    }),
  }

  try {
    modelRuntime.registerProvider(providerId, { name, baseUrl: resolvedBaseUrl, api: xieyiConfig.api, models: providerConfig.models })
    await modelRuntime.setRuntimeApiKey(providerId, apiKey)
    await Promise.all([
      baocunModelsJson(providerId, providerConfig),
      baocunProviderApiKey(providerId, apiKey),
    ])
  } catch (error) {
    return { chenggong: false, xiaoxi: `供应商接入失败：${error?.message ?? '未知错误'}` }
  }

  const available = await modelRuntime.getAvailable()
  const providerModels = available.filter((model) => model.provider === providerId)
  if (providerModels.length && session) {
    await session.setModel(providerModels[0])
    await baocunYixuanMoxing(providerModels[0])
  }
  return { chenggong: true, shendu: modelList.length, status: await getStatus() }
}

async function setProviderKey(provider, key) {
  await querenJiuxu()
  const value = String(key ?? '').trim()
  if (!provider || !value) return { chenggong: false, xiaoxi: '供应商与密钥不能为空' }
  await modelRuntime.setRuntimeApiKey(provider, value)
  await baocunProviderApiKey(provider, value)
  await tiaozhengMoxing()
  return { chenggong: true, status: await getStatus() }
}

// 清除内置供应商密钥，并在当前模型失效时自动选择仍可用的模型。
async function qingchuProviderKey(provider) {
  await querenJiuxu()
  if (session?.isStreaming) return { chenggong: false, xiaoxi: '请先停止当前对话，再清除密钥' }
  const providerId = String(provider ?? '').trim()
  if (!providerId) return { chenggong: false, xiaoxi: '未选择供应商' }
  const customProviderIds = await duquCustomProviderIds()
  if (customProviderIds.has(providerId)) return { chenggong: false, xiaoxi: '自定义供应商请使用删除操作' }
  if (!modelRuntime.getProvider(providerId)) return { chenggong: false, xiaoxi: '未找到供应商' }
  await modelRuntime.removeRuntimeApiKey(providerId)
  await qingchuProviderApiKey(providerId)
  await tiaozhengMoxing()
  return { chenggong: true, status: await getStatus() }
}

// 删除自定义供应商的模型与凭据，并重建运行时以立即卸载旧模型。
async function shanchuCustomProvider(provider) {
  await querenJiuxu()
  if (session?.isStreaming) return { chenggong: false, xiaoxi: '请先停止当前对话，再删除供应商' }
  const providerId = String(provider ?? '').trim()
  if (!providerId) return { chenggong: false, xiaoxi: '未选择供应商' }

  const modelsConfig = await duquJsonDuiXiang(modelsPath)
  const providers = modelsConfig.providers
  if (!providers || typeof providers !== 'object' || Array.isArray(providers) || !Object.hasOwn(providers, providerId)) {
    return { chenggong: false, xiaoxi: '仅支持删除自定义供应商' }
  }

  delete providers[providerId]
  const authConfig = await duquJsonDuiXiang(authPath)
  delete authConfig[providerId]
  const selectedModel = await duquYixuanMoxing()
  await Promise.all([
    yuanziXieruJson(modelsPath, modelsConfig),
    yuanziXieruJson(authPath, authConfig),
  ])
  if (selectedModel?.provider === providerId) await qingchuYixuanMoxing()

  quxiaoSessionDingyue()
  quxiaoSessionDingyue = () => {}
  try {
    session?.dispose?.()
  } catch {}
  session = null
  modelRuntime = await pi.ModelRuntime.create({ authPath, modelsPath })
  await chuangjianSession()
  return { chenggong: true, status: await getStatus() }
}

// 切换到指定模型，供用户在助手页选择。
async function xuanzeModel(provider, modelId) {
  await querenJiuxu()
  const available = await modelRuntime.getAvailable()
  const model = available.find((item) => item.provider === String(provider) && item.id === String(modelId))
  if (!model) throw new Error('未找到该模型')
  await session.setModel(model)
  await baocunYixuanMoxing(model)
  return { chenggong: true, status: await getStatus() }
}

// 推理强度由 Pi 按当前模型能力校验，避免向不支持的供应商发送无效参数。
async function shezhiTuiliQiangdu(rawLevel) {
  await querenJiuxu()
  if (session.isStreaming) return { chenggong: false, xiaoxi: '请先停止当前回复，再调整推理强度' }
  const level = String(rawLevel ?? '')
  const thinkingLevels = session.supportsThinking?.() ? session.getAvailableThinkingLevels?.() ?? [] : []
  if (!thinkingLevels.includes(level)) return { chenggong: false, xiaoxi: '当前模型不支持该推理强度' }
  session.setThinkingLevel(level)
  return { chenggong: true, status: await getStatus() }
}

function close() {
  if (flushTextTimer) {
    clearTimeout(flushTextTimer)
    flushTextTimer = null
  }
  pendingText = ''
  yuxianShouquanWenjianToolName = ''
  quxiaoSessionDingyue()
  quxiaoSessionDingyue = () => {}
  try {
    session?.dispose?.()
  } catch {}
  session = null
}

module.exports = {
  peizhi,
  init,
  faSong,
  zhongzhi,
  qiehuanHuihua,
  getStatus,
  setProviderKey,
  qingchuProviderKey,
  xuanzeModel,
  shezhiTuiliQiangdu,
  tianjiaGongyingshang,
  shanchuCustomProvider,
  close,
}
