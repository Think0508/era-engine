# ARRAY MERGE IN TEMPLATE INHERITANCE: replace by default, `[template_append]` for append

Template inheritance uses type-specific merge rules. For arrays, the default is **full replacement** (child replaces parent's array). This is deliberate: implicit append causes silent data loss when a child template writer doesn't know what the parent defined. To append to a parent array rather than replace it, use a `[template_append]` section: `[template_append]\ntags = ["hero"]`. This is valid TOML and unambiguous.

**Alternatives considered:**
1. `tags.+ = ["hero"]` — not valid TOML syntax (rejected).
2. **Auto-append at deeper inheritance levels** — any level 2+ child auto-appends arrays. Problem: ambiguous whether the writer intended append or replace.
3. **Always replace** — simple, predictable, but requires manual copying of parent values when append is desired.
4. **Replace by default, `[template_append]` syntax for explicit append** — chosen. Valid TOML, zero ambiguity.
