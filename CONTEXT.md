# era-engine

A text MUD game engine with strict separation between engine, gameplay plugins, and content mods.

## Language

**Entity**:
A game object stored in the core entity system, addressed by type + id. Characters, items, locations, and definitions are all entities of different types. The entity system supports secondary indexing on arbitrary fields for efficient reverse lookups (e.g. all characters at a location).
_Avoid_: Object, record

**Entity type**:
A classification key for entities (e.g. `attribute_def`, `talent_def`, `character`, `location`). The core provides typed storage — `getByType(type, id)` — without knowing any type's semantics. The meaning of each type is consumed by the layer above.
_Avoid_: Category, namespace

**Attribute definition**:
Metadata describing a single game attribute, parsed from `definitions/attributes.toml`. Fields: type (number/string/boolean), default, category (grouping key), compute (optional script path), display (boolean, controls whether it appears in the generic character status viewer), display_group (category label in the viewer, used for clustering related attributes in Status/Parameter/Look sections), daily_reset (optional boolean, Parameter-specific — when true the attribute resets to its default value when the player wakes up via the `game:wake_up` event). Stored in the attribute-registry (not entity-system).
_Avoid_: Property, field, entity-system storage, treating daily_reset as a plugin-only concept

**Attribute binding**:
The mapping from a plugin's generic attribute name (e.g. `hp`) to the mod's concrete attribute (e.g. `气血`), declared in `bindings.toml`. Required bindings block mod loading if missing OR if the bound attribute's type doesn't match the plugin's declared type (load-time error with file + line + expected vs actual type). Optional bindings only emit a warning for missing or type-mismatched cases, and the plugin must handle the unbound case gracefully. At startup, the engine auto-generates a Binding Handbook listing each enabled plugin's required and optional attributes with type and description — the mod author's reference for writing bindings.toml.
_Avoid_: Attribute mapping, attribute alias, hardcoded docs, silent type mismatch

**Condition path**:
A dotted path expression used in TOML `condition` fields (e.g. `player.气血 < 30`, `game.time.hour >= 18`). Paths are registered as patterns rather than expanded per-entity — `character.{角色ID}.{属性名}` covers all characters without enumerating each one. The condition dictionary validates the attribute name's existence at mod load time; runtime value resolution reads directly from the entity system, bypassing the binding layer. Array contains uses dot-path syntax: `location.tags.has_gather` resolves `location.tags` (an array), then checks if `has_gather` is in the array, returning true/false. Arrays of objects match on the `id` field: `character.{id}.status.中毒` checks if any status effect has `id == "中毒"` (returns boolean); `character.{id}.status.中毒.stack` finds the matching element and returns its `stack` value.
_Avoid_: contains operator, ... syntax, function calls in conditions

**Developer handbook**:
An auto-generated reference set, rebuilt at startup, covering every registry in the engine: condition handbook (condition paths), binding handbook (required/optional attribute bindings), effect handbook (registered effect types with params and source), event handbook (all available events with payload and source), command handbook (registered commands with ID/label/modes/source), mode handbook (all registered mode IDs), slot handbook (UI slot names and locations per layout), attribute handbook (all attribute definitions with display flag). Handbooks are used internally for validation (a TOML reference to an unknown effect/event/command produces a load-time error) and can be exported to markdown via `npm run generate-handbooks`.
_Avoid_: In-game handbook browser, runtime handbook UI

**Active mod**:
The single mod selected by `era-engine.config.toml`'s `active_mod` field, or chosen from the mod selection screen at startup. Only one mod runs at a time; switching requires restart. The mod's `meta.toml` also declares `player_character` (the fixed entity ID of the character the player controls — used by character creation to create the player entity) and optionally `starting_location` (where the player begins after character creation).
_Avoid_: Current mod, enabled mod, dynamic player ID

**Status**:
A character's persistent or semi-persistent status display bar. The default status bars shown in the main UI are 体力 (HP), 气力 (MP/energy), and 精力 (stamina), plus emotion and rationality indicators. Mods extend the status area by declaring attributes with `display = true` in `definitions/attributes.toml`. Status values are not automatically reset each day — reset rules, if any, are defined by the mod or plugin.
_Avoid_: Confusing status with Parameter, hardcoding status bar names in engine code

