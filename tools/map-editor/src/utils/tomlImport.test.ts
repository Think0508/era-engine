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
  it('parses [[locations]] into MapNodes', async () => {
    const nodes = await parseLocationsToml(sampleLocations, 'test')
    expect(nodes).toHaveLength(2)
    expect(nodes[0].id).toBe('town_square')
    expect(nodes[0].parent).toBeNull()
    expect(nodes[1].parent).toBe('town_square')
    expect(nodes[1].tags).toContain('has_drink')
  })

  it('parses graph [[edges]] into MapEdges', async () => {
    const raw = await parseGraphToml(sampleGraph)
    const edges = edgesToMapEdges(raw)
    expect(edges).toHaveLength(1)
    expect(edges[0].from).toBe('town_square')
    expect(edges[0].to).toBe('tavern')
    expect(edges[0].timeCost).toBe(5)
    expect(edges[0].direction).toBe('directed')
  })

  it('collapses symmetric reverse pair into one bidirectional edge', () => {
    const edges = edgesToMapEdges([
      { from: 'a', to: 'b', time_cost: 10 },
      { from: 'b', to: 'a', time_cost: 10 },
    ])
    expect(edges).toHaveLength(1)
    expect(edges[0].direction).toBe('bidirectional')
    expect(edges[0].from).toBe('a')
    expect(edges[0].to).toBe('b')
  })

  it('keeps asymmetric reverse pair as two directed edges', () => {
    const edges = edgesToMapEdges([
      { from: 'a', to: 'b', time_cost: 5 },
      { from: 'b', to: 'a', time_cost: 30 },
    ])
    expect(edges).toHaveLength(2)
    expect(edges.every(e => e.direction === 'directed')).toBe(true)
    expect(edges[0].timeCost).toBe(5)
    expect(edges[1].timeCost).toBe(30)
  })

  it('keeps single edge as directed', () => {
    const edges = edgesToMapEdges([{ from: 'a', to: 'b', time_cost: 7 }])
    expect(edges).toHaveLength(1)
    expect(edges[0].direction).toBe('directed')
  })
})
