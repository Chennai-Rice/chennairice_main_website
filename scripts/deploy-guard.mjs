// Deploy guard (runs before every `firebase deploy` of hosting; firebase.json → hosting.predeploy).
//
// 27 Nov 2026: a deploy from a copy that lacked the day's commits replaced the live site and silently undid the
// Google Ads Purchase tracking (and every other change of that day) until the next deploy. So:
//   1. The live site says which commit it was built from (/version.json, written below on every deploy).
//   2. Before uploading, this checks that the commit being deployed CONTAINS the live one. If not, the deploy
//      stops: pull (git pull / merge from GitHub), test, then deploy again.
//   3. It writes dist/version.json for the next deploy to check against.
// Emergency only: set DEPLOY_GUARD_SKIP=1 to deploy anyway (for example to roll back on purpose).
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'

const SITE = process.env.DEPLOY_GUARD_SITE || 'https://chennairiceindustries.com' // override only for testing the guard
// git is run directly, not through a shell: Windows' cmd would eat the ^ in "<commit>^{commit}".
const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
const ok = (...args) => { try { execFileSync('git', args, { stdio: 'ignore' }); return true } catch { return false } }
const stop = (msg) => { console.error(`\n✖ DEPLOY STOPPED (deploy guard)\n${msg}\n`); process.exit(1) }

if (!existsSync('dist')) stop('No dist/ folder: the build did not run.')
const head = git('rev-parse', 'HEAD')
const dirty = git('status', '--porcelain', '--untracked-files=no') !== ''

if (process.env.DEPLOY_GUARD_SKIP === '1') {
  console.warn('⚠ Deploy guard skipped (DEPLOY_GUARD_SKIP=1).')
} else {
  let live = null
  try {
    const res = await fetch(`${SITE}/version.json?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15000) })
    if (res.ok) live = (await res.json())?.commit || null
  } catch { /* offline or not yet published */ }

  if (!live || !/^[0-9a-f]{40}$/.test(live)) {
    console.warn('⚠ Deploy guard: the live site has no version.json yet (first guarded deploy); not checked this time.')
  } else {
    if (!ok('cat-file', '-e', `${live}^{commit}`)) {
      // Not in this copy at all: fetch every remote, then look again.
      try { execFileSync('git', ['fetch', '--all', '--quiet'], { stdio: 'ignore' }) } catch { /* checked below */ }
    }
    if (!ok('cat-file', '-e', `${live}^{commit}`)) {
      stop(`The live site was built from commit ${live.slice(0, 7)}, which this copy has never seen.\n` +
        'Someone deployed changes that are not here. Pull them first (git pull, or fetch + merge from GitHub), test, then deploy.')
    }
    if (!ok('merge-base', '--is-ancestor', live, 'HEAD')) {
      const missing = git('log', '--oneline', `HEAD..${live}`).split('\n').slice(0, 8).join('\n  ')
      stop(`The live site has commits that this copy does not, and deploying would remove them:\n  ${missing}\n` +
        'Merge them first (git pull / merge from GitHub), test, then deploy.')
    }
    console.log(`✔ Deploy guard: ${head.slice(0, 7)} contains the live ${live.slice(0, 7)}.`)
  }
}

// Not on GitHub yet? Then a teammate deploying from GitHub would be stopped by this guard until it is pushed.
const pushed = git('branch', '-r', '--contains', head) !== ''
if (!pushed) console.warn('⚠ This commit is not on GitHub yet: push it after deploying, so others can deploy from it.')
if (dirty) console.warn('⚠ Uncommitted changes are being deployed; version.json records the last commit only.')

writeFileSync('dist/version.json', JSON.stringify({ commit: head, dirty, deployedAt: new Date().toISOString() }) + '\n')
console.log('✔ dist/version.json written.')
