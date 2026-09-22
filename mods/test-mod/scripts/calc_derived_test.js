// 属性有效值层 E2E 夹具（2026-09-22）：compute 派生公式
// 只被 src/core/mod-loader.test.ts 的「loadMod × 属性有效值层」用例消费（经 "派生测试值" 的 compute 声明）。
// 签名 (base, attrs) => number：base = 本属性裸值（成长项），attrs.get = 其他属性的**有效值**。
// 必须同步、纯函数；返回非有限数会被求值器回退为裸值并上报。
return base + attrs.get("根骨") * 10
