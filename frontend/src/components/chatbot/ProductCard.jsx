import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../../shop/hooks/useCart.jsx'
import { loadCatalog, cartLine, rupees } from './chatCatalog.js'

const TEXT = {
  en: { add: 'Add to cart', more: 'Add one more', cart: 'Go to cart →', view: 'View product', out: 'Out of stock', ask: 'Price on request' },
  ta: { add: 'கார்ட்டில் சேர்', more: 'இன்னொன்று சேர்', cart: 'கார்ட்டுக்கு செல்ல →', view: 'பொருளைப் பார்க்க', out: 'ஸ்டாக் இல்லை', ask: 'விலைக்கு தொடர்பு கொள்ளவும்' },
}

/**
 * A pack Soru Kutty named, with its sizes and today's prices from the shop
 * and "Add to cart" right in the chat. If the catalog cannot be read it falls
 * back to the picture, the line and "View product".
 */
export default function ProductCard({ product, lang = 'en' }) {
  const t = TEXT[lang] || TEXT.en
  const { items, add, setQty } = useCart()
  const [live, setLive] = useState(null)
  const [kg, setKg] = useState(null)

  useEffect(() => {
    let gone = false
    loadCatalog().then((byslug) => {
      const p = byslug.get(product.id)
      if (gone || !p) return
      setLive(p)
      const buyable = p.variants.filter((v) => v.inStock)
      const pick = buyable.find((v) => Number(v.packKg) === 10) || buyable[0] || p.variants[0]
      if (pick) setKg(Number(pick.packKg))
    }).catch(() => {})
    return () => { gone = true }
  }, [product.id])

  const variant = live?.variants.find((v) => Number(v.packKg) === kg)
  const line = variant ? cartLine(live, variant, product.image) : null
  const inCart = line && items.find((i) => i.id === line.id)

  const addOne = () => {
    if (!line) return
    if (inCart) setQty(line.id, inCart.qty + 1)
    else add(line)
  }

  return (
    <div className="sk-product-card">
      <div className="sk-product-thumb">
        <img src={live?.image || product.image} alt={product.name} loading="lazy" />
      </div>
      <div className="sk-product-info">
        <div className="sk-product-eyebrow">Chennai Rice</div>
        <div className="sk-product-name">{live?.name || product.name}</div>
        {!live && <div className="sk-product-meta">{product.blurb}</div>}

        {live && (
          <>
            <div className="sk-pack-row" role="group" aria-label="Pack size">
              {live.variants.map((v) => (
                <button
                  key={v.packKg}
                  type="button"
                  className={`sk-pack${Number(v.packKg) === kg ? ' is-on' : ''}${v.inStock ? '' : ' is-out'}`}
                  onClick={() => setKg(Number(v.packKg))}
                  aria-pressed={Number(v.packKg) === kg}
                >
                  {Number(v.packKg)} kg
                </button>
              ))}
            </div>
            {variant && (
              <div className="sk-price">
                {variant.price == null ? (
                  <span className="sk-price-ask">{t.ask}</span>
                ) : (
                  <>
                    <strong>{rupees(variant.price)}</strong>
                    {variant.mrp != null && Number(variant.mrp) > Number(variant.price) && <s>{rupees(variant.mrp)}</s>}
                    {!variant.inStock && <span className="sk-price-out">{t.out}</span>}
                  </>
                )}
              </div>
            )}
            {variant?.inStock && (
              <div className="sk-product-actions">
                <button type="button" className="sk-add" onClick={addOne}>
                  {inCart ? `${t.more} (${inCart.qty})` : t.add}
                </button>
                {inCart && <Link className="sk-product-link" to="/cart">{t.cart}</Link>}
              </div>
            )}
          </>
        )}
        <Link className="sk-product-link sk-product-view" to={`/products/${product.id}`}>
          {t.view} →
        </Link>
      </div>
    </div>
  )
}
