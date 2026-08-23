/**
 * 数据路径常量——唯一集中地（2026-08-23 收敛审计）：
 * 此前 styles.toml / scene-dialogue / characters/named / talk-common glob 前缀 /
 * SELF_LOADED_DATA_DIRS 等散落 mod-parse / talk-common-system / mod-loader 多处，
 * 靠注释维持隐含一致性契约。现集中到 core（core 不认识具体插件，只描述路径形态）。
 */

/** B1 契约：插件自加载数据目录（跳过 pluginDefaultCache 驻留的目录） */
export const SELF_LOADED_DATA_DIRS = ['/talk-common/']

/** 插件默认层 glob：任何插件 data/default 下的 TOML（SELF_LOADED 除外） */
export const PLUGIN_DEFAULT_GLOB = '/src/plugins/*/data/default/**/*.toml'

/** 插件默认层 styles 精确路径（collectPluginDefaultStyles 的匹配形态） */
export const PLUGIN_DEFAULT_STYLES_RE =
  /^\/src\/plugins\/[^/]+\/data\/default\/talk\/styles\.toml$/

export function modTalkStylesPath(modName: string): string {
  return `/mods/${modName}/definitions/talk/styles.toml`
}

export function modSceneDialoguePath(modName: string): string {
  return `/mods/${modName}/definitions/scene-dialogue.toml`
}

export function modCharacterDialoguePath(modName: string): string {
  return `/mods/${modName}/definitions/character-dialogue.toml`
}

/** 角色专属口上/对话统一规范位置（2026-08-23 移除 dialogue/ 旧结构兼容） */
export function modNamedCharactersPrefix(modName: string): string {
  return `/mods/${modName}/characters/named/`
}

/** talk-common 插件默认层根（SELF_LOADED，插件自加载） */
export function talkCommonDefaultRoot(): string {
  return '/src/plugins/talk-common-system/data/default/talk-common/'
}

/** talk-common mod 覆盖层前缀 */
export function talkCommonModPrefix(modName: string): string {
  return `/mods/${modName}/definitions/talk-common/`
}