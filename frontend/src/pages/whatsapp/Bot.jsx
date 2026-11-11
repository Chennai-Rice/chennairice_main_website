import { useEffect, useRef, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { I, WaText } from './ui.jsx'

const ACTIONS = {
  reply: 'Reply with a message',
  track_order: 'Track an order (asks for the order number)',
  offers: "Show this number's offers (spin / referral codes)",
  prices: "Show today's prices (live)",
  delivery: 'Check delivery (asks for a PIN code)',
  handoff: 'Hand over to our team (bot goes quiet)',
}
const newItem = (n) => ({ id: `item${Date.now().toString(36)}${n}`, label: '', description: '', keywords: [], action: 'reply', reply: '' })

/** One bot message as WhatsApp shows it; tapping a button or list row answers it. */
function BotBubble({ m, onTap }) {
  const [open, setOpen] = useState(false)
  if (m.type === 'text') return <div className="wa-bubble"><p className="wa-bubble-body"><WaText text={m.text.body} /></p></div>
  const i = m.interactive
  return (
    <>
      <div className="wa-bubble"><p className="wa-bubble-body"><WaText text={i.body.text} /></p></div>
      {i.type === 'button' && i.action.buttons.map((b) => (
        <button key={b.reply.id} type="button" className="wa-bubble-btn" onClick={() => onTap(b.reply.id, b.reply.title)}>{b.reply.title}</button>
      ))}
      {i.type === 'list' && (
        <>
          <button type="button" className="wa-bubble-btn" onClick={() => setOpen((x) => !x)}><I name="grid" size={14} /> {i.action.button}</button>
          {open && (
            <div className="wa-sheet">
              {i.action.sections[0].rows.map((r) => (
                <button key={r.id} type="button" onClick={() => { setOpen(false); onTap(r.id, r.title) }}>
                  <b>{r.title}</b>{r.description && <small>{r.description}</small>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

function Simulator({ bot }) {
  const [chat, setChat] = useState([])
  const [text, setText] = useState('hi')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState({})
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [chat])

  async function send(body, replyId = '') {
    if (!body && !replyId) return
    setBusy(true)
    setChat((c) => [...c, { me: true, text: body }])
    try {
      const r = await staffJson('/api/admin/whatsapp/bot/simulate', { method: 'POST', body: JSON.stringify({ bot, text: replyId ? '' : body, replyId, phone, name: 'Ravi', state }) })
      setState(r.state)
      setChat((c) => [...c, ...r.messages.map((m) => ({ m })), ...(r.paused ? [{ note: `Bot is now quiet in this chat for ${bot.handoffHours} h (type "menu" to bring it back).` }] : [])])
    } catch (err) {
      setChat((c) => [...c, { note: err.message }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wa-phone wa-sim">
      <div className="wa-phone-top"><img src="/assets/warehouse-logo.png" alt="" width="26" height="26" /> <b>Chennai Rice</b> <span className="wa-sim-tag">test</span></div>
      <div className="wa-phone-chat">
        {chat.length === 0 && <p className="wa-sim-hint">Type a message below as a customer would (try <b>hi</b>, <b>price</b>, an order number or a PIN code). Nothing is sent to WhatsApp.</p>}
        {chat.map((c, i) => (
          c.me ? <div key={i} className="wa-bubble wa-bubble--me"><p className="wa-bubble-body">{c.text}</p></div>
            : c.note ? <p key={i} className="wa-sim-note">{c.note}</p>
              : <BotBubble key={i} m={c.m} onTap={(id, title) => send(title, id)} />
        ))}
        <span ref={end} />
      </div>
      <form className="wa-sim-input" onSubmit={(e) => { e.preventDefault(); send(text.trim()); setText('') }}>
        <input value={text} placeholder="Message" onChange={(e) => setText(e.target.value)} disabled={busy} />
        <button type="submit" className="wa-round wa-round--small" disabled={busy || !text.trim()} title="Send"><I name="send" size={14} /></button>
      </form>
      <label className="wa-sim-phone">As customer mobile (for orders / offers):
        <input value={phone} inputMode="numeric" placeholder="optional" onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
      </label>
      <button type="button" className="wa-link wa-sim-clear" onClick={() => { setChat([]); setState({}) }}>Clear chat</button>
    </div>
  )
}

export default function Bot() {
  const [saved, setSaved] = useState(null)
  const [bot, setBot] = useState(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [openItem, setOpenItem] = useState(null)
  useEffect(() => { staffJson('/api/admin/whatsapp/bot').then((b) => { setSaved(b); setBot(b) }).catch((e) => setError(e.message)) }, [])

  if (error) return <p className="wa-alert">{error}</p>
  if (!bot) return <p className="wa-muted">Loading…</p>
  const dirty = JSON.stringify(bot) !== JSON.stringify(saved)
  const set = (patch) => setBot((b) => ({ ...b, ...patch }))
  const setItem = (i, patch) => set({ items: bot.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  const move = (i, d) => {
    const items = [...bot.items]
    const j = i + d
    if (j < 0 || j >= items.length) return
    ;[items[i], items[j]] = [items[j], items[i]]
    set({ items })
  }

  async function save(next = bot) {
    setBusy(true)
    setNote(null)
    try {
      const b = await staffJson('/api/admin/whatsapp/bot', { method: 'PUT', body: JSON.stringify(next) })
      setSaved(b)
      setBot(b)
      setNote({ text: b.enabled ? 'Saved. The bot answers customers with these settings now.' : 'Saved. The bot is off.' })
    } catch (err) {
      setNote({ bad: true, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const tooManyButtons = bot.welcome.style === 'buttons' && bot.items.length > 3
  return (
    <>
      <div className="wa-titlebar">
        <h1>Bot</h1>
        <div className="wa-actions">
          <button type="button" className={'wa-switch' + (bot.enabled ? ' is-on' : '')} onClick={() => save({ ...bot, enabled: !bot.enabled })} disabled={busy}
            aria-pressed={bot.enabled}>
            <span className="wa-switch-knob" /> {bot.enabled ? 'Bot is ON' : 'Bot is OFF'}
          </button>
          <button type="button" className="wa-btn wa-btn--lime" disabled={busy || !dirty} onClick={() => save()}>{busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        </div>
      </div>
      {note && <p className={note.bad ? 'wa-alert' : 'wa-ok'}>{note.text}</p>}

      <section className="wa-dark">
        <div className="wa-dark-head"><h2>When a customer messages +91 70666 46667</h2></div>
        <div className="wa-bot">
          <div className="wa-editor-form wa-bot-form">
            <div className="wa-field">
              <span>Welcome message <small>sent for: {bot.greetings.join(', ')} · {'{{name}}'} = customer's first name</small></span>
              <textarea rows={4} value={bot.welcome.text} onChange={(e) => set({ welcome: { ...bot.welcome, text: e.target.value } })} />
            </div>
            <div className="wa-grid2">
              <div className="wa-field"><span>Menu shown as</span>
                <div className="wa-seg wa-seg--light">
                  <button type="button" className={bot.welcome.style === 'list' ? 'is-on' : ''} onClick={() => set({ welcome: { ...bot.welcome, style: 'list' } })}>List (up to 10)</button>
                  <button type="button" className={bot.welcome.style === 'buttons' ? 'is-on' : ''} onClick={() => set({ welcome: { ...bot.welcome, style: 'buttons' } })}>Buttons (up to 3)</button>
                </div>
              </div>
              {bot.welcome.style === 'list' && (
                <label className="wa-field"><span>List button label</span>
                  <input value={bot.welcome.button} maxLength={20} onChange={(e) => set({ welcome: { ...bot.welcome, button: e.target.value } })} />
                </label>
              )}
            </div>
            {tooManyButtons && <p className="wa-problems">Buttons allow only 3 items; with {bot.items.length} items the menu is sent as a list.</p>}
            <label className="wa-field"><span>Greeting words <small>(comma separated)</small></span>
              <input value={bot.greetings.join(', ')} onChange={(e) => set({ greetings: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} />
            </label>

            <div className="wa-field">
              <span>Menu items <small>{bot.items.length} / 10 · label up to 24 characters</small></span>
              <ol className="wa-items">
                {bot.items.map((it, i) => (
                  <li key={it.id} className={openItem === it.id ? 'is-open' : ''}>
                    <div className="wa-item-head">
                      <button type="button" className="wa-item-title" onClick={() => setOpenItem(openItem === it.id ? null : it.id)}>
                        <b>{it.label || 'New item'}</b><small>{ACTIONS[it.action]}</small>
                      </button>
                      <button type="button" className="wa-round wa-round--small" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                      <button type="button" className="wa-round wa-round--small" title="Move down" onClick={() => move(i, 1)} disabled={i === bot.items.length - 1}>↓</button>
                      <button type="button" className="wa-round wa-round--small" title="Delete" onClick={() => set({ items: bot.items.filter((_, j) => j !== i) })}><I name="trash" size={13} /></button>
                    </div>
                    {openItem === it.id && (
                      <div className="wa-item-body">
                        <div className="wa-grid2">
                          <input value={it.label} maxLength={24} placeholder="Label, e.g. 💰 Prices" onChange={(e) => setItem(i, { label: e.target.value })} />
                          <input value={it.description} maxLength={72} placeholder="Short description (list only)" onChange={(e) => setItem(i, { description: e.target.value })} />
                        </div>
                        <select value={it.action} onChange={(e) => setItem(i, { action: e.target.value })}>
                          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <input value={it.keywords.join(', ')} placeholder="Keywords that also open this (comma separated)"
                          onChange={(e) => setItem(i, { keywords: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} />
                        <textarea rows={3} value={it.reply} placeholder={it.action === 'reply' ? 'The reply' : 'Message shown with it (or when there is nothing to show)'}
                          onChange={(e) => setItem(i, { reply: e.target.value })} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {bot.items.length < 10 && (
                <button type="button" className="wa-btn wa-btn--small" onClick={() => { const it = newItem(bot.items.length); set({ items: [...bot.items, it] }); setOpenItem(it.id) }}>
                  <I name="plus" size={14} /> Add menu item
                </button>
              )}
            </div>

            <label className="wa-field"><span>When the bot does not understand</span>
              <textarea rows={2} value={bot.fallback} onChange={(e) => set({ fallback: e.target.value })} />
            </label>
            <label className="wa-field wa-field--inline"><span>After "talk to our team", the bot stays quiet in that chat for</span>
              <input type="number" min={1} max={72} value={bot.handoffHours} onChange={(e) => set({ handoffHours: Number(e.target.value) })} /> <span>hours</span>
            </label>
            <p className="wa-bot-help">Always automatic: an order number (CR-…) gets its status (only for the number that placed it), and a 6-digit PIN code gets delivery details.</p>
          </div>
          <Simulator bot={bot} />
        </div>
      </section>
    </>
  )
}
