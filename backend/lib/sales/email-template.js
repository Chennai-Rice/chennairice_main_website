// Fills the HTML email templates in backend/templates/ ({{Variable}} placeholders).
//
// A block between "<!-- ITEM START" and "<!-- ITEM END -->" is repeated once
// per product. Every value is HTML-escaped. In the Cloud Function the files
// are copied next to the bundle (functions build step), so both places are tried.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cache = new Map()

function templateDirs() {
  const dirs = []
  try {
    dirs.push(fileURLToPath(new URL('../../templates/', import.meta.url)))
  } catch {
    // bundled as CommonJS: no import.meta.url
  }
  if (typeof __dirname !== 'undefined') dirs.push(path.join(__dirname, 'templates'))
  return dirs
}

export function loadTemplate(name) {
  if (!cache.has(name)) {
    const file = templateDirs().map((d) => path.join(d, name)).find((f) => fs.existsSync(f))
    if (!file) throw new Error(`Email template ${name} not found`)
    cache.set(name, fs.readFileSync(file, 'utf8'))
  }
  return cache.get(name)
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fill = (html, vars) => html.replace(/\{\{([A-Za-z ]+)\}\}/g, (m, key) => (key in vars ? esc(vars[key]) : m))

/**
 * The template with its item block repeated for `items`, every
 * "<!-- IF Name -->…<!-- END IF Name -->" block kept only when that variable
 * has a value, and every {{Variable}} filled.
 */
export function renderTemplate(name, vars, items = []) {
  const html = loadTemplate(name)
  const withItems = html.replace(/<!-- ITEM START[\s\S]*?-->([\s\S]*?)<!-- ITEM END -->/, (_m, row) =>
    items.map((item) => fill(row, item)).join(''))
  const shown = withItems.replace(/<!-- IF ([A-Za-z ]+?) -->([\s\S]*?)<!-- END IF \1 -->/g, (_m, key, block) =>
    (vars[key] ?? '') !== '' ? block : '')
  return fill(shown, vars)
}
