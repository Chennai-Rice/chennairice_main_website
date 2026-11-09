import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pinInfo, searchAreas, _clearPlacesCache } from '../lib/sales/places.js'

const office = (Name, District, State, Pincode) => ({ Name, District, State, Pincode })
const reply = (list) => async () => ({ ok: true, json: async () => [{ Status: list.length ? 'Success' : 'Error', PostOffice: list.length ? list : null }] })

test('checkout address suggestions: PIN gives city, state and areas; area search gives PINs, the chosen state first', async () => {
  _clearPlacesCache()
  const info = await pinInfo('600 040', { fetchImpl: reply([office('Anna Nagar (Chennai)', 'Chennai', 'Tamil Nadu', '600040'), office('Anna Nagar West S.O', 'Chennai', 'Tamil Nadu', '600040')]) })
  assert.deepEqual(info, { pin: '600040', city: 'Chennai', state: 'Tamil Nadu', areas: ['Anna Nagar', 'Anna Nagar West'] })
  assert.equal(await pinInfo('12345', { fetchImpl: reply([]) }), null)
  assert.equal(await pinInfo('012345', { fetchImpl: reply([]) }), null)

  _clearPlacesCache()
  const hits = await searchAreas('anna', { state: 'Tamil Nadu', fetchImpl: reply([
    office('Anna Nagar (Bangalore)', 'Bangalore', 'Karnataka', '560001'),
    office('Arignar Anna Nagar', 'Tiruvallur', 'Tamil Nadu', '600072'),
    office('Anna Nagar (Chennai)', 'Chennai', 'Tamil Nadu', '600040'),
  ]) })
  assert.deepEqual(hits.map((h) => h.area + ' ' + h.pin), ['Anna Nagar 600040', 'Arignar Anna Nagar 600072', 'Anna Nagar 560001'])
  assert.deepEqual(await searchAreas('an', { fetchImpl: reply([office('X', 'Y', 'Z', '600001')]) }), [])

  // India Post down or slow: no suggestions, no error.
  _clearPlacesCache()
  assert.deepEqual(await searchAreas('velacheri', { fetchImpl: async () => { throw new Error('down') } }), [])
})
