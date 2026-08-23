declare module '@iarna/toml/parse-string.js' {
  const parse: (str: string) => Record<string, any>
  export default parse
}

declare module '@iarna/toml/stringify.js' {
  const stringify: (obj: Record<string, any>) => string
  export default stringify
}