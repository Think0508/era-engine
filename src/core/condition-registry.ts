interface ConditionField {
  path: string
  type: string
  description: string
  operators: string
  source: string
}

class ConditionRegistry {
  private fields: ConditionField[] = []
  private builtinFields: ConditionField[] = [
    { path: 'location.id', type: 'string', description: 'Current location ID', operators: '== !=', source: 'engine' },
    { path: 'location.type', type: 'string', description: 'Current location type', operators: '== !=', source: 'engine' },
    { path: 'location.tags', type: 'string[]', description: 'Current location tags', operators: '== !=', source: 'engine' },
    { path: 'location.parent', type: 'string|null', description: 'Parent location ID', operators: '== !=', source: 'engine' },
    { path: 'game.time.hour', type: 'number', description: 'Current hour (0-23)', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'game.time.day', type: 'number', description: 'Current day', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'game.time.month', type: 'number', description: 'Current month', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'quest.{id}.status', type: 'string', description: 'Quest status', operators: '== !=', source: 'engine' }
  ]

  registerFromAttributes(attributes: Record<string, any>): void {
    for (const [name, def] of Object.entries(attributes)) {
      const attrDef = def as any
      const type = attrDef.type || 'number'
      const ops = operatorsForType(type)
      this.fields.push({
        path: `player.${name}`,
        type,
        description: `Player attribute: ${name}`,
        operators: ops,
        source: 'attributes.toml'
      })
      this.fields.push({
        path: `character.{id}.${name}`,
        type,
        description: `NPC attribute: ${name}`,
        operators: ops,
        source: 'attributes.toml'
      })
    }
  }

  registerFromPlugin(pluginId: string, fields: Record<string, { type: string; description: string }>): void {
    for (const [path, def] of Object.entries(fields)) {
      this.fields.push({
        path,
        type: def.type,
        description: def.description,
        operators: operatorsForType(def.type),
        source: `plugin:${pluginId}`
      })
    }
  }

  registerFromBindings(bindings: Record<string, Record<string, string>>): void {
    for (const [pluginId, mapping] of Object.entries(bindings)) {
      for (const [pluginKey, attrName] of Object.entries(mapping)) {
        this.fields.push({
          path: `player.${pluginKey}`,
          type: 'number',
          description: `Bound attribute: ${pluginKey} -> ${attrName}`,
          operators: '> < >= <= == !=',
          source: `bindings:${pluginId}`
        })
      }
    }
  }

  getAllFields(): ConditionField[] {
    return [...this.builtinFields, ...this.fields]
  }

  validateField(path: string): boolean {
    const allFields = this.getAllFields()
    if (allFields.some(f => f.path === path)) return true
    return allFields.some(f => f.path.includes('{') && pathMatch(f.path, path))
  }

  generateManual(): string {
    const allFields = this.getAllFields()
    let md = '# 可用条件属性手册\n\n'
    md += '| Field Path | Type | Description | Operators | Source |\n'
    md += '|------------|------|-------------|-----------|--------|\n'
    for (const f of allFields) {
      md += `| \`${f.path}\` | ${f.type} | ${f.description} | ${f.operators} | ${f.source} |\n`
    }
    return md
  }

  clear(): void {
    this.fields = []
  }
}

function operatorsForType(type: string): string {
  if (type === 'number') return '> < >= <= == !='
  return '== !='
}

function pathMatch(pattern: string, actual: string): boolean {
  const patternParts = pattern.split('.')
  const actualParts = actual.split('.')
  if (patternParts.length !== actualParts.length) return false
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].includes('{')) continue
    if (patternParts[i] !== actualParts[i]) return false
  }
  return true
}

export const conditionRegistry = new ConditionRegistry()
