// 将模型文本转换为受限 Markdown：先转义原始内容，再仅生成受控标签，避免 v-html 注入风险。
function zhuanyiHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 仅允许可安全打开的链接协议，避免模型输出将危险协议写入 v-html。
function huoquAnquanLianjie(rawUrl) {
  try {
    const url = new URL(String(rawUrl ?? '').replace(/&amp;/g, '&'))
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function xuanzaiXingNeirong(text) {
  const daimaKuai = []
  let html = zhuanyiHtml(text)
    // 代码片段先替换为占位符，避免其中的星号被继续解析为强调语法。
    .replace(/`([^`\n]+)`/g, (_, code) => {
      daimaKuai.push(`<code>${code}</code>`)
      return `\u0000${daimaKuai.length - 1}\u0000`
    })
    .replace(/\[([^\]\n]+)\]\(([^\s)]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (matched, label, rawUrl) => {
      const url = huoquAnquanLianjie(rawUrl)
      return url ? `<a href="${zhuanyiHtml(url)}" target="_blank" rel="noreferrer noopener">${label}</a>` : matched
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => daimaKuai[Number(index)] ?? '')
}

function qiegeBiaogeCell(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function shiBiaogeFengeLine(line, columnCount) {
  const cells = qiegeBiaogeCell(line)
  return cells.length === columnCount && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function shengchengBiaogeHang(tagName, cells, columnCount) {
  const contents = Array.from({ length: columnCount }, (_, index) => xuanzaiXingNeirong(cells[index] ?? ''))
  return `<tr>${contents.map((content) => `<${tagName}>${content}</${tagName}>`).join('')}</tr>`
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

    if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)) {
      blocks.push('<hr>')
      index += 1
      continue
    }

    const title = /^(#{1,4})\s+(.+)$/.exec(line)
    if (title) {
      const level = title[1].length
      blocks.push(`<h${level}>${xuanzaiXingNeirong(title[2])}</h${level}>`)
      index += 1
      continue
    }

    const biaogeBiaoti = qiegeBiaogeCell(line)
    if (biaogeBiaoti.length > 1 && index + 1 < lines.length && shiBiaogeFengeLine(lines[index + 1], biaogeBiaoti.length)) {
      const body = []
      index += 2
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        const cells = qiegeBiaogeCell(lines[index])
        if (cells.length !== biaogeBiaoti.length) break
        body.push(shengchengBiaogeHang('td', cells, biaogeBiaoti.length))
        index += 1
      }
      blocks.push(`<table><thead>${shengchengBiaogeHang('th', biaogeBiaoti, biaogeBiaoti.length)}</thead><tbody>${body.join('')}</tbody></table>`)
      continue
    }

    const list = /^\s*[-*+]\s+(.+)$/.exec(line)
    const orderedList = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (list || orderedList) {
      const isOrdered = Boolean(orderedList)
      const items = []
      let hasRenwuXiang = false
      const itemPattern = isOrdered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/
      while (index < lines.length) {
        const item = itemPattern.exec(lines[index])
        if (!item) break
        const task = !isOrdered && /^\[([ xX])\]\s+(.+)$/.exec(item[1])
        if (task) {
          hasRenwuXiang = true
          items.push(`<li class="task-list-item"><input type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}>${xuanzaiXingNeirong(task[2])}</li>`)
        } else {
          items.push(`<li>${xuanzaiXingNeirong(item[1])}</li>`)
        }
        index += 1
      }
      const tagName = isOrdered ? 'ol' : 'ul'
      const className = hasRenwuXiang ? ' class="task-list"' : ''
      blocks.push(`<${tagName}${className}>${items.join('')}</${tagName}>`)
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
