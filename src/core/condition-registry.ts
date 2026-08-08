interface ConditionField {
  path: string
  type: string
  description: string
  operators: string
  source: string
}

class ConditionRegistry {
  private fields: ConditionField[] = []
  // 注释：内置基础字段（AGENTS §21）——固定存在
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
  // 注释：结构路径惯例（AGENTS §8 路径结构）——数据化字段（talents/abilities/relations 等）按结构校验
  private structuralFields: ConditionField[] = [
    { path: 'location.tags.{tag}', type: 'boolean', description: 'Location has tag (array includes)', operators: '== !=', source: 'engine' },
    { path: 'character.{id}.base.{attr}', type: 'number', description: 'Character base attribute', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'character.{id}.talents.{talent}', type: 'number', description: 'Character talent level', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'character.{id}.abilities.{ability}', type: 'number', description: 'Character ability level', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'character.{id}.abilities.{ability}.level', type: 'number', description: 'Character ability level (object form)', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'character.{id}.abilities.{ability}.xp', type: 'number', description: 'Character ability xp', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'player.abilities.{ability}.level', type: 'number', description: 'Player ability level (CVP A1 转换输出)', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'player.talents.{talent}', type: 'number', description: 'Player talent (CVP A1 转换输出)', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'character.{id}.factions.{faction}', type: 'string', description: 'Character faction rank', operators: '== !=', source: 'engine' },
    { path: 'character.{id}.status.{status}', type: 'boolean', description: 'Character has status effect', operators: '== !=', source: 'engine' },
    { path: 'character.{id}.status.{status}.stack', type: 'number', description: 'Status effect stack count', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'character.{id}.status.{status}.remaining', type: 'number', description: 'Status effect remaining minutes', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'character.{id}.relations.{other}.{type}', type: 'number', description: 'Character relation value', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'character.{id}.experience.{exp}', type: 'number', description: 'Character experience counter', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'character.{id}.first_times.{key}', type: 'boolean', description: 'Character first-time flag', operators: '== !=', source: 'engine' },
    { path: 'character.{id}.first_records.{key}', type: 'object', description: 'Character first-time record', operators: '== !=', source: 'engine' },
    { path: 'character.{id}.body_parts.{part}', type: 'boolean', description: 'Character body part presence', operators: '== !=', source: 'engine' },
    { path: 'character.{id}.body_semen.{part}.{index}', type: 'number', description: 'Character body semen count (精液污染追踪)', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'inventory.{item}.count', type: 'number', description: 'Inventory item count', operators: '> < >= <= == !=', source: 'engine' },
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
    return [...this.builtinFields, ...this.structuralFields, ...this.fields]
  }

  validateField(path: string): boolean {
    const allFields = this.getAllFields()
    if (allFields.some(f => f.path === path)) return true
    return allFields.some(f => f.path.includes('{') && pathMatch(f.path, path))
  }

  // 注释：校验一个条件表达式——提取所有字段路径并逐个 validateField
  // selected./target. 根先归一化为 character.{id}.（与实体解析语义一致）
  // 未知路径返回 { ok: false, unknown: [...] }
  validateExpression(expr: string): { ok: boolean; unknown: string[] } {
    const paths = extractFieldPaths(expr).map(normalizeRootPath)
    const unknown = paths.filter((p: string) => !this.validateField(p))
    return { ok: unknown.length === 0, unknown }
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

// 注释：从条件表达式中提取字段路径（location.tags.has_x / player.气血 / selected.xxx / target.xxx /
// 插件注册的自定义根（如 combat.in_progress）等）
// 做法：去掉字符串字面量 → 按运算符/括号切 token → 收集含 '.' 且首字符为字母的 token
// 不做根白名单过滤——插件自定义根字段直接走 validateField 精确匹配
const STRING_RE = /"[^"]*"|'[^']*'/g
const TOKEN_SPLIT_RE = /&&|\|\||[()!<>=]+|\s+/

function extractFieldPaths(expr: string): string[] {
  const stripped = expr.replace(STRING_RE, '')
  const tokens = stripped.split(TOKEN_SPLIT_RE).map(t => t.trim()).filter(Boolean)
  const paths: string[] = []
  for (const token of tokens) {
    if (!token.includes('.')) continue
    // 注释：首字符须为字母（数字/负号字面量如 0.5、-5 不是字段路径）
    if (!/[A-Za-z]/.test(token[0])) continue
    if (!paths.includes(token)) paths.push(token)
  }
  return paths
}

// 注释：selected./target. → character.{id}.（与 resolveValue 的实体解析语义一致）
function normalizeRootPath(path: string): string {
  if (path.startsWith('selected.')) return `character.{id}.${path.slice('selected.'.length)}`
  if (path.startsWith('target.')) return `character.{id}.${path.slice('target.'.length)}`
  return path
}

export const conditionRegistry = new ConditionRegistry()
