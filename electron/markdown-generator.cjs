// Markdown 生成器：生成独立的 UTF-8 文本文件，不修改用户原始资料。
function shengchengMarkdownBuffer({ title, content }) {
  const safeTitle = String(title ?? '').trim() || 'Markdown 文档'
  const body = String(content ?? '').replace(/\r\n?/g, '\n').trim() || '（暂无正文）'
  return Buffer.from(`# ${safeTitle}\n\n${body}\n`, 'utf8')
}

module.exports = { shengchengMarkdownBuffer }
