// 将模型文本转换为受限 Markdown：先转义原始内容，再仅生成受控标签，避免 v-html 注入风险。
function zhuanyiHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function xuanzaiXingNeirong(text) {
  return zhuanyiHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
}

// 只处理标题、段落、列表、引用与代码块，覆盖模型回复的常用信息结构。
export function xuanzaiMarkdown(rawText) {
  const lines = String(rawText ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const codeLines = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      const languageClass = /^[\w-]+$/.test(language) ? ` class="language-${language}"` : ''
      blocks.push(`<pre><code${languageClass}>${zhuanyiHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    const title = /^(#{1,4})\s+(.+)$/.exec(line)
    if (title) {
      const level = title[1].length
      blocks.push(`<h${level}>${xuanzaiXingNeirong(title[2])}</h${level}>`)
      index += 1
      continue
    }

    const list = /^\s*[-*+]\s+(.+)$/.exec(line)
    const orderedList = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (list || orderedList) {
      const isOrdered = Boolean(orderedList)
      const items = []
      const itemPattern = isOrdered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/
      while (index < lines.length) {
        const item = itemPattern.exec(lines[index])
        if (!item) break
        items.push(`<li>${xuanzaiXingNeirong(item[1])}</li>`)
        index += 1
      }
      const tagName = isOrdered ? 'ol' : 'ul'
      blocks.push(`<${tagName}>${items.join('')}</${tagName}>`)
      continue
    }

    if (line.startsWith('>')) {
      const quoteLines = []
      while (index < lines.length && lines[index].startsWith('>')) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(`<blockquote>${xuanzaiXingNeirong(quoteLines.join('\n')).replace(/\n/g, '<br>')}</blockquote>`)
      continue
    }

    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !/^(#{1,4})\s+|^```|^\s*(?:[-*+]\s+|\d+[.)]\s+)|^>/.test(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(`<p>${xuanzaiXingNeirong(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`)
  }

  return blocks.join('')
}
