import "./runtime-adapters.ts"
await import(new URL("./legacy.js", import.meta.url).href)
