import docIcon from '@/assets/icons/doc.svg'
import pdfIcon from '@/assets/icons/pdf.svg'
import txtIcon from '@/assets/icons/txt.svg'
import xlsIcon from '@/assets/icons/xls.svg'
import fileIcon from '@/assets/icons/wendang.svg'
import imageIcon from '@/assets/icons/tupian.svg'
import urlIcon from '@/assets/icons/wangzhi-link.svg'

const fileIconRules = [
  { extensions: ['.pdf'], type: 'PDF', icon: pdfIcon },
  { extensions: ['.xls', '.xlsx'], type: 'XLS', icon: xlsIcon },
  { extensions: ['.doc', '.docx'], type: 'DOC', icon: docIcon },
  { extensions: ['.txt'], type: 'TXT', icon: txtIcon },
]
const cardTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

// 根据资料类型生成卡片预览信息，图片加载失败时自动回退到通用图标。
export function huoquCardInfo(item, previewFailed) {
  if (item.type === 'image') {
    const thumbnailKey = item.thumbnailKey || (item.thumbnailStatus === 'ready' ? item.thumbnailCacheKey : '')
    const hasPreviewFailed = previewFailed.has(item.id)
    const canPreview = item.status !== 'missing' && thumbnailKey && previewFailed.get(item.id) !== thumbnailKey
    // 缩略图仍在后台读取时显示骨架，避免通用图标被误解为图片内容。
    const iconPending = item.status !== 'missing' && !thumbnailKey && !hasPreviewFailed && item.thumbnailStatus !== 'failed'
    return {
      type: 'IMG',
      icon: canPreview || iconPending ? '' : imageIcon,
      iconPending,
      preview: canPreview ? `aetherdock-thumb://${thumbnailKey}/320` : '',
      previewSrcset: canPreview
        ? `aetherdock-thumb://${thumbnailKey}/320 1x, aetherdock-thumb://${thumbnailKey}/640 2x`
        : '',
    }
  }
  if (item.type === 'url') {
    const cachedIcon = item.iconStatus === 'ready' && item.iconCacheKey
      ? `aetherdock-icon://${item.iconCacheKey}`
      : ''
    return { type: 'URL', icon: item.wangzhiIcon || cachedIcon || urlIcon, preview: '' }
  }
  if (item.type === 'application') {
    const cachedIcon = item.iconStatus === 'ready' && item.iconCacheKey
      ? `aetherdock-icon://${item.iconCacheKey}`
      : ''
    const icon = item.yingyongIcon || cachedIcon
    return { type: 'APP', icon, iconPending: !icon, preview: '' }
  }

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
  return cardTimeFormatter.format(new Date(timestamp))
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
