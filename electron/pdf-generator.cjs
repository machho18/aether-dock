// PDF 生成器：使用 Electron 的打印能力生成 A4 文件，复用系统中文字体。
function zhuanyiHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function zhuanXingNeirong(text) {
  return zhuanyiHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
}

// 将常用 Markdown 结构转换为受限 HTML，避免模型内容注入可执行页面。
function zhuanMarkdownHtml(content) {
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }
    if (line.startsWith('```')) {
      const code = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(`<pre><code>${zhuanyiHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length + 1
      blocks.push(`<h${level}>${zhuanXingNeirong(heading[2])}</h${level}>`)
      index += 1
      continue
    }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered)
      const pattern = isOrdered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/
      const items = []
      while (index < lines.length) {
        const item = pattern.exec(lines[index])
        if (!item) break
        items.push(`<li>${zhuanXingNeirong(item[1])}</li>`)
        index += 1
      }
      blocks.push(`<${isOrdered ? 'ol' : 'ul'}>${items.join('')}</${isOrdered ? 'ol' : 'ul'}>`)
      continue
    }
    const paragraph = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^```|^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push(`<p>${zhuanXingNeirong(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`)
  }
  return blocks.join('') || '<p>（暂无正文）</p>'
}

function chuangjianPdfHtml(title, content) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${zhuanyiHtml(title)}</title><style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { color: #243028; font: 11pt/1.7 "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; overflow-wrap: anywhere; }
    h1 { margin: 0 0 18pt; color: #1f3626; font-size: 23pt; line-height: 1.3; }
    h2 { margin: 22pt 0 9pt; color: #294b34; font-size: 16pt; line-height: 1.35; }
    h3 { margin: 17pt 0 7pt; color: #3c5d44; font-size: 13pt; line-height: 1.4; }
    p { margin: 0 0 10pt; }
    ul, ol { margin: 0 0 11pt; padding-left: 22pt; }
    li { margin: 3pt 0; }
    pre { margin: 11pt 0; padding: 10pt; border-radius: 5pt; background: #f3f6f2; white-space: pre-wrap; }
    code { font-family: Consolas, "Microsoft YaHei", monospace; font-size: 9.5pt; }
  </style></head><body><h1>${zhuanyiHtml(title)}</h1>${zhuanMarkdownHtml(content)}</body></html>`
}

// 创建隐藏渲染窗口并导出 PDF Buffer；完成后立即销毁窗口，避免常驻资源。
async function shengchengPdfBuffer(BrowserWindow, { title, content }) {
  const printWindow = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(chuangjianPdfHtml(title, content))}`)
    await printWindow.webContents.executeJavaScript('document.fonts?.ready ?? Promise.resolve()', true)
    return await printWindow.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
  }
}

module.exports = { shengchengPdfBuffer }
