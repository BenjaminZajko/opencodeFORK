import { $ } from "bun"
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Bundle the fork's engine. Never substitute an upstream executable.
await $`bun ../opencode/script/build-node.ts`
await mkdir("resources/icons", { recursive: true })
for (const name of ["icon.png", "dock.png"]) {
  await copyFile("../../site/assets/icon-512.png", `resources/icons/${name}`)
}
await copyFile("../../site/assets/icon-512.png", "../app/public/olivecode-icon.png")

if (process.platform === "darwin") {
  const directory = await mkdtemp(join(tmpdir(), "olivecode-icon-"))
  const iconset = join(directory, "OliveCode.iconset")
  try {
    await mkdir(iconset)
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const destination = join(iconset, `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`)
        await $`sips -z ${size * scale} ${size * scale} ../../site/assets/icon-512.png --out ${destination}`.quiet()
      }
    }
    await $`iconutil -c icns ${iconset} -o resources/icons/icon.icns`
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
