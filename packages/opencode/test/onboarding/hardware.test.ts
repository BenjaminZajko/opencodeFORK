import { describe, it, expect } from "bun:test"
import {
  bestDedicatedVramGb,
  detectAmdGpus,
  detectHardware,
  detectNvidiaGpus,
  detectWindowsGpusWmi,
  emptyProfile,
  hasNvidiaGpu,
  isAppleSilicon,
  parseLscpu,
  type GpuInfo,
  type HardwareProfile,
  type RunFn,
} from "../../src/onboarding/hardware"
import { appleSilicon, nvidiaBox } from "./helpers"

// Port of OliveCode tests/test_hardware.py (21 cases). Contract under
// test: detection NEVER raises; every probe parser gets a canned-output
// test. Python mocks hw._safe_run; here tests inject canned RunFns.

function canned(code: number, stdout: string): RunFn {
  return async () => ({ code, stdout, stderr: "" })
}

function throwingRun(): RunFn {
  return async () => {
    throw new Error("hostile environment")
  }
}

describe("nvidia-smi parser", () => {
  it("parses a single gpu", async () => {
    const gpus = await detectNvidiaGpus(canned(0, "NVIDIA GeForce RTX 3060, 12288, 550.54\n"))
    expect(gpus).toHaveLength(1)
    expect(gpus[0].vendor).toBe("nvidia")
    expect(gpus[0].vramGb).toBeCloseTo(12.0)
    expect(gpus[0].driver).toBe("550.54")
  })

  it("parses multiple gpus", async () => {
    const gpus = await detectNvidiaGpus(
      canned(0, "NVIDIA GeForce RTX 3090, 24576, 550.54\nNVIDIA T400, 2048, 535.00\n"),
    )
    expect(gpus).toHaveLength(2)
    expect(Math.max(...gpus.map((g) => g.vramGb ?? 0))).toBeCloseTo(24.0)
  })

  it("tolerates garbage vram", async () => {
    const gpus = await detectNvidiaGpus(canned(0, "NVIDIA Weird Card, [unknown], 550.54\n"))
    expect(gpus).toHaveLength(1)
    expect(gpus[0].vramGb).toBeUndefined()
  })

  it("returns empty on failure", async () => {
    expect(await detectNvidiaGpus(canned(-1, ""))).toEqual([])
  })
})

describe("rocm-smi parser", () => {
  it("parses name and vram", async () => {
    const out = "GPU[0]          : Card series: Navi 31 [Radeon RX 7900 XT]\nvram total used: 20480 MB\n"
    const gpus = await detectAmdGpus(canned(0, out))
    expect(gpus).toHaveLength(1)
    expect(gpus[0].vendor).toBe("amd")
    expect(gpus[0].vramGb).toBeCloseTo(20.0)
  })

  it("returns empty without rocm", async () => {
    expect(await detectAmdGpus(canned(-1, ""))).toEqual([])
  })
})

describe("windows wmi parser", () => {
  const CANNED = `
AdapterRAM=4294963200
DriverVersion=32.0.15.6109
Name=NVIDIA GeForce RTX 3080

AdapterRAM=2147483648
DriverVersion=31.0.101.5333
Name=Intel(R) UHD Graphics 730

`

  it("parses two cards", async () => {
    const gpus = await detectWindowsGpusWmi(canned(0, CANNED))
    expect(gpus).toHaveLength(2)
    const vendors = new Set(gpus.map((g) => g.vendor))
    expect(vendors.has("nvidia")).toBe(true)
    expect(vendors.has("intel")).toBe(true)
  })

  it("does not trust big-card vram", async () => {
    // AdapterRAM caps near 4GB; a 10GB RTX 3080 must NOT be recorded as
    // ~4GB — that would corrupt the memory-pool math.
    const gpus = await detectWindowsGpusWmi(canned(0, CANNED))
    const nvidia = gpus.find((g) => g.vendor === "nvidia")!
    expect(nvidia.vramGb).toBeUndefined()
    expect(nvidia.notes?.toLowerCase()).toContain("not reported reliably")
  })

  it("flags intel igpu as integrated", async () => {
    const gpus = await detectWindowsGpusWmi(canned(0, CANNED))
    const intel = gpus.find((g) => g.vendor === "intel")!
    expect(intel.notes?.toLowerCase()).toContain("integrated")
  })

  it("does not leak fields across blocks", async () => {
    const out = "Name=AMD Radeon RX 6600\nAdapterRAM=8589934592\nName=Intel Iris Xe\n"
    const gpus = await detectWindowsGpusWmi(canned(0, out))
    const intel = gpus.find((g) => g.vendor === "intel")!
    expect(intel.vramGb).toBeUndefined()
  })
})

