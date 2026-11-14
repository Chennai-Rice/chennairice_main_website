import { useCallback, useState } from 'react'
import SourcesReport, { CHANNEL_PAGES } from '../warehouse/SourcesReport.jsx'
import { MetaAdsPanelFriendly, GoogleAdsPanelFriendly } from '../warehouse/AnalystView.jsx'
import StaffGate from './StaffGate.jsx'

/**
 * /admin → Ad campaigns. Everyone: the "Where orders come from" report. The Performance team (perChannel):
 * "All channels" (every channel side by side) and one page per channel —
 * Meta ads, Google, WhatsApp, Instagram / Facebook (not ads), Direct, Other. A channel page shows only
 * that channel: totals, platforms, every campaign → ad set → ad, buyers and leads; Meta ads and Google
 * add the live figures from Meta Ads Manager / Google Ads for the same dates. Sales figures need a staff
 * account with money access, asked for once by StaffGate if needed.
 */
const PAGES = [{ key: '', label: 'All channels' }, ...CHANNEL_PAGES]
const LIVE = {
  meta: (range) => <MetaAdsPanelFriendly period={range} />,
  google: (range) => <GoogleAdsPanelFriendly period={range} />,
}
const KEY = 'cr.campaigns.page'
const remembered = () => { try { return sessionStorage.getItem(KEY) || '' } catch { return '' } }

export default function CampaignsPanel({ perChannel = false }) {
  const [error, setError] = useState('')
  const [page, setPage] = useState(() => (PAGES.some((p) => p.key === remembered()) ? remembered() : ''))
  const say = useCallback((message, tone) => { if (tone === 'error') setError(message) }, [])
  const go = (key) => { setPage(key); setError(''); try { sessionStorage.setItem(KEY, key) } catch { /* private window */ } }

  return (
    <StaffGate
      perm="money.view"
      title="Sign in to see sales"
      why="Ad results include order values, so they need your staff Google account (owner, admin or IT team)."
      deniedText="This staff account cannot see sales figures. Sign in as the owner, an admin or the IT team."
    >
      {({ onAuthError }) => (
        <div className="wh-embed">
          {perChannel && <nav className="src-pages" aria-label="Ad campaigns pages">
            {PAGES.map((p) => (
              <button key={p.key || 'all'} type="button" className={`src-page${page === p.key ? ' is-active' : ''}`}
                aria-current={page === p.key ? 'page' : undefined} onClick={() => go(p.key)}>
                {p.label}
              </button>
            ))}
          </nav>}
          {error && <p className="ad-alert" role="alert">{error}</p>}
          {perChannel
            ? <SourcesReport key={page || 'all'} say={say} onAuthError={onAuthError} only={page} live={LIVE[page] || null} />
            : <SourcesReport say={say} onAuthError={onAuthError} />}
        </div>
      )}
    </StaffGate>
  )
}
