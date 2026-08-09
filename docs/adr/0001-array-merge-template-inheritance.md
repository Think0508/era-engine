# ARRAY MERGE IN TEMPLATE INHERITANCE: replace by default, `[template_append]` for append

Template inheritance uses type-specific merge rules. For arrays, the default is **full replacement** (child replaces parent's array). This is deliberate: implicit append causes silent data loss when a child template writer doesn't know what the parent defined. To append to a parent array rather than replace it, use a `[template_append]` section: `[template_append]\ntags = ["hero"]`. This is valid TOML and unambiguous.

> **2026-08-09 标注**：`[template_append]` 语法目前**仅在本文档定义，代码未实现**
> （`src/core/template.ts` resolveTemplate/deepMerge 不处理该段）。写模板数据请按"整表替换"行为
> 理解；如需追加请在子模板中写出完整数组。实现 `template_append` 属后续工作，勿在范例/文档中
> 教作者使用该语法。

**Alternatives considered:**
1. `tags.+ = ["hero"]` — not valid TOML syntax (rejected).
2. **Auto-append at deeper inheritance levels** — any level 2+ child auto-appends arrays. Problem: ambiguous whether the writer intended append or replace.
3. **Always replace** — simple, predictable, but requires manual copying of parent values when append is desired.
4. **Replace by default, `[template_append]` syntax for explicit append** — chosen. Valid TOML, zero ambiguity.