describe("lscpu parser", () => {
  const CANNED = `Architecture:            x86_64
CPU(s):                  24
  On-line CPU(s) list:   0-23
Model name:              AMD Ryzen 9 5900X
Socket(s):               1
Core(s) per socket:      12
`

  it("parses model and counts", () => {
    const res = parseLscpu(CANNED)
    expect(res).toBeDefined()
    expect(res!.model).toContain("Ryzen 9")
    expect(res!.physical).toBe(12)
    expect(res!.logical).toBe(24)
  })

  it("multiplies dual sockets", () => {
    const out = `Architecture:            x86_64
CPU(s):                  48
Model name:              Intel Xeon E5-2680 v3
Socket(s):               2
Core(s) per socket:      12
`
    expect(parseLscpu(out)?.physical).toBe(24)
  })

  it("returns undefined without the tool", () => {
    // parseLscpu itself is pure; the missing-tool path is detectCpu
    // seeing a nonzero exit — represented here by empty output.
    expect(parseLscpu("")).toBeUndefined()
  })
})

describe("profile predicates", () => {
  it("detects apple silicon with unified memory", () => {
    const p = appleSilicon()
    expect(isAppleSilicon(p)).toBe(true)
    expect(bestDedicatedVramGb(p)).toBe(0.0)
    expect(hasNvidiaGpu(p)).toBe(false)
  })

  it("requires 4gb for nvidia flag", () => {
    expect(hasNvidiaGpu(nvidiaBox(2.0))).toBe(false)
    expect(hasNvidiaGpu(nvidiaBox(4.0))).toBe(true)
  })

  it("picks max vram skipping apple", () => {
    const p: HardwareProfile = {
      ...emptyProfile(),
      osName: "macOS",
      arch: "x86_64",
      ramTotalGb: 64.0,
      gpus: [
        { vendor: "apple", name: "UHD" } as GpuInfo,
        { vendor: "nvidia", name: "RTX 2080", vramGb: 8.0 },
        { vendor: "amd", name: "RX 6800", vramGb: 16.0 },
      ],
    }
    expect(bestDedicatedVramGb(p)).toBeCloseTo(16.0)
  })

  it("treats a sparse profile as valid", () => {
    const p = emptyProfile()
    expect(bestDedicatedVramGb(p)).toBe(0.0)
    expect(hasNvidiaGpu(p)).toBe(false)
    expect(isAppleSilicon(p)).toBe(false)
  })
})

describe("never raises", () => {
  it("survives every subprocess failing", async () => {
    const profile = await detectHardware({ run: throwingRun() })
    expect(profile.notes).toBeInstanceOf(Array)
    expect(profile.gpus).toBeInstanceOf(Array)
  })

  it("survives disk probe exploding", async () => {
    const profile = await detectHardware({
      run: throwingRun(),
      statfs: () => {
        throw new Error("no such volume")
      },
    })
    expect(profile.diskFreeGb).toBeUndefined()
    expect(profile.notes.some((n) => /disk/i.test(n))).toBe(true)
  })

  it("survives everything at once", async () => {
    const profile = await detectHardware({
      run: throwingRun(),
      statfs: () => {
        throw new Error("boom")
      },
    })
    expect(profile.gpus).toBeInstanceOf(Array)
    expect(profile.notes).toBeInstanceOf(Array)
  })

  it("smoke-tests the real machine", async () => {
    const profile = await detectHardware()
    expect(profile.gpus).toBeInstanceOf(Array)
    expect(profile.notes).toBeInstanceOf(Array)
    expect(profile.osName).toBeDefined()
  })
})
