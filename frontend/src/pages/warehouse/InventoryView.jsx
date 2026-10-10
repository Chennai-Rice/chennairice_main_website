import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { staffJson } from '../../services/staffAuth.js'
import { Icon, dayLabel, istDay, timeLabel } from './shared.jsx'

const TABS = [
  { key: 'all', label: 'All Products' },
  { key: 'summary', label: 'Stock Summary' },
  { key: 'movements', label: 'Stock Movements' },
  { key: 'low', label: 'Low Stock' },
]
const MOVE = {
  production_in: 'Production', reserve: 'Held for order', release: 'Hold released', dispatch: 'Dispatched',
  dispatch_reversal: 'Dispatch undone', return_in: 'Returned', damage: 'Damaged', adjustment: 'Adjustment',
  transfer_out: 'Transfer out', transfer_in: 'Transfer in',
}

function stockState(s) {
  if (!s.is_active || s.priced === false) return { key: 'off', label: 'Not sold online' }
  if (s.available <= 0) return { key: 'out', label: 'Out of stock' }
  if (s.low) return { key: 'low', label: 'Low stock' }
  return { key: 'ok', label: 'In stock' }
}

/** Adjust / production / damage, for one pack size. */
function StockDialog({ kind, row, busy, onSubmit, onCancel }) {
  const [f, setF] = useState({ quantity: '', delta: '', reason: '', batchNo: '', packedOn: istDay(0), bestBefore: '', notes: '' })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const title = { adjust: 'Adjust stock', production: 'Record production batch', damage: 'Mark damaged' }[kind]
  return (
    <div className="wh-modal-backdrop" onClick={onCancel}>
      <form className="wh-modal" role="dialog" aria-modal="true" aria-labelledby="wh-stock-title"
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(f) }}>
        <button type="button" className="wh-modal-x" onClick={onCancel} aria-label="Close"><Icon name="x" size={18} /></button>
        <h2 id="wh-stock-title">{title}</h2>
        <p className="wh-muted">{row.product_name} · {Number(row.pack_kg)} kg · on hand <strong>{row.on_hand}</strong>, available <strong>{row.available}</strong></p>
        {kind === 'adjust' && (
          <>
            <label className="wh-filter"><span>Change in packs * (use − to reduce)</span>
              <input className="wh-input" type="number" step="1" value={f.delta} onChange={set('delta')} required placeholder="e.g. 12 or -3" autoFocus />
            </label>
            <label className="wh-filter"><span>Reason *</span>
              <input className="wh-input" value={f.reason} onChange={set('reason')} required placeholder="e.g. Stock count on 9 Oct" />
            </label>
          </>
        )}
        {kind === 'damage' && (
          <>
            <label className="wh-filter"><span>Damaged packs *</span>
              <input className="wh-input" type="number" min="1" step="1" value={f.quantity} onChange={set('quantity')} required autoFocus />
            </label>
            <label className="wh-filter"><span>What happened? *</span>
              <input className="wh-input" value={f.reason} onChange={set('reason')} required placeholder="e.g. Torn while loading" />
            </label>
          </>
        )}
        {kind === 'production' && (
          <div className="wh-form-grid">
            <label className="wh-filter"><span>Packs packed *</span>
              <input className="wh-input" type="number" min="1" step="1" value={f.quantity} onChange={set('quantity')} required autoFocus />
            </label>
            <label className="wh-filter"><span>Batch number</span>
              <input className="wh-input" value={f.batchNo} onChange={set('batchNo')} placeholder="Leave empty to auto-number" />
            </label>
            <label className="wh-filter"><span>Packed on *</span>
              <input className="wh-input" type="date" value={f.packedOn} onChange={set('packedOn')} required />
            </label>
            <label className="wh-filter"><span>Best before</span>
              <input className="wh-input" type="date" value={f.bestBefore} onChange={set('bestBefore')} />
            </label>
            <label className="wh-filter wh-span-2"><span>Notes</span>
              <input className="wh-input" value={f.notes} onChange={set('notes')} />
            </label>
          </div>
        )}
        <div className="wh-modal-actions">
          <button type="button" className="wh-btn wh-btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}

