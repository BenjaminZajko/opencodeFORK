import type { Configuration } from "electron-builder"
import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)
const electronDist = join(dirname(require.resolve("electron/package.json")), "dist")

// Local previews deliberately have no upstream update feed or bundled upstream CLI.
// Public distribution needs OliveCode signing and notarization configuration.
const config: Configuration = {
  appId: "dev.olivecode.desktop.workspace",
  productName: "OliveCode Preview",
  // Fresh Bun installs may skip Electron’s binary download. In that case,
  // let electron-builder fetch the official binary for the target platform.
  electronDist: existsSync(electronDist) ? electronDist : undefined,
  artifactName: "olivecode-desktop-${os}-${arch}.${ext}",
  directories: { output: "dist", buildResources: "resources" },
  files: ["out/**/*", "!out/**/*.map"],
  extraResources: [{ from: "resources/icons", to: "icons" }],
  protocols: { name: "OliveCode", schemes: ["olivecode"] },
  publish: null,
  mac: {
    category: "public.app-category.developer-tools",
    icon: "resources/icons/icon.icns",
    identity: null,
    notarize: false,
    target: ["dir"],
  },
  win: { target: ["nsis"] },
  linux: { category: "Development", icon: "resources/icons", target: ["AppImage"] },
}

export default config
