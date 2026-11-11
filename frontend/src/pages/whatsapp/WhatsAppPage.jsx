import { useEffect, useState } from 'react'
import StaffGate from '../admin/StaffGate.jsx'
import { staffJson, signOutStaff } from '../../services/staffAuth.js'
import usePageMeta from '../../shop/hooks/usePageMeta.js'
import { I } from './ui.jsx'
import Overview from './Overview.jsx'
import Templates from './Templates.jsx'
import Settings from './Settings.jsx'
import Bot from './Bot.jsx'
import Inbox from './Inbox.jsx'
import Contacts from './Contacts.jsx'
import Automations from './Automations.jsx'
import Broadcasts from './Broadcasts.jsx'
import Reports from './Reports.jsx'
import '../warehouse/warehouse.css'
import './whatsapp.css'
import './whatsapp-platform.css'

/**
 * /whatsappbot: Chennai Rice's own WhatsApp platform on Meta's WhatsApp Cloud API (Nov 2026), in place of
 * AskEva. Phase 1: Overview, Templates (write, check, submit to Meta, test) and Settings. The other
 * sections arrive phase by phase and are shown as "coming".
 */
const TABS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'inbox', label: 'Inbox', icon: 'chat' },
  { id: 'contacts', label: 'Contacts', icon: 'users' },
  { id: 'templates', label: 'Templates', icon: 'template' },
  { id: 'broadcasts', label: 'Broadcasts', icon: 'megaphone' },
  { id: 'automations', label: 'Automations', icon: 'bolt' },
  { id: 'bot', label: 'Bot', icon: 'bot' },
  { id: 'reports', label: 'Reports', icon: 'chart' },
]
const COMING = {
  inbox: 'Live team chat: every customer message to 70666 46667, assign to a person, labels, notes, quick replies, the 24-hour reply timer and the customer\'s orders beside the chat.',
  contacts: 'Every WhatsApp customer and website buyer, with tags, opt-in / STOP, CSV import and segments such as "bought 5 kg 20+ days ago".',
  broadcasts: 'Send an approved template to a segment now or on a schedule, and see delivered, read, clicked, orders and revenue for it.',
  automations: 'Spin & Win codes and reminders, Refer a friend, order updates, restock, win-back, cart and review messages, each with its own switch and timing.',
  bot: 'A welcome menu with buttons, order tracking by order number, answers to common questions, an away message and hand-off to a person.',
  reports: 'Each template and campaign: sent, delivered, read, clicked, orders, revenue and cost. Agent reply times. CSV.',
}

function Coming({ tab }) {
  return (
    <section className="wa-card wa-coming">
      <span className="wa-coming-badge">Phase {tab.phase}</span>
      <h2>{tab.label}</h2>
      <p>{COMING[tab.id]}</p>
    </section>
  )
}

function Shell() {
  const [tab, setTab] = useState(() => {
    const h = window.location.hash.replace('#', '')
    return [...TABS.map((t) => t.id), 'settings'].includes(h) ? h : 'overview'
  })
  const [me, setMe] = useState(null)
  useEffect(() => { staffJson('/api/admin/me').then(setMe).catch(() => {}) }, [])
  useEffect(() => { window.history.replaceState(null, '', '#' + tab) }, [tab])
  const current = TABS.find((t) => t.id === tab)
  const initials = String(me?.fullName || me?.email || '?').split('@')[0].split(/[^A-Za-z]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'CR'

  return (
    <div className="wa-app">
      <header className="wa-top">
        <a className="wa-brand" href="/whatsappbot">
          <img src="/assets/warehouse-logo.png" alt="" width="34" height="34" />
          <span>Chennai Rice <b>WhatsApp</b></span>
        </a>
        <nav className="wa-nav" aria-label="WhatsApp sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={'wa-nav-btn' + (tab === t.id ? ' is-on' : '') + (t.phase ? ' is-later' : '')}
              onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              {tab === t.id && <span className="wa-dot" />}{t.label}
            </button>
          ))}
        </nav>
        <div className="wa-top-right">
          <button type="button" className={'wa-round' + (tab === 'settings' ? ' is-on' : '')} title="Settings" onClick={() => setTab('settings')}><I name="settings" /></button>
          <button type="button" className="wa-round" title="Sign out" onClick={() => signOutStaff().then(() => window.location.reload())}><I name="logout" /></button>
          <span className="wa-avatar" title={me?.email || ''}>{initials}</span>
        </div>
      </header>
      <main className="wa-main">
        {tab === 'overview' && <Overview go={setTab} />}
        {tab === 'templates' && <Templates />}
        {tab === 'settings' && <Settings />}
        {tab === 'bot' && <Bot />}
        {tab === 'inbox' && <Inbox />}
        {tab === 'contacts' && <Contacts />}
        {tab === 'automations' && <Automations />}
        {tab === 'broadcasts' && <Broadcasts />}
        {tab === 'reports' && <Reports />}
        {current?.phase && <Coming tab={current} />}
      </main>
    </div>
  )
}

export default function WhatsAppPage() {
  usePageMeta('WhatsApp | Chennai Rice', 'Chennai Rice WhatsApp dashboard', { noindex: true })
  return (
    <div className="wa-root">
      <StaffGate perm="whatsapp.manage" title="WhatsApp" why="Sign in with your Chennai Rice staff account to open the WhatsApp dashboard."
        deniedText="Your account does not have access to the WhatsApp dashboard. Ask the IT team.">
        {() => <Shell />}
      </StaffGate>
    </div>
  )
}
