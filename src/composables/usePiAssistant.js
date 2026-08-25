import { onUnmounted, ref, shallowRef } from 'vue'

// 管理 Pi 助手对话状态：订阅主进程事件流、发送/中止消息、维护模型与密钥状态。
export function usePiAssistant() {
  const messages = ref([])
  const isBusy = ref(false)
  const status = shallowRef(null)
  const isStatusLoading = ref(true)
  const statusError = shallowRef('')
  const isSavingKey = ref(false)
  const isRemovingProvider = ref(false)
  const ziliaokuShouquanQingqiu = shallowRef(null)
  const conversations = ref([])
  const currentConversationId = ref('')
  const isConversationLoading = ref(false)
  let quxiaoPiEvent = () => {}
  let baocunTimer = 0
  let baocunHuihuaPromise = Promise.resolve()
  let isXinJianHuihuaZhong = false
  let isShanchuHuihuaZhong = false
  let isYixiezai = false
  const huihuaYinwen = new Map()

  function chuangjianXiaoxi(role, content = '') {
    const now = Date.now()
    return {
      id: globalThis.crypto?.randomUUID?.() ?? `${role}-${now}-${Math.random().toString(16).slice(2)}`,
      role,
      content,
      createdAt: now,
    }
  }

  // 流式回复按短间隔合并保存，避免每个字符都触发一次 SQLite 写入。
  function anpaiBaocunHuihua(delay = 450) {
    if (!currentConversationId.value || isConversationLoading.value) return
    if (baocunTimer) window.clearTimeout(baocunTimer)
    baocunTimer = window.setTimeout(() => {
      baocunTimer = 0
      void baocunDangqianHuihua()
    }, delay)
  }

  // 保存前转换为普通对象，隔离响应式引用并确保队列中的快照不会被后续流式更新改写。
  function fuzhiHuihuaXiaoxi(huihuaMessages) {
    return (huihuaMessages ?? []).map((message) => ({
      ...message,
      timeline: (message.timeline ?? []).map((block) => ({ ...block })),
      toolCalls: (message.toolCalls ?? []).map((tool) => ({ ...tool })),
    }))
  }

  // 仅比较持久化字段，避免切换会话时因界面临时状态重复写库并改变排序时间。
  function huoquHuihuaYinwen(huihuaMessages) {
    return JSON.stringify((huihuaMessages ?? []).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      pending: Boolean(message.pending),
      failed: Boolean(message.failed),
      startedAt: message.startedAt ?? 0,
      completedAt: message.completedAt ?? 0,
      createdAt: message.createdAt ?? 0,
      outputTokens: message.outputTokens ?? 0,
      timeline: (message.timeline ?? []).map((block) => ({ ...block })),
      toolCalls: (message.toolCalls ?? []).map((tool) => ({
        id: tool.id,
        name: tool.name,
        label: tool.label,
        detail: tool.detail,
        status: tool.status,
        startedAt: tool.startedAt ?? 0,
        completedAt: tool.completedAt ?? 0,
      })),
    })))
  }

  // 原位替换已有会话；新会话首次产生消息后才加入列表。
  function yuanweiGengxinHuihua(conversation) {
    const index = conversations.value.findIndex((item) => item.id === conversation?.id)
    if (index < 0) {
      if (Number(conversation?.messageCount) > 0) conversations.value = [conversation, ...conversations.value]
      return
    }
    const next = [...conversations.value]
    next[index] = { ...next[index], ...conversation }
    conversations.value = next
  }

  // 所有 SQLite 写入严格串行，防止较早的流式快照覆盖较晚的完整回复。
  function baocunDangqianHuihua(
    conversationId = currentConversationId.value,
    huihuaMessages = messages.value,
    shouldGengxinHuihuaList = true,
  ) {
    if (!conversationId) return
    const huihuaKuaiZhao = fuzhiHuihuaXiaoxi(huihuaMessages)
    const yinwen = huoquHuihuaYinwen(huihuaKuaiZhao)
    if (huihuaYinwen.get(conversationId) === yinwen) return baocunHuihuaPromise
    baocunHuihuaPromise = baocunHuihuaPromise
      .catch(() => {})
      .then(async () => {
        const result = await window.aetherDock?.chatSaveConversation(conversationId, huihuaKuaiZhao)
        if (!result?.chenggong || !result.conversation) {
          throw new Error(result?.xiaoxi || '保存对话失败')
        }
        // 切换期间可能仍有已排队的保存完成，此时同样不能触发会话列表重绘。
        if (shouldGengxinHuihuaList && !isConversationLoading.value) yuanweiGengxinHuihua(result.conversation)
        huihuaYinwen.set(conversationId, yinwen)
      })
      .catch((error) => {
        statusError.value = error?.message || '保存对话失败'
      })
    return baocunHuihuaPromise
  }

  function querenZuiHouXiaoxi() {
    const list = messages.value
    return list.length && list[list.length - 1].role === 'assistant'
      ? list[list.length - 1]
      : null
  }

  // 每次收到流式文本或工具事件时刷新时间戳，供界面准确识别真正的停顿。
  function shuaXinLiuShiHuodong(message) {
    if (message) message.lastActivityAt = Date.now()
  }

  // 将仍在执行的工具收束为终态，避免中止或异常后遗留“进行中”状态。
  function wanchengJinxingTool(message, status = 'completed', completedAt = Date.now()) {
    for (const tool of message?.toolCalls ?? []) {
      if (tool.status === 'running') {
        tool.status = status
        tool.completedAt = completedAt
      }
    }
  }

  // 将流式文本归入当前时序片段，工具开始后会自动新建下一段内容。
  function tianjiaShixuWenben(message, rawText) {
    const text = String(rawText ?? '')
    if (!message || !text) return
    message.content += text
    message.timeline ??= []
    const lastBlock = message.timeline.at(-1)
    if (lastBlock?.type === 'text') {
      lastBlock.content += text
      return
    }
    message.timeline.push({
      id: `text-${message.id}-${message.timeline.length}`,
      type: 'text',
      content: text,
    })
  }

  // 写入后的实际结果独立成时序节点，避免被当作普通回复混排。
  function tianjiaXieruJieguo(message, rawText, resultType = 'operation') {
    const text = String(rawText ?? '').trim()
    if (!message || !text) return
    message.content += text
    message.timeline ??= []
    message.timeline.push({
      id: `${resultType}-${message.id}-${message.timeline.length}`,
      type: resultType === 'approval' ? 'approval-result' : 'operation-result',
      content: text,
    })
  }

  // 工具节点只记录一次；结束事件仅更新节点状态，保留原始到达顺序。
  function tianjiaShixuGongju(message, toolId) {
    if (!message || !toolId) return
    message.timeline ??= []
    if (!message.timeline.some((block) => block.type === 'tool' && block.toolId === toolId)) {
      message.timeline.push({ id: `tool-${toolId}`, type: 'tool', toolId })
    }
  }

  // 统一常见服务商错误，让配额、鉴权与限流问题能被用户立即识别。
  function guifanMoxingCuowu(rawMessage, fallback = '请求失败，请检查模型配置与网络连接。') {
    const message = String(rawMessage ?? '').trim()
    if (/(insufficient[_\s-]?quota|quota.*(?:exceed|exhaust)|usage.*(?:exceed|exhaust)|billing.*(?:limit|exceed)|用量.*(?:耗尽|不足)|额度.*(?:耗尽|不足)|配额.*(?:耗尽|不足)|余额.*不足)/i.test(message)) {
      return '模型用量已耗尽，请充值或切换到其他可用模型后重试。'
    }
    if (/\b429\b|rate[_\s-]?limit|too many requests|请求过于频繁|请求频率/i.test(message)) {
      return '请求过于频繁，请稍后再试。'
    }
    if (/\b401\b|\b403\b|invalid.*(?:api)?[_\s-]?key|authentication|unauthorized|密钥.*(?:无效|错误)|鉴权失败/i.test(message)) {
      return 'API 密钥无效或已失效，请检查供应商配置。'
    }
    return message || fallback
  }

  function chuliEvent(event) {
    const last = querenZuiHouXiaoxi()
    switch (event?.type) {
      case 'start':
        if (last) {
          last.pending = true
          shuaXinLiuShiHuodong(last)
        }
        break
      case 'text':
        shuaXinLiuShiHuodong(last)
        tianjiaShixuWenben(last, event.delta)
        break
      case 'tool':
        if (last) {
          shuaXinLiuShiHuodong(last)
          const startedAt = Date.now()
          const callId = event.callId || `${event.name ?? 'tool'}-${Date.now()}`
          const existing = last.toolCalls.find((tool) => tool.id === callId)
          if (existing) {
            existing.status = 'running'
            existing.startedAt ||= startedAt
          } else {
            last.toolCalls.push({
              id: callId,
              name: event.name ?? 'tool',
              label: event.label ?? '处理中',
              detail: event.detail ?? '',
              status: 'running',
              startedAt,
              completedAt: 0,
            })
          }
          tianjiaShixuGongju(last, callId)
          last.toolLabel = event.label ?? '处理中'
        }
        break
      case 'tool-end':
        if (last) {
          shuaXinLiuShiHuodong(last)
          const tool = last.toolCalls.find((item) => item.id === event.callId)
          if (tool) {
            tool.status = event.failed ? 'failed' : 'completed'
            tool.completedAt = Date.now()
            // 抓取完成后用真实网页标题替换启动时的域名摘要。
            tool.detail = event.detail || tool.detail
          }
          if (event.resultText) {
            tianjiaXieruJieguo(last, event.resultText, event.resultType)
          }
          last.toolLabel = ''
        }
        break
      case 'usage':
        if (last) last.outputTokens = Number(event.outputTokens) || 0
        break
      case 'library-approval':
        ziliaokuShouquanQingqiu.value = event
        break
      case 'end':
        if (last) {
          const completedAt = Date.now()
          last.pending = false
          last.toolLabel = ''
          last.completedAt = completedAt
          wanchengJinxingTool(last, 'completed', completedAt)
          // 只有正常结束却没有可展示文本时才给出中性提示；模型错误由 message_end 单独处理。
          if (!last.content.trim()) {
            tianjiaShixuWenben(last, '本次未收到可展示的回复，请重试。')
          }
        }
        isBusy.value = false
        void baocunDangqianHuihua()
        break
      case 'error':
        if (last) {
          const completedAt = Date.now()
          last.pending = false
          last.toolLabel = ''
          last.completedAt = completedAt
          wanchengJinxingTool(last, 'failed', completedAt)
          const xiaoxi = guifanMoxingCuowu(event.message)
          tianjiaShixuWenben(last, `${last.content ? '\n' : ''}${xiaoxi}`)
          last.failed = true
        }
        isBusy.value = false
        void baocunDangqianHuihua()
        break
      default:
        break
    }
    anpaiBaocunHuihua()
  }

  function huifuXiaoxi(rawMessage) {
    const message = {
      ...rawMessage,
      pending: false,
      failed: Boolean(rawMessage?.failed),
      toolCalls: Array.isArray(rawMessage?.toolCalls)
        ? rawMessage.toolCalls.map((tool) => ({ ...tool, name: tool.name ?? tool.toolName ?? '' }))
        : [],
      timeline: Array.isArray(rawMessage?.timeline) ? rawMessage.timeline.map((block) => ({ ...block })) : [],
    }
    if (rawMessage?.pending && !message.content.trim()) message.content = '上一次回复未完成。'
    return message
  }

  async function jiazaiHuihua() {
    isConversationLoading.value = true
    try {
      const result = await window.aetherDock?.chatListConversations()
      conversations.value = result?.chenggong ? result.items ?? [] : []
      huihuaYinwen.clear()
      if (conversations.value.length) return qiehuanHuihua(conversations.value[0].id)
      return xinJianHuihua()
    } finally {
      isConversationLoading.value = false
    }
  }

  // 新建时仅清空界面；首次发送消息前不创建本地会话记录。
  async function xinJianHuihua() {
    if (isBusy.value || isConversationLoading.value || isXinJianHuihuaZhong) return false
    isXinJianHuihuaZhong = true
    try {
      const previousConversationId = currentConversationId.value
      const previousMessages = messages.value
      if (baocunTimer) window.clearTimeout(baocunTimer)
      baocunTimer = 0
      if (previousConversationId) await baocunDangqianHuihua(previousConversationId, previousMessages)
      currentConversationId.value = ''
      messages.value = []
      statusError.value = ''
      return true
    } finally {
      isXinJianHuihuaZhong = false
    }
  }

  // 首次发送前创建持久化会话，并同步建立对应的 Pi 上下文。
  async function chuangjianCunchuHuihua() {
    const result = await window.aetherDock?.chatCreateConversation()
    const conversation = result?.conversation
    if (!result?.chenggong || !conversation) return false
    const chenggong = await qiehuanHuihua(conversation.id)
    if (!chenggong || isYixiezai) {
      if (isYixiezai) await zhongzhi()
      await window.aetherDock?.chatDeleteConversation(conversation.id)
      return false
    }
    return chenggong
  }

  async function qiehuanHuihua(conversationId) {
    const id = String(conversationId ?? '')
    if (!id || isBusy.value || isConversationLoading.value || id === currentConversationId.value) return id === currentConversationId.value
    const previousConversationId = currentConversationId.value
    const previousMessages = messages.value
    isConversationLoading.value = true
    try {
      if (baocunTimer) window.clearTimeout(baocunTimer)
      baocunTimer = 0
      if (previousConversationId) await baocunDangqianHuihua(previousConversationId, previousMessages, false)
      const result = await window.aetherDock?.chatSwitchConversation(id)
      if (!result?.chenggong || !result.conversation) {
        statusError.value = result?.xiaoxi || '切换对话失败'
        return false
      }
      currentConversationId.value = result.conversation.id
      messages.value = result.conversation.messages.map(huifuXiaoxi)
      huihuaYinwen.set(result.conversation.id, huoquHuihuaYinwen(result.conversation.messages))
      statusError.value = ''
      return true
    } catch (error) {
      statusError.value = error?.message || '切换对话失败'
      return false
    } finally {
      isConversationLoading.value = false
    }
  }

  async function shanchuHuihua(conversationId) {
    const id = String(conversationId ?? '')
    if (!id || isBusy.value || isShanchuHuihuaZhong) return false
    isShanchuHuihuaZhong = true
    try {
      if (id === currentConversationId.value && !(await xinJianHuihua())) return false
      const result = await window.aetherDock?.chatDeleteConversation(id)
      if (!result?.chenggong) return false
      conversations.value = conversations.value.filter((conversation) => conversation.id !== id)
      huihuaYinwen.delete(id)
      return true
    } finally {
      isShanchuHuihuaZhong = false
    }
  }

  async function jiazaiStatus() {
    isStatusLoading.value = true
    try {
      const result = await window.aetherDock?.piGetStatus()
      if (result?.chenggong) {
        status.value = result.status
        statusError.value = ''
      } else {
        statusError.value = result?.xiaoxi || '助手尚未就绪'
      }
    } catch (error) {
      statusError.value = error?.message || '无法连接助手服务'
    } finally {
      isStatusLoading.value = false
    }
  }

  async function faSong(rawText) {
    const text = String(rawText ?? '').trim()
    if (!text || isBusy.value) return
    if (!currentConversationId.value && !(await chuangjianCunchuHuihua())) return
    const userMessage = chuangjianXiaoxi('user', text)
    const startedAt = Date.now()
    const assistantMessage = {
      ...chuangjianXiaoxi('assistant'),
      content: '',
      pending: true,
      toolLabel: '',
      toolCalls: [],
      timeline: [],
      failed: false,
      startedAt,
      lastActivityAt: startedAt,
      completedAt: 0,
      outputTokens: 0,
    }
    messages.value.push(userMessage, assistantMessage)
    isBusy.value = true
    // 先保存用户输入与占位回复，避免窗口在模型响应前关闭而丢失整轮对话。
    await baocunDangqianHuihua()
    // 页面已离开时不再发起模型请求，避免后台消耗不可见的 token。
    if (isYixiezai) {
      void zhongzhi()
      return
    }
    try {
      const ack = await window.aetherDock?.piPrompt(text)
      if (!ack?.accepted) {
        const last = querenZuiHouXiaoxi()
        if (last) {
          const completedAt = Date.now()
          last.pending = false
          last.completedAt = completedAt
          wanchengJinxingTool(last, 'failed', completedAt)
        }
        const xiaoxi = guifanMoxingCuowu(ack?.xiaoxi, '发送失败')
        if (xiaoxi && last) {
          last.content = xiaoxi
          last.failed = true
        }
        isBusy.value = false
        anpaiBaocunHuihua(0)
      }
    } catch (error) {
      const last = querenZuiHouXiaoxi()
      if (last) {
        const completedAt = Date.now()
        last.pending = false
        last.completedAt = completedAt
        wanchengJinxingTool(last, 'failed', completedAt)
        last.content = guifanMoxingCuowu(error?.message, '发送失败')
        last.failed = true
      }
      isBusy.value = false
      anpaiBaocunHuihua(0)
    }
  }

  async function zhongzhi() {
    try {
      await window.aetherDock?.piAbort()
    } catch {}
  }

  // 仅将当前确认请求回传主进程，避免过期弹窗误授权后续操作。
  async function huiyingZiliaokuShouquan(approved) {
    const request = ziliaokuShouquanQingqiu.value
    if (!request?.requestId) return false
    ziliaokuShouquanQingqiu.value = null
    try {
      const result = await window.aetherDock?.piResolveLibraryApproval(request.requestId, approved === true)
      if (result?.chenggong) return true
      ziliaokuShouquanQingqiu.value = request
      statusError.value = result?.xiaoxi || '提交授权结果失败'
      return false
    } catch (error) {
      ziliaokuShouquanQingqiu.value = request
      statusError.value = error?.message || '提交授权结果失败'
      return false
    }
  }

  async function shezhiProviderKey(provider, key) {
    isSavingKey.value = true
    try {
      const result = await window.aetherDock?.piSetProviderKey(provider, key)
      if (result?.chenggong) {
        status.value = result.status
        statusError.value = ''
        return true
      }
      statusError.value = result?.xiaoxi || '设置失败'
      return false
    } catch (error) {
      statusError.value = error?.message || '设置失败'
      return false
    } finally {
      isSavingKey.value = false
    }
  }

  async function xuanzeModel(provider, modelId) {
    try {
      const result = await window.aetherDock?.piSetModel(provider, modelId)
      if (result?.chenggong) {
        status.value = result.status
        statusError.value = ''
        return true
      }
      statusError.value = result?.xiaoxi || '切换失败'
      return false
    } catch (error) {
      statusError.value = error?.message || '切换失败'
      return false
    }
  }

  async function shezhiTuiliQiangdu(level) {
    try {
      const result = await window.aetherDock?.piSetThinking(level)
      if (result?.chenggong) {
        status.value = result.status
        statusError.value = ''
        return true
      }
      statusError.value = result?.xiaoxi || '设置失败'
      return false
    } catch (error) {
      statusError.value = error?.message || '设置失败'
      return false
    }
  }

  async function addProvider(payload) {
    try {
      const result = await window.aetherDock?.piAddProvider(payload)
      if (result?.chenggong) {
        status.value = result.status
        statusError.value = ''
        return { chenggong: true, shendu: result.shendu }
      }
      statusError.value = result?.xiaoxi || '接入失败'
      return { chenggong: false, xiaoxi: result?.xiaoxi || '接入失败' }
    } catch (error) {
      statusError.value = error?.message || '接入失败'
      return { chenggong: false, xiaoxi: error?.message || '接入失败' }
    }
  }

  // 按供应商类型执行清理：内置供应商清除密钥，自定义供应商删除整条配置。
  async function qingliProvider(provider) {
    if (isRemovingProvider.value) return false
    isRemovingProvider.value = true
    try {
      const result = provider?.custom
        ? await window.aetherDock?.piRemoveProvider(provider.id)
        : await window.aetherDock?.piClearProviderKey(provider?.id)
      if (result?.chenggong) {
        status.value = result.status
        statusError.value = ''
        return true
      }
      statusError.value = result?.xiaoxi || '清理失败'
      return false
    } catch (error) {
      statusError.value = error?.message || '清理失败'
      return false
    } finally {
      isRemovingProvider.value = false
    }
  }

  function kaishiJianting() {
    quxiaoPiEvent = window.aetherDock?.onPiEvent(chuliEvent) ?? (() => {})
  }

  function jieshuJianting() {
    quxiaoPiEvent()
    quxiaoPiEvent = () => {}
  }

  onUnmounted(jieshuJianting)
  onUnmounted(() => {
    isYixiezai = true
    if (isBusy.value) void zhongzhi()
    if (baocunTimer) window.clearTimeout(baocunTimer)
    void baocunDangqianHuihua()
  })

  return {
    messages,
    isBusy,
    status,
    isStatusLoading,
    statusError,
    isSavingKey,
    isRemovingProvider,
    ziliaokuShouquanQingqiu,
    conversations,
    currentConversationId,
    isConversationLoading,
    jiazaiStatus,
    jiazaiHuihua,
    xinJianHuihua,
    qiehuanHuihua,
    shanchuHuihua,
    faSong,
    zhongzhi,
    huiyingZiliaokuShouquan,
    shezhiProviderKey,
    xuanzeModel,
    shezhiTuiliQiangdu,
    addProvider,
    qingliProvider,
    kaishiJianting,
  }
}
