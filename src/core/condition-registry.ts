import { conditionEngine } from './condition-engine'

interface ConditionField {
  path: string
  type: string
  description: string
  operators: string
  source: string
}

class ConditionRegistry {
  private fields: ConditionField[] = []
  // 注释：关系系统 v2 数据（setRelationData 注入）——聚合路径参数校验用
  private relationTypes: Record<string, any> = {}
  private relationGroups: Record<string, string[]> = {}
  // 注释：内置基础字段（AGENTS §21）——固定存在
  private builtinFields: ConditionField[] = [
    { path: 'location.id', type: 'string', description: 'Current location ID', operators: '== !=', source: 'engine' },
    { path: 'location.type', type: 'string', description: 'Current location type', operators: '== !=', source: 'engine' },
    { path: 'location.tags', type: 'string[]', description: 'Current location tags', operators: '== !=', source: 'engine' },
    { path: 'location.parent', type: 'string|null', description: 'Parent location ID', operators: '== !=', source: 'engine' },
    { path: 'game.time.hour', type: 'number', description: 'Current hour (0-23)', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'game.time.day', type: 'number', description: 'Current day', operators: '> < >= <= == !=', source: 'engine' },
    { path: 'game.time.month', type: 'number', description: 'Current month', operators: '> < >= <= == !=', source: 'engine' },
    // 注释：当前模式（模式栈栈顶，B1 修复）——战斗门控条件 game.mode == 'combat' 取值源
    { path: 'game.mode', type: 'string', description: 'Current mode (mode stack top)', operators: '== !=', source: 'engine' },
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
    // 注释：关系聚合路径（关系系统 v2，2026-08-10）——跨种类查询，括号参数 = 类型列表
    // 或 group:组名（组在 relations.toml [groups] 段集中定义）；无括号 = 全部类型
    // 模板 {list} 通配带括号与不带括号两种写法（pathMatch 对含 { 段跳过比较）
    { path: 'character.{id}.relations.{other}.any({list})', type: 'boolean', description: 'Any relation of listed types exists (any sentiment)', operators: '== !=', source: 'engine' },
    { path: 'character.{id}.relations.{other}.any_positive({list})', type: 'boolean', description: 'Any relation of listed types is positive', operators: '== !=', source: 'engine' },
    { path: 'character.{id}.relations.{other}.any_negative({list})', type: 'boolean', description: 'Any relation of listed types is negative', operators: '== !=', source: 'engine' },
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

  // 注释：注入关系数据（关系系统 v2）——mod 加载后调用，聚合路径参数校验用
  // （类型名存在性 / group:组名存在性；数据未注入时聚合路径只查结构、不查参数）
  setRelationData(types: Record<string, any>, groups: Record<string, string[]>): void {
    this.relationTypes = types ?? {}
    this.relationGroups = groups ?? {}
  }

  getAllFields(): ConditionField[] {
    return [...this.builtinFields, ...this.structuralFields, ...this.fields]
  }

  validateField(path: string): boolean {
    const allFields = this.getAllFields()
    if (allFields.some(f => f.path === path)) return true
    const matched = allFields.some(f => f.path.includes('{') && pathMatch(f.path, path))
    if (!matched) return false
    // 注释：聚合路径参数校验（关系系统 v2）——any(类型列表/group:组名) 的参数必须存在
    // 数据未注入（relationTypes 为空）时只查结构，避免测试/早期环境误报
    const agg = extractAggregateArgs(path)
    if (agg && Object.keys(this.relationTypes).length > 0) {
      for (const item of agg.args) {
        if (item.startsWith('group:')) {
          const groupName = item.slice('group:'.length)
          if (!this.relationGroups[groupName]) return false
        } else if (!this.relationTypes[item]) {
          return false
        }
      }
    }
    return true
  }

  // 注释：校验一个条件表达式——提取所有字段路径并逐个 validateField；
  // premise(X) 命名引用逐参数校验（与 conditionEngine 注册表比对）
  // selected./target. 根先归一化为 character.{id}.（与实体解析语义一致）
  // 未知路径/未注册前提 → unknown（error 级由调用方处理）
  validateExpression(expr: string): { ok: boolean; unknown: string[] } {
    const paths = extractFieldPaths(expr).map(normalizeRootPath)
    const unknown = paths.filter((p: string) => !this.validateField(p))
    const registered = new Set(conditionEngine.getRegisteredPremiseIds())
    for (const premiseId of extractPremiseRefs(expr)) {
      if (!registered.has(premiseId.toLowerCase())) {
        unknown.push(`premise:${premiseId}`)
      }
    }
    return { ok: unknown.length === 0, unknown }
  }

  // 注释：单前提校验（premises 数组项）——未注册 → false
  validatePremise(id: string): boolean {
    return conditionEngine.getRegisteredPremiseIds().includes(id.toLowerCase())
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

// 注释：提取条件表达式中的 premise(X) 命名引用（premise 参数不被当作字段路径提取）
const PREMISE_RE = /premise\(([^)]*)\)/g
function extractPremiseRefs(expr: string): string[] {
  const out: string[] = []
  const stripped = expr.replace(STRING_RE, '')
  let m: RegExpExecArray | null
  PREMISE_RE.lastIndex = 0
  while ((m = PREMISE_RE.exec(stripped)) !== null) {
    const id = m[1].trim()
    if (id) out.push(id)
  }
  return out
}

// 注释：从条件表达式中提取字段路径（location.tags.has_x / player.气血 / selected.xxx / target.xxx /
// 插件注册的自定义根（如 combat.in_progress）等）
// 做法：去掉字符串字面量 → 按运算符/括号切 token → 收集含 '.' 且首字符为字母的 token
// 不做根白名单过滤——插件自定义根字段直接走 validateField 精确匹配
const STRING_RE = /"[^"]*"|'[^']*'/g
const TOKEN_SPLIT_RE = /&&|\|\||[()!<>=]+|\s+/
// 聚合路径段（关系系统 v2）：any(恩人,有恩) / any_positive(group:亲属)——括号与参数需保护，
// 否则被 TOKEN_SPLIT_RE 的括号切分切碎
const AGG_SEG_RE = /(any|any_positive|any_negative)\([^)]*\)/g

/** 提取聚合路径段的参数列表（如 any(恩人,有恩) → ['恩人','有恩']）；非聚合段 → null */
function extractAggregateArgs(path: string): { args: string[] } | null {
  const m = path.match(/(?:^|\.)(any|any_positive|any_negative)\(([^)]*)\)/)
  if (!m) return null
  const raw = m[2].trim()
  if (!raw) return { args: [] }
  return { args: raw.split(',').map(s => s.trim()).filter(Boolean) }
}

function extractFieldPaths(expr: string): string[] {
  const stripped = expr.replace(STRING_RE, '')
  // 保护聚合参数段（any(恩人,有恩)）——占位符避免括号切分
  const placeholders: string[] = []
  const protectedStr = stripped.replace(AGG_SEG_RE, (m) => {
    placeholders.push(m)
    return `\u0001${placeholders.length - 1}\u0001`
  })
  const tokens = protectedStr.split(TOKEN_SPLIT_RE).map(t => t.trim()).filter(Boolean)
  const paths: string[] = []
  for (const token of tokens) {
    if (!token.includes('.')) continue
    // 注释：首字符须为字母（数字/负号字面量如 0.5、-5 不是字段路径）
    if (!/[A-Za-z]/.test(token[0])) continue
    const restored = token.replace(/\u0001(\d+)\u0001/g, (_m, i) => placeholders[Number(i)] ?? '')
    if (!paths.includes(restored)) paths.push(restored)
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
