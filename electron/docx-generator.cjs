// Word 修订副本生成器：只创建新的 DOCX，不修改用户的原始文档。
const JSZip = require('jszip')

function zhuanyiXml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function chuangjianWenbenRun(text, options = {}) {
  const attrs = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : ''
  const style = [
    options.bold ? '<w:b/>' : '',
    options.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/><w:sz w:val="20"/>' : '',
  ].join('')
  return `<w:r>${style ? `<w:rPr>${style}</w:rPr>` : ''}<w:t${attrs}>${zhuanyiXml(text)}</w:t></w:r>`
}

function chuangjianDuanluo(content, options = {}) {
  const pPr = [
    options.style ? `<w:pStyle w:val="${options.style}"/>` : '',
    options.indent ? '<w:ind w:left="720" w:hanging="360"/>' : '',
    options.code ? '<w:shd w:fill="F3F4F6"/><w:spacing w:before="80" w:after="80"/>' : '',
  ].join('')
  const run = options.prefix
    ? `${chuangjianWenbenRun(options.prefix, { bold: options.prefixBold })}${chuangjianWenbenRun(content, options)}`
    : chuangjianWenbenRun(content, options)
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${run}</w:p>`
}

// 将模型输出的常用 Markdown 结构映射为 Word 段落，保证生成文档清晰可读。
function zhuanhuanMarkdownDuanluo(content) {
  const paragraphs = []
  let isCodeBlock = false
  for (const originalLine of String(content ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = originalLine.trimEnd()
    if (/^```/.test(line.trim())) {
      isCodeBlock = !isCodeBlock
      continue
    }
    if (!line.trim()) {
      paragraphs.push('<w:p/>')
      continue
    }
    if (isCodeBlock) {
      paragraphs.push(chuangjianDuanluo(line, { code: true }))
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      paragraphs.push(chuangjianDuanluo(heading[2], { style: `Heading${heading[1].length}` }))
      continue
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line)
    if (bullet) {
      paragraphs.push(chuangjianDuanluo(bullet[1], { indent: true, prefix: '• ' }))
      continue
    }
    const ordered = /^\s*(\d+)\.\s+(.+)$/.exec(line)
    if (ordered) {
      paragraphs.push(chuangjianDuanluo(ordered[2], { indent: true, prefix: `${ordered[1]}. ` }))
      continue
    }
    paragraphs.push(chuangjianDuanluo(line))
  }
  return paragraphs.join('') || chuangjianDuanluo('（暂无正文）')
}

function chuangjianDocumentXml(title, content) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${chuangjianDuanluo(title, { style: 'Title' })}
    ${zhuanhuanMarkdownDuanluo(content)}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="300"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1F2937"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="140"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="1F4E79"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="220" w:after="100"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="2F5597"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="180" w:after="80"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="3F6B8A"/></w:rPr></w:style>
</w:styles>`

// 生成独立可打开的 Word 文件，避免依赖用户原文版式或覆写原文件。
async function shengchengDocxBuffer({ title, content }) {
  const zip = new JSZip()
  const now = new Date().toISOString()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)
  zip.file('word/document.xml', chuangjianDocumentXml(title, content))
  zip.file('word/styles.xml', stylesXml)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${zhuanyiXml(title)}</dc:title><dc:creator>AetherDock</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`)
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AetherDock</Application></Properties>`)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

module.exports = { shengchengDocxBuffer }
