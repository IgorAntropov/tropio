import { describe, expect, it } from 'vitest'
import { poiCreateInput, poiEditInput, poiListInput, poiRemoveInput, poiVisibilityInput } from '../src/geo/pois/poi-input.js'

const id = '7d459c2c-6f31-4bd7-867c-58b0c4274af1'

describe('POI request validation', () => {
  it('normalizes a valid location and only accepts a scope UUID for a trip POI', () => {
    const input = {
      category_id: id.toUpperCase(),
      name: '  Смотровая  ',
      position: { lon: 84.975, lat: 56.488 },
      visibility: 'trip',
      scope_trip_id: id,
    }
    expect(poiCreateInput(input)).toEqual({ ...input, category_id: id, name: 'Смотровая' })
    expect(() => poiCreateInput({ ...input, visibility: 'private' })).toThrow('INVALID_REQUEST')
    expect(() => poiCreateInput({ ...input, scope_trip_id: undefined })).toThrow('INVALID_REQUEST')
    expect(() => poiCreateInput({ ...input, position: { lon: 181, lat: 56.488 } })).toThrow('INVALID_REQUEST')
  })

  it('rejects controls that do not belong to the selected command', () => {
    expect(poiEditInput({ poi_revision_id: id, description: null })).toEqual({ poi_revision_id: id, description: null })
    expect(() => poiEditInput({ poi_revision_id: id })).toThrow('INVALID_REQUEST')
    expect(() => poiEditInput({ poi_revision_id: id, visibility: 'global' })).toThrow('INVALID_REQUEST')
    expect(() => poiVisibilityInput({ poi_revision_id: id, visibility: 'trip' })).toThrow('INVALID_REQUEST')
    expect(() => poiRemoveInput({ poi_revision_id: id, position: { lon: 0, lat: 0 } })).toThrow('INVALID_REQUEST')
  })

  it('validates a POI layer and its spatial filters', () => {
    expect(poiListInput({ scope: 'global', bbox: '84,56,85,57', q: '  вид ', limit: '10' })).toEqual({
      scope: 'global',
      bbox: [84, 56, 85, 57],
      q: 'вид',
      limit: 10,
    })
    expect(() => poiListInput({ scope: 'trip' })).toThrow('INVALID_REQUEST')
    expect(() => poiListInput({ scope: 'mine', trip_id: id })).toThrow('INVALID_REQUEST')
    expect(() => poiListInput({ scope: 'global', bbox: '85,56,84,57' })).toThrow('INVALID_REQUEST')
    expect(() => poiListInput({ scope: 'global', bbox: '84,,85,57' })).toThrow('INVALID_REQUEST')
  })
})
