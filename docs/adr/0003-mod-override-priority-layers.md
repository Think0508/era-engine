# 0003 — Mod data override: three-layer ID-based priority

Data in era-engine can come from three layers. When the same ID appears in multiple layers, the highest-priority layer wins. Same-layer ID collisions are a load-time error.

## Priority layers

| Layer | Location | Example | Priority |
|-------|----------|---------|----------|
| 1 (lowest) | `src/plugins/*/data/default/` | talk-common default body text | 低 |
| 2 | `mods/[mod]/plugins/*/data/` | mod plugin provides combat descriptions | 中 |
| 3 (highest) | `mods/[mod]/definitions/` | mod author's final attribute values | 高 |

## Merge rules

All data types follow the same set of rules regardless of which system owns them:

| Type | Rule |
|------|------|
| Basic (number/string/bool) | Higher layer overwrites lower |
| Object (key-value map) | Deep merge: higher-layer keys overwrite, lower-layer unique keys preserve |
| Object array (with `id` field) | ID-matched replacement: same ID → higher replaces lower; new ID → appended |
| Primitive array (tags, strings) | Append + deduplicate: higher-layer items appended after lower, duplicates removed keeping higher's position |
| `= null` | Removes the field from merged result entirely |

## Cross-layer vs same-layer

- Cross-layer same ID → expected override (no warning)
- Same-layer same ID → **load-time error** with file + line + conflicting sources

## Implicit path matching

Layer 2 files mirror Layer 1's directory structure under `data/`. The engine
matches by relative path after `data/` — not by file path or glob pattern.
Layer 3 (`definitions/`) does not mirror anything; its files are loaded as-is
and matched by the ID they declare in their content.

This means a `data/talk-common/body_part/breasts_s.toml` in a mod plugin
automatically overrides the same relative path in `talk-common-system`'s
`data/default/`.

## Why not file-path-based or declarative override?

Alternatives considered:
- **Declarative override** (`plugin.toml` lists which namespaces to override): more explicit, but burdens the mod plugin author with declarations when the intent is already clear from the file structure.
- **File-path-based**: simple but creates debugging mystery paths. ID matching removes path coupling.

## Consequences

- Plugin authors can safely add new `data/default/` files to their plugins without fear of breaking mods (Layer 3 always wins).
- Same-layer collision errors catch accidental ID reuse early.
- The model extends naturally: adding Layer 0 (engine defaults) or Layer 4 (user configuration) later slots in without changing the rules.