function AddProductDialog({ busy, onSubmit, onCancel }) {
  const [f, setF] = useState({ name: '', tag: '', description: '', imageUrl: '', packKg: '10', price: '', mrp: '' })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <div className="wh-modal-backdrop" onClick={onCancel}>
      <form className="wh-modal wh-modal--wide" role="dialog" aria-modal="true" aria-labelledby="wh-add-title"
        onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(f) }}>
        <button type="button" className="wh-modal-x" onClick={onCancel} aria-label="Close"><Icon name="x" size={18} /></button>
        <h2 id="wh-add-title">Add product</h2>
        <p className="wh-muted">Creates the product and its first pack size. More sizes and the pack photo can be added later.</p>
        <div className="wh-form-grid">
          <label className="wh-filter"><span>Name *</span><input className="wh-input" value={f.name} onChange={set('name')} required autoFocus /></label>
          <label className="wh-filter"><span>Label</span><input className="wh-input" value={f.tag} onChange={set('tag')} placeholder="e.g. Rajabhogam Ponni" /></label>
          <label className="wh-filter wh-span-2"><span>Description</span><input className="wh-input" value={f.description} onChange={set('description')} /></label>
          <label className="wh-filter wh-span-2"><span>Pack photo path</span><input className="wh-input" value={f.imageUrl} onChange={set('imageUrl')} placeholder="/assets/shop/packs/name.png" /></label>
          <label className="wh-filter"><span>First pack size (kg) *</span><input className="wh-input" type="number" min="1" max="100" step="0.5" value={f.packKg} onChange={set('packKg')} required /></label>
          <label className="wh-filter"><span>Price (₹, incl. GST)</span><input className="wh-input" type="number" min="1" step="1" value={f.price} onChange={set('price')} placeholder="Empty = not sold yet" /></label>
          <label className="wh-filter"><span>MRP (₹)</span><input className="wh-input" type="number" min="1" step="1" value={f.mrp} onChange={set('mrp')} /></label>
        </div>
        <div className="wh-modal-actions">
          <button type="button" className="wh-btn wh-btn--ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="wh-btn wh-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Add product'}</button>
        </div>
      </form>
    </div>
  )
}

function RowMenu({ row, can, onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [onClose])
  return (
    <div className="wh-menu" ref={ref} role="menu">
      <button type="button" role="menuitem" disabled={!can.production} onClick={() => onPick('production', row)}><Icon name="box" size={16} /> Record production batch</button>
      <button type="button" role="menuitem" disabled={!can.adjust} onClick={() => onPick('adjust', row)}><Icon name="reset" size={16} /> Adjust stock</button>
      <button type="button" role="menuitem" className="is-danger" disabled={!can.adjust} onClick={() => onPick('damage', row)}><Icon name="cancel" size={16} /> Mark damaged</button>
    </div>
  )
}

