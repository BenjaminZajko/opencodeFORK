import type { GpuInfo, HardwareProfile } from "../../src/onboarding/hardware"
import { emptyProfile } from "../../src/onboarding/hardware"
import type { ModelCatalog, ModelEntry } from "../../src/onboarding/reasoning"

// Test builders mirroring OliveCode tests/helpers.py.

export function appleSilicon(ramGb = 24.0, chip = "Apple M5"): HardwareProfile {
  const p = emptyProfile()
  p.osName = "macOS"
  p.osVersion = "15.0"
  p.arch = "arm64"
  p.cpuModel = chip
  p.cpuCoresPhysical = 10
  p.cpuCoresLogical = 10
  p.ramTotalGb = ramGb
  p.gpus = [{ vendor: "apple", name: chip, notes: "Unified memory shared with the system; no separate VRAM." }]
  p.diskFreeGb = 100.0
  p.diskTotalGb = 500.0
  p.notes.push("Apple Silicon detected")
  return p
}

export function nvidiaBox(vramGb = 12.0, ramGb = 32.0, gpuName = "NVIDIA GeForce RTX 3060"): HardwareProfile {
  const p = emptyProfile()
  p.osName = "Linux"
  p.arch = "x86_64"
  p.cpuModel = "AMD Ryzen 9 5900X"
  p.cpuCoresPhysical = 12
  p.cpuCoresLogical = 24
  p.ramTotalGb = ramGb
  p.gpus = [{ vendor: "nvidia", name: gpuName, vramGb, driver: "550.00" }]
  p.diskFreeGb = 200.0
  p.diskTotalGb = 1000.0
  return p
}

export function cpuOnly(ramGb = 8.0, osName = "Linux"): HardwareProfile {
  const p = emptyProfile()
  p.osName = osName
  p.arch = "x86_64"
  p.cpuModel = "Intel Core i5-8250U"
  p.cpuCoresLogical = 8
  p.ramTotalGb = ramGb
  p.diskFreeGb = 50.0
  return p
}

export function unknownHost(): HardwareProfile {
  const p = emptyProfile()
  p.notes.push("Could not detect total RAM.")
  p.notes.push("No dedicated GPU detected.")
  return p
}

export function macStudio(ramGb = 256.0): HardwareProfile {
  return appleSilicon(ramGb, "Apple M3 Ultra")
}

export function gpuEntry(vendor: string, name: string, vramGb?: number): GpuInfo {
  return { vendor, name, vramGb }
}

export function localEntry(
  id: string,
  paramsB: number,
  ramQ4Gb: number,
  coding = 5.0,
  opts?: Partial<ModelEntry>,
): ModelEntry {
  return {
    id,
    family: "test",
    kind: "local",
    paramsB,
    contextWindow: 32768,
    ramQ4Gb,
    needsDedicatedGpu: "no",
    codingScore: coding,
    agenticScore: 5.0,
    speedScore: 5.0,
    ...opts,
  }
}

export function tinyCatalog(): ModelCatalog {
  return {
    local: [
      localEntry("tiny:1b", 1.0, 1.2, 3.0),
      localEntry("small:7b", 7.0, 5.0, 6.0),
      localEntry("mid:14b", 14.0, 10.0, 8.0),
      { ...localEntry("big:70b", 70.0, 42.0, 9.0), serverClass: false },
      { ...localEntry("server:480b", 480.0, 290.0, 9.9), serverClass: true },
    ],
    cloud: [
      {
        id: "free-a",
        family: "claude",
        kind: "cloud",
        contextWindow: 200000,
        codingScore: 8.0,
        agenticScore: 8.0,
        speedScore: 9.0,
        freeTier: true,
      },
      {
        id: "paid-b",
        family: "claude",
        kind: "cloud",
        contextWindow: 200000,
        codingScore: 9.5,
        agenticScore: 9.5,
        speedScore: 8.0,
        freeTier: false,
      },
    ],
  }
}
