// 常见大模型兼容端点的服务商域名规则，供渲染进程和主进程共用。
const gongyingshangNameRules = [
  { mingcheng: '阿里云百炼（Token Plan）', pipei: (hostname) => hostname === 'token-plan.cn-beijing.maas.aliyuncs.com' },
  { mingcheng: '阿里云百炼（Coding Plan）', pipei: (hostname) => hostname === 'coding.dashscope.aliyuncs.com' },
  { mingcheng: '阿里云百炼', pipei: (hostname) => hostname.endsWith('.maas.aliyuncs.com') || hostname === 'dashscope.aliyuncs.com' || hostname.endsWith('.dashscope.aliyuncs.com') },
  { mingcheng: 'OpenAI', pipei: (hostname) => hostname === 'api.openai.com' },
  { mingcheng: 'Microsoft Azure OpenAI', pipei: (hostname) => hostname.endsWith('.openai.azure.com') },
  { mingcheng: 'Google Gemini', pipei: (hostname) => hostname === 'generativelanguage.googleapis.com' },
  { mingcheng: 'Google Vertex AI', pipei: (hostname) => hostname.endsWith('.aiplatform.googleapis.com') },
  { mingcheng: 'Anthropic', pipei: (hostname) => hostname === 'api.anthropic.com' },
  { mingcheng: 'xAI', pipei: (hostname) => hostname === 'api.x.ai' },
  { mingcheng: 'Perplexity', pipei: (hostname) => hostname === 'api.perplexity.ai' },
  { mingcheng: 'DeepSeek', pipei: (hostname) => hostname === 'api.deepseek.com' },
  { mingcheng: '月之暗面（Kimi）', pipei: (hostname) => hostname === 'api.moonshot.cn' || hostname === 'api.moonshot.ai' },
  { mingcheng: '智谱 AI', pipei: (hostname) => hostname === 'open.bigmodel.cn' },
  { mingcheng: 'MiniMax', pipei: (hostname) => hostname === 'api.minimaxi.com' || hostname === 'api.minimax.chat' },
  { mingcheng: '百度智能云千帆', pipei: (hostname) => hostname === 'qianfan.baidubce.com' },
  { mingcheng: '腾讯混元', pipei: (hostname) => hostname === 'api.hunyuan.cloud.tencent.com' },
  { mingcheng: '火山引擎方舟', pipei: (hostname) => hostname.endsWith('.volces.com') },
  { mingcheng: '硅基流动', pipei: (hostname) => hostname === 'api.siliconflow.cn' },
  { mingcheng: '魔搭社区（ModelScope）', pipei: (hostname) => hostname === 'api-inference.modelscope.cn' },
  { mingcheng: 'Infini AI', pipei: (hostname) => hostname === 'api.infini-ai.com' },
  { mingcheng: '阶跃星辰（StepFun）', pipei: (hostname) => hostname === 'api.stepfun.com' },
  { mingcheng: '零一万物', pipei: (hostname) => hostname === 'api.lingyiwanwu.com' },
  { mingcheng: 'OpenRouter', pipei: (hostname) => hostname === 'openrouter.ai' },
  { mingcheng: 'Together AI', pipei: (hostname) => hostname === 'api.together.xyz' },
  { mingcheng: 'Groq', pipei: (hostname) => hostname === 'api.groq.com' },
  { mingcheng: 'Fireworks AI', pipei: (hostname) => hostname === 'api.fireworks.ai' },
  { mingcheng: 'Mistral AI', pipei: (hostname) => hostname === 'api.mistral.ai' },
  { mingcheng: 'NVIDIA NIM', pipei: (hostname) => hostname === 'integrate.api.nvidia.com' },
  { mingcheng: 'Cerebras', pipei: (hostname) => hostname === 'api.cerebras.ai' },
  { mingcheng: 'SambaNova', pipei: (hostname) => hostname === 'api.sambanova.ai' },
  { mingcheng: 'DeepInfra', pipei: (hostname) => hostname === 'api.deepinfra.com' },
  { mingcheng: 'Hugging Face', pipei: (hostname) => hostname === 'router.huggingface.co' || hostname === 'api-inference.huggingface.co' },
  { mingcheng: 'GitHub Models', pipei: (hostname) => hostname === 'models.inference.ai.azure.com' },
]

// 从 baseUrl 推断服务商品牌；本地或未知域名保留通用名称回退。
function tuidaoProviderName(baseUrl) {
  try {
    const url = new URL(baseUrl)
    const hostname = url.hostname.toLowerCase()
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return ''

    const rule = gongyingshangNameRules.find((item) => item.pipei(hostname))
    if (rule) return rule.mingcheng

    const host = hostname.replace(/^(api|www|gateway)\./i, '')
    const main = host.split('.')[0]
    return main ? main.charAt(0).toUpperCase() + main.slice(1) : ''
  } catch {
    return ''
  }
}

// 从明确的 URL 特征推断兼容协议；无法判断时交由用户选择。
function tuidaoCompatibleXieyi(baseUrl) {
  try {
    const url = new URL(baseUrl)
    const hostname = url.hostname.toLowerCase()
    const pathname = url.pathname
    if (hostname === 'api.anthropic.com' || /\/(?:apps\/)?anthropic(?:\/|$)/i.test(pathname) || /\/v\d+\/messages\/?$/i.test(pathname)) {
      return 'anthropic'
    }
    if (hostname === 'api.openai.com' || /\/(?:chat\/completions|responses)\/?$/i.test(pathname)) return 'openai'
    return ''
  } catch {
    return ''
  }
}

module.exports = { tuidaoProviderName, tuidaoCompatibleXieyi }
