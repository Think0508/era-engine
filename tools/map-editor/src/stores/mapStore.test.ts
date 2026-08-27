import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMapStore } from '../stores/mapStore'
import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'

const makeNode = (id: string, parent: string | null = null): MapNode => ({
  id,
  name: id,
  type: 'region',
  parent,
  tags: [],
  visible: true,
  position: { x: 0, y: 0 },
  collapsed: false,
})

const makeEdge = (id: string, from: string, to: string): MapEdge => ({
  id,
  from,
  to,
  timeCost: 10,
  direction: 'directed',
})

describe('mapStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renameNodeId updates edges and children references', () => {
    const store = useMapStore()
    store.addNode(makeNode('a'))
    store.addNode(makeNode('b', 'a'))
    store.addEdge(makeEdge('e1', 'a', 'b'))

    expect(store.renameNodeId('a', 'a2')).toBe(true)
    expect(store.nodes.some(n => n.id === 'a2')).toBe(true)
    expect(store.nodes.find(n => n.id === 'b')?.parent).toBe('a2')
    expect(store.edges[0].from).toBe('a2')
  })

  it('renameNodeId can update name together with id', () => {
    const store = useMapStore()
    store.addNode(makeNode('a'))
    expect(store.renameNodeId('a', 'b', '新名称')).toBe(true)
    expect(store.nodes[0].id).toBe('b')
    expect(store.nodes[0].name).toBe('新名称')
  })

  it('renameNodeId rejects duplicate and empty ids', () => {
    const store = useMapStore()
    store.addNode(makeNode('a'))
    store.addNode(makeNode('x'))

    expect(store.renameNodeId('a', 'x')).toBe(false)
    expect(store.renameNodeId('a', '  ')).toBe(false)
    expect(store.nodes.some(n => n.id === 'a')).toBe(true)
  })

  it('tracks dirty state and markSaved clears it', () => {
    const store = useMapStore()
    store.addNode(makeNode('a'))
    expect(store.dirty).toBe(true)
    store.markSaved()
    expect(store.dirty).toBe(false)
    store.updateNode('a', { name: 'changed' })
    expect(store.dirty).toBe(true)
  })

  it('removeNode survives parent cycles without infinite recursion', () => {
    const store = useMapStore()
    store.addNode(makeNode('a', 'b'))
    store.addNode(makeNode('b', 'a'))
    store.addEdge(makeEdge('e1', 'a', 'b'))

    store.removeNode('a')
    expect(store.nodes).toHaveLength(0)
    expect(store.edges).toHaveLength(0)
  })

  it('undo and redo restore node/edge state', () => {
    const store = useMapStore()
    store.addNode(makeNode('a'))
    store.addEdge(makeEdge('e1', 'a', 'a'))
    expect(store.nodes).toHaveLength(1)

    store.undo()
    expect(store.nodes).toHaveLength(1)
    expect(store.edges).toHaveLength(0)
    expect(store.canUndo).toBe(true)
    expect(store.canRedo).toBe(true)

    store.undo()
    expect(store.nodes).toHaveLength(0)
    expect(store.edges).toHaveLength(0)
    expect(store.canUndo).toBe(false)

    store.redo()
    expect(store.nodes).toHaveLength(1)
    expect(store.edges).toHaveLength(0)
    store.redo()
    expect(store.edges).toHaveLength(1)
  })

  it('bulkUpdateNodes creates a single undo step', () => {
    const store = useMapStore()
    store.addNode(makeNode('a'))
    store.addNode(makeNode('b'))
    store.bulkUpdateNodes(['a', 'b'], { type: 'city' })

    store.undo()
    expect(store.nodes.every(n => n.type === 'region')).toBe(true)
  })

  it('saves and loads visual map positions per map id', () => {
    const store = useMapStore()
    store.addNode(makeNode('root'))
    store.addNode(makeNode('child', 'root'))
    store.nodes[1].position = { x: 111, y: 222 }
    store.saveVisualMapPositions('root')

    expect(store.getVisualMapContext('root').nodePositions?.['child']).toEqual({ x: 111, y: 222 })

    store.nodes[1].position = { x: 0, y: 0 }
    store.loadVisualMapPositions('root')
    expect(store.nodes[1].position).toEqual({ x: 111, y: 222 })
  })

  it('persists visualMaps in project file', () => {
    const store = useMapStore()
    store.addNode(makeNode('root'))
    store.addNode(makeNode('child', 'root'))
    store.saveVisualMap('root', { backgroundPath: 'data:image/png;base64,x' })

    const project = store.toProject()
    expect(project.version).toBe(3)
    expect(project.visualMaps?.root?.backgroundPath).toBe('data:image/png;base64,x')
  })

  it('renameNodeId migrates visual map position keys', () => {
    const store = useMapStore()
    store.addNode(makeNode('root'))
    store.addNode(makeNode('child', 'root'))
    store.saveVisualMap('root', { nodePositions: { child: { x: 10, y: 20 } } })

    expect(store.renameNodeId('child', 'renamed')).toBe(true)
    const positions = store.getVisualMapContext('root').nodePositions
    expect(positions?.renamed).toEqual({ x: 10, y: 20 })
    expect(positions?.child).toBeUndefined()
  })

  it('migrates legacy top-level background into root visual map', () => {
    const store = useMapStore()
    store.loadProject({
      version: 2,
      name: 'legacy',
      viewport: { x: 0, y: 0, zoom: 1 },
      backgroundPath: 'data:image/png;base64,legacy',
      bgImageWidth: 800,
      bgImageHeight: 600,
      nodes: [],
      edges: [],
    } as any)

    expect(store.getVisualMapContext('').backgroundPath).toBe('data:image/png;base64,legacy')
  })

  it('renameNodeId migrates the node own visual map context', () => {
    const store = useMapStore()
    store.addNode(makeNode('a'))
    store.saveVisualMap('a', { backgroundPath: 'data:image/png;base64,sub' })

    expect(store.renameNodeId('a', 'b')).toBe(true)
    expect(store.getVisualMapContext('b').backgroundPath).toBe('data:image/png;base64,sub')
    expect(store.getVisualMapContext('a').backgroundPath).toBeUndefined()
  })

  it('removes visualMap context and position entries when node is deleted', () => {
    const store = useMapStore()
    store.addNode(makeNode('root'))
    store.addNode(makeNode('child', 'root'))
    store.saveVisualMap('child', { backgroundPath: 'data:image/png;base64,sub' })
    store.saveVisualMap('root', { nodePositions: { child: { x: 5, y: 6 } } })

    store.removeNode('child')
    expect(store.getVisualMapContext('child').backgroundPath).toBeUndefined()
    expect(store.getVisualMapContext('root').nodePositions?.child).toBeUndefined()
  })

  it('does not migrate top-level background into root for v3 projects', () => {
    const store = useMapStore()
    store.loadProject({
      version: 3,
      name: 'v3',
      viewport: { x: 0, y: 0, zoom: 1 },
      backgroundPath: 'data:image/png;base64,stale-sub',
      visualMaps: {
        '少林寺': { backgroundPath: 'data:image/png;base64,temple' },
      },
      nodes: [],
      edges: [],
    } as any)

    expect(store.getVisualMapContext('').backgroundPath).toBeUndefined()
    expect(store.getVisualMapContext('少林寺').backgroundPath).toBe('data:image/png;base64,temple')
  })

  it('undo restores visualMaps state', () => {
    const store = useMapStore()
    store.addNode(makeNode('root'))
    store.addNode(makeNode('child', 'root'))
    store.saveVisualMap('root', { backgroundPath: 'before' })
    store.updateNode('child', { name: 'changed' })
    expect(store.getVisualMapContext('root').backgroundPath).toBe('before')

    store.undo()
    // The snapshot before updateNode should still contain the visualMap background.
    expect(store.getVisualMapContext('root').backgroundPath).toBe('before')
  })
})