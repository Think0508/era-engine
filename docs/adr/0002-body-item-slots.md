# BODY_ITEM: separate physical H-item slots alongside equipment

H-mode items (drugs, toys, condoms, gags) are stored in a `body_items` array on each character, completely separate from the `equipment` mapping used for clothing. 15 numbered slots (0-14) match erArk's convention: 0-7 for toys, 8-12 for drugs, 13 for condoms, 14 for gag.

**Why not merge into equipment?** Clothing slots have `removable`, `auto_off`, and `cloth_remove_all` semantics that don't apply to body items — a vibrator shouldn't be removed by `cloth_remove_all`, and a condom isn't "visible" the way a skirt is. Splitting them keeps both systems simple and avoids accidental interactions.

**Why not use status-system only?** Body items are *physical objects with slot occupancy* — you can see them, touch them, remove them, and the slot they occupy determines what commands are available. A status effect ("vibrating") is an abstract condition that doesn't carry the same physicality. The two systems complement each other: body_item tracks slot occupancy, status_effect handles tick effects and duration expiry.

**Effect coupling:** Using a drug executes an effect chain that (1) deducts from inventory, (2) sets `body_items[slot].active = true`, (3) applies a corresponding status_effect for tick/expiry. When the status expires, it triggers `body_items[slot].active = false`. This dual-link pattern mirrors erArk's item_effect + SecondEffect split.
