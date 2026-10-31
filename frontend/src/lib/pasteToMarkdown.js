// Content copied from Google Docs, Word or a web page arrives on the clipboard as HTML. The post box holds
// Markdown, so this turns that HTML into the Markdown the journal (lib/markdown.jsx) renders: headings, bold,
// italics, links, lists, quotes and paragraph spacing survive the paste.

const SKIP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE', 'IMG'])
const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'TABLE', 'TR', 'PRE', 'FIGURE'])

// Google Docs wraps everything in <b style="font-weight:normal">, so the tag alone does not mean bold.
const isBold = (el) => {
  const w = (el.style?.fontWeight || '').toLowerCase()
  if (w) return w === 'bold' || w === 'bolder' || Number(w) >= 600
  return el.tagName === 'B' || el.tagName === 'STRONG'
}
const isItalic = (el) => {
  const s = (el.style?.fontStyle || '').toLowerCase()
  if (s) return s === 'italic'
  return el.tagName === 'I' || el.tagName === 'EM'
}

/** Wraps text in a Markdown mark, keeping spaces outside it (`** x **` is not bold). */
const wrap = (text, mark) => {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : text
}

function inline(node) {
  if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ')
  if (node.nodeType !== 1 || SKIP.has(node.tagName)) return ''
  if (node.tagName === 'BR') return '\n'
  let out = [...node.childNodes].map(inline).join('')
  if (!out.trim()) return out
  if (node.tagName === 'A' && node.getAttribute('href')) out = `[${out.trim()}](${node.getAttribute('href')})`
  if (isBold(node)) out = wrap(out, '**')
  if (isItalic(node)) out = wrap(out, '*')
  return out
}

/** The inline text of a block, tidied: one line, no doubled spaces, no `****` left by nested bold. */
const line = (el) =>
  inline(el).replace(/\*\*\*\*/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, ' ').trim()

function blocks(parent, out) {
  for (const node of parent.childNodes) {
    if (node.nodeType === 3) {
      const t = node.nodeValue.replace(/\s+/g, ' ').trim()
      if (t) out.push(t)
      continue
    }
    if (node.nodeType !== 1 || SKIP.has(node.tagName)) continue
    const tag = node.tagName
    if (/^H[1-6]$/.test(tag)) {
      // Headings in the journal start at "##": the post's own title is the page heading.
      const level = Number(tag[1])
      const text = line(node).replace(/^\*\*(.*)\*\*$/, '$1')
      if (text) out.push(`${'#'.repeat(level <= 2 ? 2 : Math.min(level, 4))} ${text}`)
    } else if (tag === 'UL' || tag === 'OL') {
      const items = [...node.querySelectorAll(':scope > li')]
      const lines = items.map((li, i) => {
        const own = document.createElement('div')
        for (const c of li.childNodes) if (!/^(UL|OL)$/.test(c.tagName || '')) own.appendChild(c.cloneNode(true))
        const text = line(own)
        return text ? `${tag === 'OL' ? `${i + 1}.` : '-'} ${text}` : ''
      }).filter(Boolean)
      if (lines.length) out.push(lines.join('\n'))
    } else if (tag === 'BLOCKQUOTE') {
      const inner = []
      blocks(node, inner)
      if (inner.length) out.push(inner.join('\n\n').split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'))
    } else if (tag === 'P' || tag === 'DIV' && !hasBlockChild(node)) {
      const text = line(node)
      if (text) out.push(text)
    } else if (BLOCK.has(tag) || hasBlockChild(node)) {
      blocks(node, out)
    } else {
      const text = line(node)
      if (text) out.push(text)
    }
  }
}

const hasBlockChild = (el) =>
  [...el.children].some((c) => BLOCK.has(c.tagName) || /^(H[1-6]|UL|OL|BLOCKQUOTE)$/.test(c.tagName))

/** Markdown for pasted HTML; '' when there is nothing worth converting. */
export function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out = []
  blocks(doc.body, out)
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** True when the HTML carries formatting worth converting (not just text in a wrapper). */
export const hasFormatting = (html) =>
  /<(h[1-6]|strong|b|em|i|ul|ol|li|a|blockquote)[\s>]|font-weight\s*:\s*(bold|[6-9]00)|font-style\s*:\s*italic/i.test(html)
