// Excel 工作簿生成器：将模型整理出的 Markdown 表格写入标准 XLSX 文件。
const JSZip = require('jszip')

function zhuanyiXml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function qieFenBiaogeXing(line) {
  return String(line ?? '').trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function shiBiaogeFenGeXing(line) {
  const cells = qieFenBiaogeXing(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

// 将 Markdown 表格转换为二维数据；普通段落保留在单列中，避免丢失模型整理的说明。
function jiexiNeirongHang(content) {
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n')
  const rows = []
  let isCodeBlock = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (/^```/.test(line)) {
      isCodeBlock = !isCodeBlock
      continue
    }
    if (!line) continue
    if (!isCodeBlock && line.includes('|') && index + 1 < lines.length && shiBiaogeFenGeXing(lines[index + 1])) {
      rows.push({ cells: qieFenBiaogeXing(line), shiBiaotou: true })
      index += 1
      while (index + 1 < lines.length && lines[index + 1].includes('|') && lines[index + 1].trim()) {
        index += 1
        rows.push({ cells: qieFenBiaogeXing(lines[index]), shiBiaotou: false })
      }
      continue
    }
    rows.push({ cells: [line.replace(/^[-*+]\s+/, '')], shiBiaotou: false })
  }
  return rows.length ? rows.slice(0, 10000) : [{ cells: ['（暂无内容）'], shiBiaotou: false }]
}

function huanLieMing(index) {
  let value = index + 1
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

function jiexiShuzi(value) {
  const text = String(value ?? '').trim()
  if (/^0\d+$/.test(text)) return null
  if (/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?%$/.test(text)) {
    return { value: Number(text.replace(/[,%]/g, '')) / 100, style: 3 }
  }
  if (/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) {
    return { value: Number(text.replace(/,/g, '')), style: 0 }
  }
  return null
}

function chuangjianDanYuanGe(columnIndex, rowIndex, rawValue, style) {
  const reference = `${huanLieMing(columnIndex)}${rowIndex}`
  const numeric = jiexiShuzi(rawValue)
  if (numeric) return `<c r="${reference}" s="${numeric.style}"><v>${numeric.value}</v></c>`
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${zhuanyiXml(rawValue)}</t></is></c>`
}

function chuangjianGongzuobiaoXml(title, content) {
  const rows = jiexiNeirongHang(content)
  const columnCount = Math.min(Math.max(...rows.map((row) => row.cells.length)), 40)
  const sheetRows = [
    `<row r="1" ht="28" customHeight="1">${chuangjianDanYuanGe(0, 1, title, 1)}</row>`,
    '<row r="2" ht="8" customHeight="1"/>',
  ]
  rows.forEach((row, index) => {
    const rowIndex = index + 3
    const cells = row.cells.slice(0, columnCount)
      .map((cell, columnIndex) => chuangjianDanYuanGe(columnIndex, rowIndex, cell, row.shiBiaotou ? 2 : 0))
      .join('')
    sheetRows.push(`<row r="${rowIndex}">${cells}</row>`)
  })
  const lastColumn = huanLieMing(columnCount - 1)
  const columns = Array.from({ length: columnCount }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="22" customWidth="1"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${rows.length + 2}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${sheetRows.join('')}</sheetData><mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells><autoFilter ref="A3:${lastColumn}${rows.length + 2}"/></worksheet>`
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="10" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`

// 生成可由 Excel、WPS 等软件直接打开的 Office Open XML 工作簿。
async function shengchengXlsxBuffer({ title, content }) {
  const zip = new JSZip()
  const now = new Date().toISOString()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`)
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="数据" sheetId="1" r:id="rId1"/></sheets></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  zip.file('xl/worksheets/sheet1.xml', chuangjianGongzuobiaoXml(title, content))
  zip.file('xl/styles.xml', stylesXml)
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${zhuanyiXml(title)}</dc:title><dc:creator>AetherDock</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`)
  zip.file('docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AetherDock</Application></Properties>')
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

module.exports = { shengchengXlsxBuffer }
