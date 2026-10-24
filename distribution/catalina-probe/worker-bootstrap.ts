import "./runtime-adapters.ts"
await import(new URL("./worker-legacy.js", import.meta.url).href)
