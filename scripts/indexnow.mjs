// Tells Bing (and the other IndexNow search engines — ChatGPT search reads
// Bing) which pages to re-read: every URL in the built sitemap, or the URLs
// given on the command line. Run after a deploy:
//   node scripts/indexnow.mjs                    all sitemap URLs
//   node scripts/indexnow.mjs /what-is-aged-rice  just these paths
// The key file frontend/public/95bde3dc9c6867f98d8db0947274fb99.txt proves the site is ours.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOST = 'chennairiceindustries.com'
const KEY = '95bde3dc9c6867f98d8db0947274fb99'

const args = process.argv.slice(2)
const urls = args.length
  ? args.map((p) => 'https://' + HOST + (p.startsWith('/') ? p : '/' + p))
  : [...readFileSync(join(ROOT, 'dist', 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
})
console.log(`IndexNow: ${urls.length} URLs → HTTP ${res.status}`, res.status === 200 || res.status === 202 ? '(accepted)' : await res.text())
