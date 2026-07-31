import docIcon from '@/assets/icons/doc.svg'
import pdfIcon from '@/assets/icons/pdf.svg'
import xlsIcon from '@/assets/icons/xls.svg'
import fileIcon from '@/assets/icons/wendang.svg'
import imageIcon from '@/assets/icons/tupian.svg'
import urlIcon from '@/assets/icons/wangzhi-link.svg'
import yingyongIcon from '@/assets/icons/yingyongchengxu.svg'

const fileIconRules = [
  { extensions: ['.pdf'], type: 'PDF', icon: pdfIcon },
  { extensions: ['.xls', '.xlsx'], type: 'XLS', icon: xlsIcon },
  { extensions: ['.doc', '.docx'], type: 'DOC', icon: docIcon },
]

// 根据资料类型生成卡片预览信息，图片加载失败时自动回退到通用图标。
export function huoquCardInfo(item, previewFailed) {
  if (item.type === 'image') {
    const canPreview = item.status !== 'missing' && !previewFailed.has(item.id)
    return { type: 'IMG', icon: canPreview ? '' : imageIcon, preview: canPreview ? `aetherdock-img://${item.id}` : '' }
  }
  if (item.type === 'url') return { type: 'URL', icon: urlIcon, preview: '' }
  if (item.type === 'application') return { type: 'APP', icon: item.yingyongIcon || yingyongIcon, preview: '' }

  const lowerTitle = (item.title || item.sourcePath || '').toLowerCase()
  const matchRule = fileIconRules.find((rule) => rule.extensions.some((extension) => lowerTitle.endsWith(extension)))
  return matchRule
    ? { type: matchRule.type, icon: matchRule.icon, preview: '' }
    : { type: 'FILE', icon: fileIcon, preview: '' }
}

export function huoquCardName(item) {
  const title = item.title || '未命名资料'
  return item.type === 'url' ? title : title.replace(/\.[^./\\]+$/, '')
}

export function geshiCardTime(timestamp) {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

export function huoquApplicationStatus(item) {
  const statusBiaoqian = {
    shortcut_missing: '快捷方式已消失',
    target_missing: '程序可能已卸载',
    offline: '设备或网络暂不可用',
    unreadable: '快捷方式无法读取',
  }
  return statusBiaoqian[item.status] || '桌面快捷方式'
}
