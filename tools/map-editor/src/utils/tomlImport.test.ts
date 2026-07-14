import { describe, it, expect } from 'vitest'
import { parseLocationsToml, parseGraphToml, edgesToMapEdges } from './tomlImport'

const sampleLocations = `
[[locations]]
id = "town_square"
name = "城镇广场"
type = "town"
tags = ["public"]

[[locations]]
id = "tavern"
name = "酒馆"
parent = "town_square"
type = "building"
tags = ["has_drink"]
`

const sampleGraph = `
[[edges]]
from = "town_square"
to = "tavern"
time_cost = 5
`

describe('tomlImport', () => {
  it('parses [[locations]] into MapNodes', () => {
    const nodes = parseLocationsToml(sampleLocations, 'test')
    expect(nodes).toHaveLength(2)
    expect(nodes[0].id).toBe('town_square')
    expect(nodes[0].parent).toBeNull()
    expect(nodes[1].parent).toBe('town_square')
    expect(nodes[1].tags).toContain('has_drink')
  })

  it('parses graph [[edges]] into MapEdges', () => {
    const raw = parseGraphToml(sampleGraph)
    const edges = edgesToMapEdges(raw)
    expect(edges).toHaveLength(1)
    expect(edges[0].from).toBe('town_square')
    expect(edges[0].to).toBe('tavern')
    expect(edges[0].timeCost).toBe(5)
  })
})
