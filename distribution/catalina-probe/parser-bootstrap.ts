import "./runtime-adapters.ts"
await import(new URL("__PARSER_ASSET__", import.meta.url).href)
