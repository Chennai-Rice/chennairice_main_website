// A small Markdown renderer for blog posts.
//
// Renders to React elements, never to an HTML string. That is the whole
// security design: there is no dangerouslySetInnerHTML anywhere in this
// file, so a post can never inject markup or script into the page no matter
// what is typed into the editor. Anything the parser does not recognise
// stays plain text.
//
// It supports what someone writing about rice actually needs — headings,
// emphasis, links, lists, quotes, images, code and rules — and deliberately
// not tables, footnotes or raw HTML. A wider subset would mean a
// dependency, and none of it would earn its place here.
import React from 'react'

/* -------------------------------------------------------------- helpers */

/**
 * Only URLs that can be followed safely.
 *
 * Relative paths, anchors, http(s) and mailto pass. Everything else —
 * javascript:, data:, vbscript: — returns null and the caller renders the
 * link as plain text instead. A link is not worth an injection.
 */
function safeUrl(raw) {
  const url = String(raw || '').trim()
  if (!url) return null
  if (/^(\/|#|\.\/|\.\.\/)/.test(url)) return url
  if (/^(https?:|mailto:)/i.test(url)) return url
  return null
}

/** Headings start at h2: the page already has an h1 for the post title. */
function headingTag(hashes) {
  return `h${Math.min(6, hashes.length + 1)}`
}

/* --------------------------------------------------------------- inline */

/* The URL half of a link allows one level of nested parentheses, so
   .../Ponni_(rice) is captured whole rather than being cut at the
   first closing bracket. */
const INLINE_RULES = [
  {
    // Image before link, because ![alt](src) also matches the link pattern
    // from its second character.
    re: /^!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/,
    render: (m, key) => {
      const src = safeUrl(m[2])
      if (!src) return m[0]
      return <img key={key} className="md-img" src={src} alt={m[1]} loading="lazy" />
    },
  },
  {
    re: /^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/,
    render: (m, key) => {
      const href = safeUrl(m[2])
      if (!href) return m[1]
      const external = /^https?:/i.test(href)
      return (
        <a
          key={key}
          href={href}
          // Off-site links open in a new tab; noreferrer as well as
          // noopener, so the destination is not told where the reader came
          // from.
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {m[1]}
        </a>
      )
    },
  },
  {
    re: /^(\*\*|__)([\s\S]+?)\1/,
    render: (m, key) => <strong key={key}>{inline(m[2])}</strong>,
  },
  {
    re: /^(\*|_)([^*_][\s\S]*?)\1/,
    render: (m, key) => <em key={key}>{inline(m[2])}</em>,
  },
  {
    re: /^`([^`]+)`/,
    render: (m, key) => <code key={key}>{m[1]}</code>,
  },
]

/**
 * Walks a run of text, taking the earliest rule that matches at the cursor
 * and otherwise consuming one character into a plain-text buffer. Linear in
 * the length of the text, which is ample for an article.
 */
function inline(text) {
  const nodes = []
  let buffer = ''
  let index = 0
  let key = 0

  while (index < text.length) {
    const rest = text.slice(index)
    let hit = null

    for (const rule of INLINE_RULES) {
      const match = rule.re.exec(rest)
      if (match) {
        hit = { rule, match }
        break
      }
    }

    if (hit) {
      if (buffer) {
        nodes.push(buffer)
        buffer = ''
      }
      nodes.push(hit.rule.render(hit.match, `i${key}`))
      key += 1
      index += hit.match[0].length
    } else {
      buffer += text[index]
      index += 1
    }
  }

  if (buffer) nodes.push(buffer)
  return nodes
}

/* --------------------------------------------------------------- blocks */

const BULLET = /^\s{0,3}[-*+]\s+(.*)$/
const NUMBERED = /^\s{0,3}\d+[.)]\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const RULE = /^\s{0,3}([-*_])\s*(\1\s*){2,}$/
const FENCE = /^\s{0,3}```/

/**
 * Turns Markdown into React elements.
 *
 * @param {string} source
 * @returns {React.ReactNode[]}
 */
export function renderMarkdown(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let key = 0
  let i = 0

  const push = (node) => {
    blocks.push(node)
    key += 1
  }

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    // Fenced code — taken verbatim, with no inline parsing inside it, so a
    // snippet containing asterisks survives intact.
    if (FENCE.test(line)) {
      const body = []
      i += 1
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      i += 1 // closing fence, or end of input
      push(
        <pre key={`b${key}`} className="md-pre">
          <code>{body.join('\n')}</code>
        </pre>
      )
      continue
    }

    if (RULE.test(line)) {
      push(<hr key={`b${key}`} className="md-hr" />)
      i += 1
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const Tag = headingTag(heading[1])
      push(
        <Tag key={`b${key}`} className="md-heading">
          {inline(heading[2])}
        </Tag>
      )
      i += 1
      continue
    }

    if (QUOTE.test(line)) {
      const body = []
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(QUOTE.exec(lines[i])[1])
        i += 1
      }
      push(
        <blockquote key={`b${key}`} className="md-quote">
          {inline(body.join(' '))}
        </blockquote>
      )
      continue
    }

    const listMatch = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : null
    if (listMatch) {
      const items = []
      while (i < lines.length && listMatch.test(lines[i])) {
        items.push(listMatch.exec(lines[i])[1])
        i += 1
      }
      const Tag = listMatch === BULLET ? 'ul' : 'ol'
      push(
        <Tag key={`b${key}`} className="md-list">
          {items.map((item, index) => (
            <li key={index}>{inline(item)}</li>
          ))}
        </Tag>
      )
      continue
    }

    // A lone image gets its own figure rather than being wrapped in a
    // paragraph, so it can be sized and centred as a block.
    const lone = /^!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)\s*$/.exec(line)
    if (lone && safeUrl(lone[2])) {
      push(
        <figure key={`b${key}`} className="md-figure">
          <img src={safeUrl(lone[2])} alt={lone[1]} loading="lazy" />
          {lone[1] && <figcaption>{lone[1]}</figcaption>}
        </figure>
      )
      i += 1
      continue
    }

    // Paragraph: consecutive non-blank lines that start no other block.
    const paragraph = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE.test(lines[i]) &&
      !RULE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i])
    ) {
      paragraph.push(lines[i].trim())
      i += 1
    }
    push(
      <p key={`b${key}`} className="md-p">
        {inline(paragraph.join(' '))}
      </p>
    )
  }

  return blocks
}

/* --------------------------------------------------------------- extras */

/**
 * The prose with its markup stripped. Used for the excerpt fallback and the
 * meta description, where syntax characters would show up as noise.
 */
export function plainText(source) {
  return String(source || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Rounded up, and never zero: "0 min read" reads as an error. */
export function readingMinutes(source) {
  const words = plainText(source).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

/** A title turned into something a URL can carry. */
export function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}
