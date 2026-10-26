// The shop's live catalog (/api/catalog) for the chat's product cards and
// "Reorder": one request, shared by every card, refreshed after five minutes.
let cached = null

export function loadCatalog() {
  if (cached && Date.now() - cached.at < 5 * 60000) return cached.promise
  const promise = fetch('/api/catalog', { headers: { Accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('catalog'))))
    .then((data) => new Map((data.products || []).map((p) => [p.slug, p])))
  cached = { at: Date.now(), promise }
  promise.catch(() => { cached = null })
  return promise
}

/** A pack as the cart stores it: id "slug-10kg", its name with the size, the server's price. */
export function cartLine(product, variant, image) {
  const kg = Number(variant.packKg)
  return {
    id: `${product.slug}-${kg}kg`,
    name: `${product.name} (${kg} kg)`,
    tag: product.tag || '',
    price: Number(variant.price),
    image: product.image || image,
    packKg: kg,
  }
}

export const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN')
