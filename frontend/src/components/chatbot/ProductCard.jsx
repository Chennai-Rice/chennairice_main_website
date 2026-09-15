import { Link } from 'react-router-dom'

/** Compact product card rendered inline in the chat when Soru Kutty recommends a real Chennai Rice pack. */
export default function ProductCard({ product }) {
  return (
    <div className="sk-product-card">
      <div className="sk-product-thumb">
        <img src={product.image} alt={product.name} loading="lazy" />
      </div>
      <div className="sk-product-info">
        <div className="sk-product-eyebrow">Chennai Rice</div>
        <div className="sk-product-name">{product.name}</div>
        <div className="sk-product-meta">{product.packSize} · {product.blurb}</div>
        <Link className="sk-product-link" to="/products">
          View Product →
        </Link>
      </div>
    </div>
  )
}