export default function InventoryView({ say, onAuthError, permissions, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'all')
  const [stock, setStock] = useState(null)
  const [moves, setMoves] = useState(null)
  const [q, setQ] = useState('')
  const [pack, setPack] = useState('')
  const [status, setStatus] = useState('')
  const [menuFor, setMenuFor] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [busy, setBusy] = useState(false)
  const can = {
    adjust: permissions.includes('inventory.adjust'),
    production: permissions.includes('production.create'),
    catalog: permissions.includes('catalog.edit'),
  }

  useEffect(() => { if (initialTab) setTab(initialTab) }, [initialTab])

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        staffJson('/api/admin/inventory'),
        staffJson('/api/admin/inventory/movements?limit=150'),
      ])
      setStock(s.stock)
      setMoves(m.movements)
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    }
  }, [say, onAuthError])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (stock || [])
      .filter((r) => r.is_fulfilment && r.product_active !== false && r.is_active)
      .filter((r) => !term || r.product_name.toLowerCase().includes(term) || r.sku.toLowerCase().includes(term))
      .filter((r) => !pack || Number(r.pack_kg) === Number(pack))
      .filter((r) => !status || stockState(r).key === status)
  }, [stock, q, pack, status])
  const lowRows = rows.filter((r) => ['low', 'out'].includes(stockState(r).key) && r.priced !== false)
  const lowCount = (stock || []).filter((r) => r.is_fulfilment && r.is_active && r.priced !== false && ['low', 'out'].includes(stockState(r).key)).length

  const summary = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const p = map.get(r.product_name) || { name: r.product_name, image: r.image_url, sizes: 0, onHand: 0, held: 0, available: 0, kg: 0 }
      p.sizes++
      p.onHand += r.on_hand
      p.held += r.reserved
      p.available += r.available
      p.kg += r.on_hand * Number(r.pack_kg)
      map.set(r.product_name, p)
    }
    return [...map.values()]
  }, [rows])

  async function submitStock(f) {
    const { kind, row } = dialog
    const [path, body] = {
      adjust: ['/api/admin/inventory/adjust', { variantId: row.variant_id, delta: Number(f.delta), reason: f.reason }],
      damage: ['/api/admin/inventory/damage', { variantId: row.variant_id, quantity: Number(f.quantity), reason: f.reason }],
      production: ['/api/admin/production/batches', {
        variantId: row.variant_id, quantity: Number(f.quantity), batchNo: f.batchNo || undefined,
        packedOn: f.packedOn, bestBefore: f.bestBefore || undefined, notes: f.notes || undefined,
      }],
    }[kind]
    setBusy(true)
    try {
      await staffJson(path, { method: 'POST', body: JSON.stringify(body) })
      say({ adjust: 'Stock adjusted', damage: 'Damaged packs recorded', production: 'Production batch recorded' }[kind])
      setDialog(null)
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function addProduct(f) {
    setBusy(true)
    try {
      const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const { product } = await staffJson('/api/admin/catalog/products', {
        method: 'POST', body: JSON.stringify({ slug, name: f.name, tag: f.tag, description: f.description, imageUrl: f.imageUrl }),
      })
      await staffJson(`/api/admin/catalog/products/${product.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({ packKg: Number(f.packKg), price: f.price ? Number(f.price) : null, mrp: f.mrp ? Number(f.mrp) : null }),
      })
      say(`${f.name} added`)
      setDialog(null)
      load()
    } catch (err) {
      if (!onAuthError(err)) say(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const productTable = (list) => (
    <div className="wh-table wh-table--inventory" role="table" aria-label="Pack sizes and stock">
      <div className="wh-tr wh-th" role="row">
        <span role="columnheader">Product</span>
        <span role="columnheader">SKU</span>
        <span role="columnheader">Pack Size</span>
        <span role="columnheader">Current Stock</span>
        <span role="columnheader">Reserved</span>
        <span role="columnheader">Available</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Actions</span>
      </div>
      {list.map((r) => {
        const st = stockState(r)
        return (
          <div key={r.variant_id} className="wh-tr" role="row">
            <span role="cell" className="wh-line">{r.image_url ? <img src={r.image_url} alt="" /> : <span className="wh-prod-img" />}<strong>{r.product_name}</strong></span>
            <span role="cell" className="wh-mono wh-small">{r.sku}</span>
            <span role="cell"><span className="wh-k">Pack</span>{Number(r.pack_kg)} kg</span>
            <span role="cell"><span className="wh-k">Current</span>{r.on_hand}</span>
            <span role="cell"><span className="wh-k">Reserved</span>{r.reserved}</span>
            <span role="cell"><span className="wh-k">Available</span><strong>{r.available}</strong></span>
            <span role="cell"><span className={`wh-stock wh-stock--${st.key}`}>{st.label}</span></span>
            <span role="cell" className="wh-td-actions">
              <span className="wh-menu-wrap">
                <button type="button" className="wh-icon-btn" aria-label={`Stock actions for ${r.product_name} ${Number(r.pack_kg)} kg`}
                  aria-expanded={menuFor === r.variant_id} disabled={!can.adjust && !can.production}
                  onClick={() => setMenuFor(menuFor === r.variant_id ? null : r.variant_id)}>
                  <Icon name="more" size={18} />
                </button>
                {menuFor === r.variant_id && (
                  <RowMenu row={r} can={can} onClose={() => setMenuFor(null)}
                    onPick={(kind, row) => { setMenuFor(null); setDialog({ kind, row }) }} />
                )}
              </span>
            </span>
          </div>
        )
      })}
      {!list.length && <p className="wh-empty">{stock ? 'Nothing matches.' : 'Loading…'}</p>}
    </div>
  )

  return (
    <>
      <div className="wh-page-head wh-page-head--row">
        <div>
          <h2>Products &amp; Inventory</h2>
          <p className="wh-muted">Rice varieties, stock levels and every stock movement</p>
        </div>
        {can.catalog && (
          <button type="button" className="wh-btn wh-btn--primary" onClick={() => setDialog({ kind: 'add' })}>
            <Icon name="box" size={18} /> Add Product
          </button>
        )}
      </div>

      <section className="wh-panel">
        <nav className="wh-tabs" aria-label="Inventory view">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={`wh-tab${tab === t.key ? ' is-active' : ''}${t.key === 'low' && lowCount ? ' is-alert' : ''}`}
              aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}{t.key === 'low' ? ` (${lowCount})` : ''}
            </button>
          ))}
        </nav>
        {tab !== 'movements' && (
          <div className="wh-filter-row wh-filter-row--top">
            <label className="wh-search">
              <Icon name="search" size={18} />
              <span className="visually-hidden">Search products</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product name or SKU..." />
            </label>
            <label className="wh-filter"><span>Pack Size</span>
              <span className="wh-select"><select value={pack} onChange={(e) => setPack(e.target.value)}>
                <option value="">All</option><option value="5">5 kg</option><option value="10">10 kg</option><option value="25">25 kg</option><option value="26">26 kg</option>
              </select></span>
            </label>
            <label className="wh-filter"><span>Stock Status</span>
              <span className="wh-select"><select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option><option value="ok">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="off">Not sold online</option>
              </select></span>
            </label>
            <button type="button" className="wh-btn wh-btn--outline wh-reset" onClick={() => { setQ(''); setPack(''); setStatus('') }}>
              <Icon name="reset" size={17} /> Reset
            </button>
          </div>
        )}
      </section>

      <section className="wh-panel wh-table-panel">
        {tab === 'all' && productTable(rows)}
        {tab === 'low' && productTable(lowRows)}
        {tab === 'summary' && (
          <div className="wh-table wh-table--summary" role="table" aria-label="Stock summary">
            <div className="wh-tr wh-th" role="row">
              <span role="columnheader">Product</span><span role="columnheader">Pack sizes</span><span role="columnheader">Packs on hand</span>
              <span role="columnheader">Held</span><span role="columnheader">Available</span><span role="columnheader">Rice on hand</span>
            </div>
            {summary.map((p) => (
              <div key={p.name} className="wh-tr" role="row">
                <span role="cell" className="wh-line">{p.image ? <img src={p.image} alt="" /> : <span className="wh-prod-img" />}<strong>{p.name}</strong></span>
                <span role="cell"><span className="wh-k">Sizes</span>{p.sizes}</span>
                <span role="cell"><span className="wh-k">On hand</span>{p.onHand}</span>
                <span role="cell"><span className="wh-k">Held</span>{p.held}</span>
                <span role="cell"><span className="wh-k">Available</span><strong>{p.available}</strong></span>
                <span role="cell"><span className="wh-k">Rice</span>{(p.kg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} t</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'movements' && (
          <div className="wh-table wh-table--moves" role="table" aria-label="Stock movements">
            <div className="wh-tr wh-th" role="row">
              <span role="columnheader">Date</span><span role="columnheader">Pack</span><span role="columnheader">Movement</span>
              <span role="columnheader">On hand</span><span role="columnheader">Held</span><span role="columnheader">Reference</span><span role="columnheader">By</span>
            </div>
            {(moves || []).map((m) => {
              const d = dayLabel(m.created_at)
              const sign = (n) => (n > 0 ? '+' + n : n < 0 ? String(n) : '—')
              return (
                <div key={m.id} className="wh-tr" role="row">
                  <span role="cell"><span className={d.recent ? 'is-recent' : ''}>{d.text}</span><span className="wh-muted wh-small">{timeLabel(m.created_at)}</span></span>
                  <span role="cell" className="wh-mono wh-small">{m.sku}</span>
                  <span role="cell">{MOVE[m.type] || m.type}{m.reason && <span className="wh-muted wh-small">{m.reason}</span>}</span>
                  <span role="cell" className={m.on_hand_delta > 0 ? 'wh-up' : m.on_hand_delta < 0 ? 'wh-down' : ''}><span className="wh-k">On hand</span>{sign(m.on_hand_delta)}</span>
                  <span role="cell"><span className="wh-k">Held</span>{sign(m.reserved_delta)}</span>
                  <span role="cell" className="wh-mono wh-small">{m.order_number || m.batch_no || '—'}</span>
                  <span role="cell" className="wh-small">{m.staff_name || 'System'}</span>
                </div>
              )
            })}
            {moves && !moves.length && <p className="wh-empty">No stock movements yet.</p>}
          </div>
        )}
        {tab !== 'movements' && (
          <p className="wh-pager-info wh-table-foot">
            Showing {tab === 'summary' ? summary.length + ' products' : (tab === 'low' ? lowRows : rows).length + ' pack sizes'}
          </p>
        )}
      </section>

      {dialog?.kind === 'add' && <AddProductDialog busy={busy} onSubmit={addProduct} onCancel={() => setDialog(null)} />}
      {dialog && dialog.kind !== 'add' && (
        <StockDialog kind={dialog.kind} row={dialog.row} busy={busy} onSubmit={submitStock} onCancel={() => setDialog(null)} />
      )}
    </>
  )
}