**Parameter**:
A set of temporary physical and emotional numeric values that reset daily by default (similar to eraTW's Palam system), used for per-interaction calculations such as pleasure, obedience, arousal, and shame. Parameters are declared in `definitions/attributes.toml` with `daily_reset = true` and are displayed in the Parameter panel grouped by `display_group`. The standard set includes 9 pleasure sensations (皮肤/胸部/阴蒂/阴茎/阴道/后穴/子宫/口喉/心理) and 13 behavioral params (润滑/习得/恭顺/好意/欲情/快乐/先导/屈服/羞耻/苦痛/恐怖/抑郁/反感). Pleasure params use `level_thresholds` for 10-level grading. Parameters are mod-defined — adding a new parameter just means adding it to attributes.toml with `daily_reset = true`. The ParameterSection reads dynamically from attribute definitions at runtime.
_Avoid_: Hardcoding parameter keys in ParameterSection, treating parameters as permanent attributes, using erArk-specific terms like 兽部/尿道

**Player alias**:
The `player` prefix in condition paths (e.g. `player.气血`) is a fixed alias that resolves to the entity whose ID matches `meta.toml`'s `player_character`. `player.xxx` and `character.{player_character}.xxx` are equivalent — `player` is the concise form. The engine sets up this alias at startup; mods and plugins use `player.xxx` in conditions and `target = "player"` in effects.
_Avoid_: Hardcoding player entity ID in conditions, separate player query API

**Character creation**:
An extended sequence run before the game enters IDLE, fully defined by the mod in TOML. Steps are executed in order and can be: built-in types (dialogue/choose/input/image) provided by the engine, or custom types registered by plugins (e.g. roll_stats, choose_wand). Each step collects data/choices that are applied to the player character entity. The sequence completes when all steps are processed; the game then enters IDLE with the finalized character.
_Avoid_: Hardcoded creation screen, engine-defined character sheet layout, single-path creation

**Initialization sequence**:
The startup process: (1) read config → (2) discover all plugins (scan src/plugins/ + mods/[mod]/plugins/) → (3) all plugins onLoad (API registration, event listeners) → (4) check dependencies (full dep tree, semver) → (5) load mod definitions + resolve templates → (6) load bindings.toml → (7) register condition fields → (8) load content data in dependency order (plugins declare `data_dependencies.provides` and `data_dependencies.depends_on` in plugin.toml; engine topo-sorts; MVP hardcodes: maps → items → characters → quests → NPC spawns; two-pass: load all entities then validate cross-references) → (9) onEnable for plugins in the dependency tree only → (10) Vue mount.
_Avoid_: Checking deps before discovering mod plugins, onEnable for unused plugins

**Plugin lifecycle**:
Two-phase initialization. `onLoad` is the declaration phase (declare required attributes, condition fields, event listeners) — runs before mod data is loaded. `onEnable` is the activation phase (register APIs, UI slots, start gameplay logic) — runs after all mod data is loaded and validated.
_Avoid_: Single-phase init, overlapping phases

**Computed attribute**:
An attribute whose value is calculated by a script rather than stored. The compute script is re-executed on every read; the result is never persisted. This guarantees consistency when the mod updates the compute logic.
_Avoid_: Derived attribute, virtual attribute

**Cascading disable**:
When a plugin fails at onEnable, all plugins that depend on it (via extends or dependencies) are also disabled rather than left in a broken state with missing parent APIs.
_Avoid_: Partial failure, silent degradation

**Event chain**:
Handlers listening to an event may emit further events. The event bus detects same-tick cycles (same event → same handler twice) and breaks the chain with an error report rather than infinite-looping. Handlers have priority values (lower number = runs first, default 0). Handlers may be async (return Promises); the bus awaits each handler in priority order before running the next — sequential, not parallel. If a handler throws (sync or async), the error is caught, logged via error-reporter, and does NOT block subsequent handlers. Wildcard subscriptions are supported: `combat:*` matches all events under the `combat` domain. `*` alone matches all events. Slow operations (e.g. LLM calls) should not be event handlers — use a UI rendering pipeline instead.
_Avoid_: Event loop, unbounded chaining, priority-free execution, parallel handler execution, blocking on slow handlers

**Command ID**:
A stable string identifier for a registered command (e.g. `talk`, `move`, `gather_herbs`), declared by the plugin or mod in `plugin.toml`. Command IDs are used for automation, macros, and script references because they remain stable across UI contexts and plugin updates. They are distinct from numeric shortcuts shown in the UI.
_Avoid_: Referring to commands only by display number in scripts, unstable numeric command references

**Numeric shortcut**:
A temporary number displayed next to a command label in the command bar (e.g. `交谈 [12]`), assigned dynamically at render time based on the currently visible commands. Numeric shortcuts enable keyboard and on-screen numpad input. They are not guaranteed to be stable across mode switches, filter changes, or plugin updates; automation uses Command IDs instead.
_Avoid_: Treating numeric shortcuts as persistent identifiers, expecting the same command to keep the same number in all contexts

**UI slot**:
A named extension point in the UI where plugins and mods register custom components. Managed by the SlotRegistry (ui layer) for non-command visual extensions (e.g. `location-panel` for custom location info, `status-extra` for extra status rows, `look-extra` for custom look content, `daily-menu` for daily menu items, `system-panel` for system panel tabs, `character-panel-tab` for character panel tabs). Commands do NOT use SlotRegistry — they use CommandRegistry. Slot items have id, component, priority, and optional condition; items are sorted by priority (ascending) and filtered by condition at render time.
_Avoid_: Using slots for commands, single global slot, slot without condition support

**Display group**:
A grouping key on attribute definitions (`display_group` field in `attributes.toml`) that clusters related attributes in the UI. Used by Status, Parameter, and Look sections. Groups can be folded (nested CollapsibleSection with `foldKey='{section}-{group}'`). Group titles can be toggled on/off in options (default off — flat display, but folding still works by group). Groups are ordered by first appearance in attributes.toml.
_Avoid_: Hardcoded groups, group ordering by separate config, display_group as UI-only concept without data backing

**Display mode**:
A global UI setting controlling how new narrative log entries appear: `'scroll'` (default, era-style — new content appends to bottom, auto-scroll) or `'clear'` (clear log then show new content). Stored in ui-store (localStorage). Mods can override via `ctx.api.call('engine', 'setDisplayMode', mode)`. Individual log entries are unaware of DisplayMode — the NarrativeLog component applies the strategy uniformly.
_Avoid_: Per-entry display mode, hardcoded scroll-only

**Equipment slot**:
A body-part slot defined in `definitions/equipment.toml` (e.g. upper_body, lower_body, accessory). Each slot has id, name, and category. Character entities store current equipment in an `equipment` field mapping slot id to item id. Unlike era's cosmetic-only clothing, equipment in era-engine has real numeric significance (attack/defense bonuses) — read by combat and status systems. Phase 5 only displays equipment; equipping/unequipping is handled by inventory-system (Phase 9).
_Avoid_: Cosmetic-only clothing, equipment without stats, engine-hardcoded slot names

**Command system**:
Hybrid interaction model with two-level visibility control. Mode level (coarse): commands are tagged with one or more `modes` (e.g. `exploration`, `combat`, `h_scene`, `dialogue`). When the game enters a mode, only commands tagged for that mode appear in the command bar. Condition level (fine): each command has a per-command `condition` expression checked against game state and selected character. Both levels are extensible — plugins register new modes and new commands. Commands can also be favorited (fixed to top), recently used highlighted, and filtered by text search. The command bar groups by source (location/character/global) with collapsible sections. Commands are declared in plugin.toml `[ui]` section as `location_commands` / `character_commands` / `main_menu` arrays. Each command has: `id` (stable string), `label`, `modes` (required), `condition` (optional), `priority` (optional, default 0), `effects` (array — for data-driven commands) or `handler` (JS script path — for complex commands). Grouping (location/character/global) affects UI display only, not condition scope. The `...` tag-check syntax is replaced by dot-path: `location.tags.has_gather == true`.
_Avoid_: Single flat command list, hardcoded mode switching, mode-only without per-command conditions, commands without effects, ... syntax

**Execution state**:
The game alternates between IDLE and EXECUTING. IDLE: the player can browse NPCs, check menus, and pick an action from the command bar. EXECUTING: an action is running (movement, dialogue, combat turn, item use) — the command bar becomes hidden, the full-screen text layout activates, and output streams to the narrative log. When execution finishes, control returns to IDLE. EXECUTING does NOT nest — the current execution must finish or abort before a new one begins. Modes are a higher-level concept: combat spans multiple execution cycles but remains in `combat` mode so the command bar always shows combat actions during IDLE sub-states.
_Avoid_: Always-visible command bar, mode confusion with execution state, dialogue as a special case, nested EXECUTING

**Mode stack**:
Modes are managed as a stack. Entering a mode pushes it; exiting pops it. Example: exploration → (talk) → dialogue → (dialogue ends) → exploration. Or: exploration → (fight) → combat → (talk during combat) → dialogue → (dialogue ends) → combat → (combat ends) → exploration. When a mode is interrupted (e.g. dialogue interrupted by combat), the interrupted mode is ABORTED, not paused — it does not resume after the interrupting mode exits. Mode transitions are triggered by: (a) effects (`{type = "enter_mode", params = {mode = "dialogue"}}`), (b) plugin API calls (`ctx.api.call('engine', 'enterMode', id)` / `exitMode()`). The system that enters a mode is responsible for calling exitMode when done.
_Avoid_: Paused/resumed modes, unbounded mode stack, mode without owner

**Full-screen text layout**:
A layout activated during the EXECUTING state. Shows only the narrative log (no NPC bar, no command bar, no location panel). When execution completes and the game returns to IDLE, the appropriate mode-specific layout is restored. Layout switching is driven by two factors: (state × mode). Exploration mode in IDLE → exploration layout. Combat mode in IDLE → combat layout (combatant status + log + combat commands). Any mode in EXECUTING → full-screen text layout. Layouts are registered via the same slot system and are switchable.
_Avoid_: Always-visible game UI, hardcoded show/hide toggles per element, layout tied to state only (misses mode)

**Save slots**:
Unlimited manual save slots + autosave. Autosave triggers on key events (entering new location, before combat, after significant state changes) — only during IDLE, never mid-EXECUTING. Saves use Dexie.js in IndexedDB with per-mod namespace isolation. Entity types are classified as saveable or non-saveable at the engine level (not per-entity): characters, quests, and game state are always saved (even if originally loaded from TOML); locations and definitions are never saved (always reloaded from TOML). On load, saveable types are restored from save; non-saveable types are re-read from TOML.
_Avoid_: Fixed save slots, no autosave, per-entity save/don't-save decisions, autosave during EXECUTING

**Time cost**:
The duration of a game action, measured in minutes. Base time is defined per action (move: exit's time_cost, skill: skill's time_cost). Modifiers apply as `final = (base + sum(additive)) * product(multiplicative)` — additive modifiers (e.g. fatigue +15) stack via sum, multiplicative modifiers (e.g. martial arts ×0.5) stack via product. All modifiers are applied additively first, then multiplicatively.
_Avoid_: Flat time, unstacked modifiers

**UI slot refresh**:
All UI slot conditions are re-evaluated on every game state change (responsive refresh). No per-slot event subscription mapping needed. With under a dozen core slots and trivial conditions, the computational cost is negligible.
_Avoid_: Selective refresh, manual refresh

**Character load consistency**:
Save-authoritative model. All characters (named/roster/NPC) are fully serialized on save and fully restored from save on load. Templates provide initial values only for NEW game starts (or when a character is first encountered). On subsequent loads, the save file is the single source of truth. Migration scripts handle format changes when the mod version changes.
_Avoid_: Template re-reading, partial save, diff-based overlay

**Frame tick**:
Core provides a single `registerTick(handler, priority)` interface wrapping `requestAnimationFrame`. Each handler self-regulates its duration against a budget. A centralized budget scheduler can be added later when multiple consumers emerge.
_Avoid_: Centralized scheduler (premature), unmonitored handlers

**Map navigation**:
Two-layer movement model. Vertical movement (parent↔child) is automatic — all children are reachable from their parent, and the reverse exit is auto-generated. Horizontal movement (cross-region via `exits`) is manually declared, may carry a `time_cost`, and also auto-generates a reverse exit.
_Avoid_: Flat exit model, manual-only navigation

**Effect**:
A composable action unit with uniform structure `{type, params}`. Types are registered by plugins via code (`effectSystem.registerType`). The effect-system plugin provides a core set of generic types in its onLoad: `set_attribute`, `modify_attribute` (both go through the binding system for attributes defined in `attributes.toml`), `set_field` (directly modifies entity fields like abilities/talents/factions/status_effects — does NOT go through bindings), `add_item`, `remove_item`, `modify_relation`, `advance_time`, `narrative_output`, `enter_mode`, `exit_mode`. Domain-specific types (e.g. `damage`, `teach_kungfu`, `apply_status`, `start_conversation`, `start_quest`, `start_combat`) are registered by the owning plugin. Execution context carries `sourceId`, `targetId`, and optional `extraContext`. Effects within a group execute in order; `depends_on` means "only run if the named effect succeeded." Unknown effect types produce a load-time warning and are silently skipped at runtime (non-blocking). `enter_mode` pushes a mode onto the mode stack and emits `game:mode_changed`; it does not transfer control — the owning system picks up from IDLE by listening for the event.
_Avoid_: Hardcoded effect functions, type-specific execution paths, blocking on missing types, orphaned generic types (no owner), enter_mode as control transfer, using set_attribute for non-attribute fields

**Item**:
An entity of type `item_def` with four mandatory fields: id, name, type, stackable. Each type may define additional fields (e.g. weapons have attack_bonus, consumables have effects). Inventory stores items as `{itemId, count}` pairs with optional `attrs` for per-stack metadata.
_Avoid_: Per-instance identity for all items, flat universal schema

**Talent**:
A character trait defined in `definitions/talents.toml`. Fields: `name`, `description`, `category` (innate/learned), optional `effects` (passive effects when active), optional `condition` (only active when met). Stored on character entity as a map: `talents = { 剑骨 = 1 }`. Accessed in conditions via `character.{id}.talents.{talentId}` (returns level or false if not present). Modified via `set_field` effect. No dedicated talent-system plugin — talents are data consumed by other systems (conditions, combat, dialogue).
_Avoid_: Talent as an attribute, talent system plugin (unnecessary for MVP)

**Ability**:
A character skill defined in `definitions/abilities.toml`. Fields: `name`, `description`, `type` (active/passive), `max_level` (0 = levelless ability), `tags` (array of string labels for plugin queries, e.g. `["combat_active", "sword"]`), `effects` (active: per-use effects / passive: always-on effects), optional `time_cost` (minutes, active only), optional `condition` (usage condition, active only), optional `unlocks` (array of `{at_level, ability, talent?}` for skill-tree progression). Stored on character entity as a map: `abilities = { 华山剑法 = 3 }`. Accessed in conditions via `character.{id}.abilities.{abilityId}` (returns level). Modified via `set_field` effect. Plugins query abilities by tag via `ctx.api.call('engine', 'abilities.getByTag', charId, tag)` returning all matching abilities, or `hasTag` for boolean check. Plugins declare expected tags in `plugin.toml` `required_ability_tags` / `optional_ability_tags`. Tags are free-form strings — the engine provides the mechanism (tags field + query API), plugins provide the semantics (which tags they expect), mods provide the content (which abilities get which tags). Same pattern as location tags.
_Avoid_: Ability as an attribute, ability system plugin (unnecessary for MVP), ability binding (wrong granularity — abilities are one-to-many, not one-to-one), engine-hardcoded tag names

**Faction**:
An organization defined in `definitions/factions.toml`. Fields: `name`, `description`, `type` (sect/clan/gang/government), `ranks` (array of rank names, ordered high to low). Stored on character entity as a map: `factions = { 华山派 = "弟子" }`. Accessed in conditions via `character.{id}.factions.{factionId}` (returns rank string or false if not a member). Modified via `set_field` effect. No dedicated faction-system plugin — factions are labels for conditions and grouping.
_Avoid_: Faction as an attribute, faction system plugin (unnecessary for MVP)

**Dialogue**:
The rendering pipeline for character speech and story text. Accepts `emitLine(text, speaker?, displayMode?)` from any system. Dialogue content is tiered: (1) plain text + `{var}` interpolation, (2) TOML conditions + random line selection, (3) JS templates, (4) full JS scripts. Only tiers 1-2 ship in the MVP. Two data structures feed the pipeline: reactive lines (scene-triggered, non-interactive) and conversations (interactive, branching).
_Avoid_: Dialogue as a stand-alone feature, sequencing logic in the dialogue system

**Reactive line**:
A short, non-interactive character speech triggered by a game event (e.g. greeting on encounter, reaction to taking damage). Defined in `dialogue.toml` as `[[lines]]` entries with `scene`, `condition`, and `text` fields. Multiple lines matching the same scene with satisfied conditions → random selection. No branching, no player choices. Output goes to the narrative log.
_Avoid_: Branching dialogue, player interaction, conversation node

**Conversation**:
An interactive, branching dialogue tree with player choices. Defined as one TOML file per conversation under a character's `conversations/` directory. Contains `[[nodes]]` with `id`, `lines`, `choices`, `effects`, `condition`, and `next` fields. Triggered by the `start_conversation` effect (registered by dialogue-system plugin). Runs in dialogue mode. Ends when a terminal node (no choices, no next) or an `exit_mode` effect is reached. When the player uses a "talk" command, the dialogue system auto-selects the first conversation whose condition is met.
_Avoid_: Reactive line, non-branching speech, hardcoded conversation selection

**Dialogue node**:
A single point in a conversation tree. Fields: `id` (unique within conversation), `lines` (array of text strings to display), `choices` (array of `{text, next, condition?}` — player-selectable options linking to other node ids; `condition` controls visibility of the choice), `effects` (optional — effects executed when node is reached), `next` (shortcut for single-option auto-advance to the next node id). A node with no choices and no `next` is a terminal node. Conditions live on edges (choices) and the conversation root, not on nodes — if you don't want a node reachable, gate the choices that lead to it.
_Avoid_: Scene, reactive line, node-level condition

**Narrative log**:
The unified scrolling text display that shows all game events in chronological order. Any system writes to it via `narrativeLog.write(text, type, source?)`. Entries are displayed together regardless of type. Old entries auto-evict (configurable limit, default 1000). The log is NOT persisted in saves — it's a session-only record.
_Avoid_: Per-system log panels, persisted log, event-as-log

**Log entry**:
A single line in the narrative log. Fields: `text` (the content), `type` (extensible category key, e.g. `combat`, `dialogue`, `system`, `map`, `choice`, `dialogue_choice`), `source` (plugin ID), `timestamp` (game time when written), `interactive` (optional boolean — marks entries that accept player interaction, e.g. map views and dialogue choices), `consumed` (optional boolean — set true when an interactive entry has been acted upon, preventing further interaction), `payload` (optional any — type-specific data, e.g. choices array for `choice` type, location data for `map` type). Default types: system, combat, dialogue, movement, item, quest, skill. Plugins register custom types and may provide custom UI renderers for them. UI renders all types in a single scrollable panel but can style each type differently (color, icon, indentation). Interactive entries render as interactive components (MapView, choice list) instead of plain text.
_Avoid_: Fixed type enum, per-type display panels, interactive entries without consumed state

**Combat turn**:
Combat-base emits standard events (`combat:start`, `combat:turn`, `combat:end`). The `combat:turn` payload includes `actor`, `action`, `target`, `effects[]`, and `before`/`after` state snapshots of the target. Action order is determined by participant speed.
_Avoid_: Fixed player/enemy alternating turns

**Quest step type**:
Types supported in MVP: `dialogue` (delegate to dialogue-system), `combat` (delegate to combat-system), `objective` (track kill counts, item counts, etc. internally), `reward` (execute effects), `spawn` (create character/item), `condition` (check game state, branch via `next` if met or `else` if not met; `else` is optional — if omitted, the quest waits at this step until the condition becomes true), `goto` (explicit jump to another step by id). All types support the branching mechanism via `next`, `choices[].next`, `on_win`/`on_lose`.

**Quest**:
A TOML file defining a multi-step mission. Top-level fields: `id`, `title`, `description`, `type` ("main" or "side" — classification label only), `prerequisites` (optional — list of quest IDs that must be completed first), `auto_start_condition` (optional — condition that auto-starts the quest when met). Steps are `[[steps]]` entries with `id`, `type`, type-specific fields, and `next`/`on_win`/`on_lose`/`else` for branching. Quests start either via `auto_start_condition` or via the `start_quest` effect. Quest state (current step, completed steps, objective progress) is stored in the quest entity and saved with the game.

**Quest objective**:
A sub-structure of `objective` step type, defining what the player must do to advance. Format: `{type, ...params}`. Core types registered by quest-system plugin: `reach_location` (listens `location:enter`), `kill_count` (listens `combat:end`), `collect_items` (listens `item:added`), `talk_to` (listens `dialogue:end`). When the objective condition is met, the step auto-advances to `next`. Plugins can register additional objective types via the quest-system API.
_Avoid_: Hardcoded objective types, polling-based objective checking

**Sandbox**:
JavaScript execution environment using `new Function()` with a frozen read-only context object. The context exposes the full game state snapshot (player, time, location, getEntity, getBinding). Script timeout protection (5s) is implemented via acorn AST instrumentation — the parser inserts time-check statements into loop bodies before evaluation.
_Avoid_: eval(), unguarded Function, no timeout

**Character behavior**:
Layered position calculation for characters. Layer 1 (MVP): `home_locations` weighted (auto-normalized) + `time_rules` + `activity` probability (0=never moves, 0.5=50% chance per hour trigger). Layer 2: following relationships. Layer 3: group/social network effects. Position is computed on demand when the player enters a location — iterate all characters, filter by home_locations matching the target area. Secondary indexes are not needed for MVP (600-char traversal is sub-millisecond). AI movement runs on every `game:hour_changed` for ALL characters (not just current+adjacent), with `activity < 0.3`降频 (every 5 hours via `hour % 5 == 0`). Movement decision: time_rules first (hour_range match → weighted random target), then home_locations re-weighted, no home_locations → no move.
_Avoid_: Full-world simulation, frame-driven AI movement, premature indexing, only simulating current+adjacent characters

**Scene**:
A free-form string identifying a reactive-line trigger context (e.g. `greet`, `hurt`, `rest`, `move`, `enter`). Scenes are not predefined by the engine — mods and plugins define them. Other systems call `dialogue.triggerScene(scene, charId?)` after performing actions; dialogue-system matches scene + condition against reactive line definitions and outputs to the narrative log. Scene-based口上 = the engine's演出 pipeline — nearly every command triggers a scene (rest→rest scene, move→move scene, combat hit→hurt scene). If no matching lines exist for a scene, output is silently skipped (not every scene has口上).
_Avoid_: Hardcoded scene list,狭义 dialogue (口上 = 演出 not just conversation), requiring every scene to have lines

**Reactive line priority**:
Three-tier口上 system: (1) scene通用口上 (`definitions/scene-dialogue.toml`) — location/environment descriptions, not bound to a character; (2) character通用口上 (`definitions/character-dialogue.toml`) — fallback default lines for characters without专属口上; (3) character专属口上 (`characters/dialogue/{charId}/dialogue.toml`) — custom lines for specific characters. When triggerScene is called with a charId: character专属 > character通用 (fallback), scene通用 outputs independently (both scene + character lines output if both match). Without charId: only scene通用 is checked. All character tiers (named/roster/npc) can have专属口上.
_Avoid_: Assuming only named characters can have专属口上, scene vs character as either/or (both output)

**Text formatting**:
A Markdown-subset + extension syntax supported in narrative log entries and口上 text, parsed by the NarrativeLog renderer. Supported: `**bold**`, `*italic*`, `~~strikethrough~~`, `||spoiler||` (black box, click to reveal like decryption), `{{color:#RRGGBB text}}` / `{{color:#AARRGGBB text}}` (hex RGB with optional alpha transparency), `{{font:fontname text}}` (custom font), `{{size:large text}}` (font size). Enables rich演出 in text-based gameplay.
_Avoid_: Full Markdown, HTML injection, era-style @b@ tags

**Migration**:
A version compatibility script applied to save data when the mod version changes. Each migration file covers one version step (1.0→2.0). On load, the engine compares the save's mod version with the current mod version and executes all missing migration steps in order. Migrations run ON THE IN-MEMORY COPY of the save data, never on the original save file. If any migration fails, loading is aborted and the save file remains intact (safe retry). Supported operations: rename fields, set defaults, run script transforms (sandbox). Persisting the migrated data only happens when the player next saves.
_Avoid_: Live migration on the save file, partial migration with silent skip, template-based recovery instead of migration

**Status effect**:
A persistent condition on a character (e.g. poison, drunk, buff) defined in `definitions/status-effects.toml`. Managed by the independent `status-system` plugin (not combat-base) because status effects interact with many systems beyond combat — dialogue (drunk → more 好感度 gain), commands (春药 → unlock H commands), conditions (中毒 → threat success bonus). Fields: `name`, `description`, `category` (debuff/buff/neutral), `duration` (minutes, -1 = permanent), `tick_interval` (minutes between tick_effects), `stackable`, `max_stack`, `tick_effects` (effects executed on each tick), `on_apply_effects`, `on_remove_effects`. Applied via the `apply_status` effect type (registered by status-system). Removed via `remove_status` effect type or natural duration expiry. Tick on `game:hour_changed` events. Runtime state on character entity: `{id, remaining_duration, stack, last_tick_game_time}` — saved with the character. Status-system registers condition fields: `character.{id}.status.{statusId}` (boolean), `character.{id}.status.{statusId}.stack` (number), `character.{id}.status.{statusId}.remaining` (number). combat-base depends on status-system for combat buffs/debuffs.
_Avoid_: Status effects tied to combat, status without condition integration, hardcoded status types

**Status stacking**:
When `apply_status` is applied to a character who already has that status: duration is ALWAYS refreshed to the new duration (reset the timer); stack increments by 1 if `stackable=true` and current stack < `max_stack`; stack stays unchanged if `stackable=false` or already at `max_stack`. Summary: refresh duration + increment stack up to max_stack. This is a single rule with no case-by-case logic — mod authors remember "re-applying always refreshes the timer and adds a stack if possible."
_Avoid_: Complex per-status stacking rules, ignore-on-max without refresh, duration preservation

**Status tick scaling**:
When tick_effects execute on a tick, numeric effects (modify_attribute, etc.) have their `value` multiplied by current `stack`. Non-numeric effects (apply_status, narrative_output, etc.) are repeated `stack` times. This scaling is performed by status-system internally — mod authors write tick_effects once, the engine multiplies by stack. A stack=3 poison with `tick_effects = [{type = "modify_attribute", params = {attr = "气血", value = -5}}]` deals -15 per tick.
_Avoid_: Mod authors writing per-stack effects, tick without scaling, scaling on non-numeric effects without repetition

**Effect target**:
A field on every effect specifying who the effect acts upon. Valid values: `self` (the source character), `selected` (the UI-selected character, default if omitted), `player` (the player character), `all_enemies` (all hostile characters in combat context). combat-base registers additional values: `all_allies`, `target` (current combat target). Non-combat contexts where combat-only targets are invalid → effect silently skipped + warning. If `selected` is null → effect silently skipped + warning.
_Avoid_: Hardcoding target in effect params without field, unresolvable target silently doing nothing without warning

**Selected**:
A UI state (Pinia-managed, not saved) indicating which character the player has clicked on for interaction. Set when the player clicks an NPC; cleared when leaving a location or closing the NPC panel. In combat, set to the current combat target. Referenced in conditions as the `selected` prefix: `selected.好感度 >= 60` resolves to the selected character's 好感度. If no character is selected, `selected.xxx` condition paths return default values (see Condition default values) and `target = "selected"` effects are silently skipped + warning.
_Avoid_: Persisting selected in saves, selected as a real entity field, selected persisting across location changes

**Condition default values**:
When a condition path resolves to a non-existent field, the condition engine returns a default value instead of throwing: numbers → 0, strings → "" (empty), booleans → false, array-contains checks → false, non-existent character → same defaults. Relations use the `default` value from `definitions/relations.toml` (e.g. 好感度 default = 30). The condition engine NEVER throws on missing paths — this allows one condition expression to work across characters with different attribute sets. Mods needing to distinguish "missing" from "zero" use `condition_script` (JS hooks can check null).
_Avoid_: Throwing on missing paths, returning null (comparison semantics unclear), different behavior per path type

**Effect id and depends_on**:
Effects in a group may carry an optional `id` field (string, unique within the group) and an optional `depends_on` field (string, referencing another effect's id). Execution is sequential in array order. An effect with `depends_on` executes only if the referenced effect succeeded (did not throw and did not return false). If the dependency failed, the dependent effect is skipped (not an error — this is branching logic). Cyclic dependencies and references to non-existent ids produce load-time errors (file + line + reason). MVP does NOT do topological sorting — array order + skip is sufficient.
_Avoid_: DAG scheduler (premature), depends_on referencing array index (fragile), silent execution of dependents when dependency failed

**Body item**:
A physical H-related item occupying one of 15 numbered body slots (0-14) on a character, tracked separately from clothing equipment. Examples: drugs (slot 8-12), toys (slot 0-7), condoms (slot 13), gag (slot 14). Each slot stores `{itemId, active, expiry?}`. Body items are managed independently per character — the player character and each NPC have their own body_items array. Body items have effects that fire either once on use (consumable) or on every action tick (persistent). The slot index determines the item's purpose, and the item definition's `body_auto_remove` field controls lifecycle (auto-remove at H end / on expiry / manual only).
_Avoid_: Mixing body items with equipment, treating body items as clothing, assuming body items are shared between characters

**Body item slot**:
One of 15 numbered positions (0-14) in a character's `body_items` array. Slot assignment is defined by the mod (e.g. via a body_slot field on items.toml or a separate body-slot mapping). Convention matches erArk: 0-7 = toys, 8-12 = drugs, 13 = condom, 14 = gag. Slots 8-12 support expiry (drugs have duration); slots 0-7, 13-14 support auto-remove on H end or manual removal.
_Avoid_: Hardcoding slot ranges in engine code

**Item use**:
A field on item definitions (`use` in items.toml) that determines how and when the item can be used. Values: `self` (use from inventory on self, exploration-only), `target` (use on selected character, exploration-only — body mod drugs, gifts), `h_drug` (use during H mode, goes into body_item slot 8-12 — lubricant, aphrodisiac, contraceptives), `h_toy` (use during H mode, goes into body_item slot 0-7 — vibrator, nipple clamp), `h_special` (H mode, context-dependent special logic — condom auto-checked on ejaculation), `equip` (equip to an equipment slot — weapons, armor, clothing), `gift` (give as gift, calculates favorability via gift formula), `key` (special/quest item, no standard use flow).
_Avoid_: Single use model for all items, hardcoding use logic per item id in engine code

**Body auto remove**:
A field on item definitions (`body_auto_remove`) controlling the lifecycle of a body item in its slot: `h_end` (auto-removed when H scene ends — e.g. milking machine, blindfold, anal beads), `manual` (removed only by player action — e.g. persistent toys like nipple clamps), `expiry` (auto-removed when duration expires — e.g. drugs like contraceptives). Default is `manual`.

**Item tick effect**:
An ongoing effect on a body item that fires on every gameplay action tick while the body item is `active`. Implemented by combining body_item slot occupancy with a status-system status_effect that handles the tick interval, tick effects, and expiry. When the status expires (or is removed manually), the body_item slot is automatically deactivated.
_Avoid_: Separate tick loop for body items, linking tick behavior directly to body_item without status-system

**Ability progression**:
The mechanism by which abilities gain XP and level up. Managed by the independent `ability-progression` plugin (src/plugins/). Ability definitions declare `max_level` (0 = levelless), `xp_curve` (linear/exponential/custom), `xp_per_level` (number or array). Mod authors write abilities in shorthand: `abilities = { 华山剑法 = 3 }` (level only). The engine expands to full structure: `{ level: 3, xp: 0 }`. XP is gained via the `gain_ability_xp` effect (registered by ability-progression). On level-up: XP resets to 0, level increments, `unlocks` are checked (auto-grant sub-abilities/talents), `character:ability_up` event fires. Levelless abilities (max_level=0) cannot gain XP — `gain_ability_xp` on them is silently skipped. The full structure (with XP) is what gets saved.
_Avoid_: Mod authors writing XP values, XP stored separately from abilities, leveling without unlocks check

**Time advancement**:
Game time advances only during EXECUTING state, never during IDLE. Every action that enters EXECUTING has a `time_cost` (in minutes). IDLE operations (browsing NPCs, viewing menus, selecting commands) do NOT advance time. Defaults: movement 30 min (cross-region 60, same-area 5), item use 5 min, dialogue 10 min, combat turn 1 min. `time_cost = 0` is valid (instant action, still enters EXECUTING). All time advancement goes through the `advance_time` effect — no system advances time directly. Time modifiers (fatigue, martial arts) apply as `final = (base + sum(additive)) * product(multiplicative)`.
_Avoid_: Time advancing during IDLE, systems bypassing advance_time effect, time_cost without default

**Cross-file reference validation**:
A two-phase validation system. Phase 1 (load-time, blocks loading): validate all static ID references — location exit targets, ability unlocks, quest step character/conversation references, bindings attribute names, dialogue node choices.next, effect depends_on. Errors include file + line + invalid id + suggestion (nearest match or list of valid ids). Phase 2 (runtime, warning + skip): validate dynamic references — apply_status status id, start_conversation conversation id, modify_attribute attr (via binding resolution). Runtime failures do not crash the game; they produce a warning and skip the effect.
_Avoid_: All validation at runtime (slow debugging), all validation at load-time (can't check dynamic refs), silent validation failures

**Game startup flow**:
The user-facing sequence: engine initializes (10-step init sequence) → if `active_mod` is empty, show mod selection screen → load selected mod → show title screen (engine-provided UI with mod's title text/image) → player chooses: "新游戏" (triggers character creation → game starts), "继续冒险" (show save list → load save → game starts), "设置" (show settings panel), "切换模组" (back to mod selection). The title screen is engine-provided (not mod-customized UI); mods only supply title text, image, and description via `meta.toml`. Character creation only runs for new games, never for save loading.
_Avoid_: Mod-customized title screen UI, character creation on save load, skipping title screen
