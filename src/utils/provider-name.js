// 浏览器端根据兼容接口地址推导服务商与协议，不依赖 Electron 的 CommonJS 模块。
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

export function tuidaoProviderName(baseUrl) {
  try {
    const url = new URL(baseUrl)
    const hostname = url.hostname.toLowerCase()
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return ''

    const rule = gongyingshangNameRules.find((item) => item.pipei(hostname))
    if (rule) return rule.mingcheng

    const main = hostname.replace(/^(api|www|gateway)\./i, '').split('.')[0]
    return main ? main.charAt(0).toUpperCase() + main.slice(1) : ''
  } catch {
    return ''
  }
}

export function tuidaoCompatibleXieyi(baseUrl) {
  try {
    const url = new URL(baseUrl)
    const hostname = url.hostname.toLowerCase()
    const pathname = url.pathname
    if (hostname === 'api.anthropic.com' || /\/(?:apps\/)?anthropic(?:\/|$)/i.test(pathname) || /\/v\d+\/messages\/?$/i.test(pathname)) return 'anthropic'
    if (hostname === 'api.openai.com' || /\/(?:chat\/completions|responses)\/?$/i.test(pathname)) return 'openai'
    return ''
  } catch {
    return ''
  }
}
