import { describe, expect, test } from "bun:test"
import { ComputerBrowser } from "../../src/computer/browser"

const executable = await ComputerBrowser.findBrowser().catch(() => undefined)
type Observation = { revision: number; text: string; url: string; activeTab: string; tabs: { tab: string; url: string; active: boolean }[]; controls: { target: number; name: string; sensitive: boolean; value: string }[] }

const HTML = `<!doctype html><title>OliveCode test page</title>
<label>Name <input aria-label="Name"></label>
<label>Password <input type="password" aria-label="Password" value="secret-never-expose"></label>
<button onclick="document.querySelector('#result').textContent='Saved: '+document.querySelector('input').value">Save</button>
<button onclick="this.textContent='Changed'">Change control</button>
<p id="result">Not saved</p>
<div style="height:1800px"></div><button>Bottom control</button>`
const PUBLIC_HTML = `<!doctype html><title>Public fixture</title><label>Search <input aria-label="Search" value="original"></label><a href="/other" target="_blank">Open another tab</a><p>Public screenshot fixture</p>`

const MAPS_HTML = `<!doctype html><meta charset="utf-8"><title>Route fixture</title>
<input id="ucc-1" aria-label="Hľadať v Mapách Google">
<input id="ucc-2" aria-label="Choose starting point">
<input id="ucc-3" aria-label="Choose destination">
<button onclick="document.querySelector('p').textContent='Driving: '+document.getElementById('ucc-2').value+' to '+document.getElementById('ucc-3').value">Driving directions</button><p>Choose route</p>`

async function fixture(run: (browser: ComputerBrowser.Browser, url: string, signal: AbortSignal) => Promise<void>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => new Response(new URL(request.url).pathname === "/" ? HTML : new URL(request.url).pathname === "/maps" ? MAPS_HTML : PUBLIC_HTML, { headers: { "content-type": "text/html" } }) })
  const browser = new ComputerBrowser.Browser({ executable, headless: true })
  try { await run(browser, `http://127.0.0.1:${server.port}/`, new AbortController().signal) }
  finally { await browser.close(); await server.stop(true) }
}

describe("Computer browser", () => {
  test("distinguishes ordinary generated IDs and search labels from credentials", () => {
    for (const field of [
      { id: "ucc-1", label: "Hľadať v Mapách Google" },
      { id: "ucc-2", label: "Choose starting point" },
      { label: "Search tokenization documentation" },
      { id: "postponed-search", label: "Search" },
      { name: "destination", autocomplete: "street-address" },
    ]) expect(ComputerBrowser.privateField(field)).toBe(false)
    for (const field of [
      { type: "password", label: "Search" }, { type: "file" },
      { autocomplete: "section-payment billing cc-number" },
      { autocomplete: "one-time-code" }, { autocomplete: "current-password" },
      { name: "apiKey" }, { id: "access_token" }, { label: "Credit card number" },
      { name: "passwordInput" }, { name: "passwordinput" }, { label: "Security code" },
    ]) expect(ComputerBrowser.privateField(field)).toBe(true)
  })

  test.skipIf(!executable)("fills map search and both route fields with generated IDs", async () => fixture(async (browser, url, signal) => {
    let page = await browser.perform({ action: "open", url: url + "maps" }, signal) as Observation
    for (const [name, text] of [["Hľadať v Mapách Google", "Paris"], ["Choose starting point", "Paris"], ["Choose destination", "Monaco"]]) {
      const field = page.controls.find((node) => node.name === name)!
      expect(field.sensitive).toBe(false)
      page = await browser.perform({ action: "fill", target: field.target, revision: page.revision, text }, signal) as Observation
      expect(page.controls.find((node) => node.name === name)?.value).toBe(text)
    }
    const drive = page.controls.find((node) => node.name === "Driving directions")!
    page = await browser.perform({ action: "click", target: drive.target, revision: page.revision }, signal) as Observation
    expect(page.text).toContain("Driving: Paris to Monaco")
    await browser.perform({ action: "screenshot" }, signal)
  }), 30000)

  test("rejects credential-bearing and non-web URLs", () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "https://user:secret@example.com", "data:text/html,hello"])
      expect(() => ComputerBrowser.webURL(url)).toThrow()
    expect(ComputerBrowser.webURL("https://example.com")).toBe("https://example.com/")
  })

  test.skipIf(!executable)("observes, types, clicks and verifies actual page results", async () => fixture(async (browser, url, signal) => {
    let page = await browser.perform({ action: "open", url }, signal) as Observation
    expect(page.url).toBe(url)
    expect(JSON.stringify(page)).not.toContain("secret-never-expose")
    const field = page.controls.find((node) => node.name === "Name")!
    page = await browser.perform({ action: "type", target: field.target, revision: page.revision, text: "OliveCode" }, signal) as Observation
    const save = page.controls.find((node) => node.name === "Save")!
    page = await browser.perform({ action: "click", target: save.target, revision: page.revision }, signal) as Observation
    expect(page.text).toContain("Saved: OliveCode")
    const privateField = page.controls.find((node) => node.name === "Password")!
    expect(privateField.sensitive).toBe(true)
    await expect(browser.perform({ action: "type", target: privateField.target, revision: page.revision, text: "no" }, signal)).rejects.toThrow("Private fields")
  }), 30000)

  test.skipIf(!executable)("refuses stale targets and a changed DOM control", async () => fixture(async (browser, url, signal) => {
    const page = await browser.perform({ action: "open", url }, signal) as Observation
    await browser.perform({ action: "observe" }, signal)
    await expect(browser.perform({ action: "click", target: 3, revision: page.revision }, signal)).rejects.toThrow("Observe again")
    const fresh = await browser.perform({ action: "observe" }, signal) as Observation
    const button = fresh.controls.find((node) => node.name === "Change control")!
    const changed = await browser.perform({ action: "click", target: button.target, revision: fresh.revision }, signal) as Observation
    expect(changed.text).toContain("Changed")
    await expect(browser.perform({ action: "click", target: button.target, revision: fresh.revision }, signal)).rejects.toThrow("Observe again")
  }), 30000)

  test.skipIf(!executable)("reveals controls below the fold and closes permanently", async () => fixture(async (browser, url, signal) => {
    let page = await browser.perform({ action: "open", url }, signal) as Observation
    expect(page.controls.some((node) => node.name === "Bottom control")).toBe(false)
    for (let i = 0; i < 6; i++) page = await browser.perform({ action: "scroll", direction: "down" }, signal) as Observation
    // Input wheel events may finish rendering after their acknowledgment.
    const deadline = Date.now() + 3000
    while (!page.controls.some((node) => node.name === "Bottom control") && Date.now() < deadline)
      page = await browser.perform({ action: "observe" }, signal) as Observation
    expect(page.controls.some((node) => node.name === "Bottom control")).toBe(true)
    await browser.close()
    await expect(browser.perform({ action: "open", url }, signal)).rejects.toThrow("Browser stopped")
  }), 30000)

  test.skipIf(!executable)("cancels startup without launching another action", async () => fixture(async (browser, url) => {
    const controller = new AbortController()
    controller.abort()
    await expect(browser.perform({ action: "open", url }, controller.signal)).rejects.toThrow()
    await browser.close()
    await expect(browser.perform({ action: "observe" }, new AbortController().signal)).rejects.toThrow("Browser stopped")
  }), 30000)

  test.skipIf(!executable)("replaces and clears form fields instead of appending", async () => fixture(async (browser, url, signal) => {
    let page = await browser.perform({ action: "open", url: url + "public" }, signal) as Observation
    const field = page.controls.find((node) => node.name === "Search")!
    page = await browser.perform({ action: "fill", target: field.target, revision: page.revision, text: "replacement" }, signal) as Observation
    expect(page.controls.find((node) => node.name === "Search")?.value).toBe("replacement")
    page = await browser.perform({ action: "fill", target: field.target, revision: page.revision, text: "" }, signal) as Observation
    expect(page.controls.find((node) => node.name === "Search")?.value).toBe("")
  }), 30000)

  test.skipIf(!executable)("switches owned tabs and invalidates targets from the previous tab", async () => fixture(async (browser, url, signal) => {
    const first = await browser.perform({ action: "open", url: url + "public" }, signal) as Observation
    const second = await browser.perform({ action: "new_tab", url: url + "second" }, signal) as Observation
    expect(second.tabs).toHaveLength(2)
    expect(second.activeTab).not.toBe(first.activeTab)
    const restored = await browser.perform({ action: "switch_tab", tab: first.activeTab }, signal) as Observation
    expect(restored.url).toBe(url + "public")
    expect(restored.activeTab).toBe(first.activeTab)
    await expect(browser.perform({ action: "click", target: 1, revision: first.revision }, signal)).rejects.toThrow("Observe again")
    await expect(browser.perform({ action: "switch_tab", tab: "not-owned" }, signal)).rejects.toThrow("no longer available")
    expect((await browser.perform({ action: "observe" }, signal) as Observation).activeTab).toBe(first.activeTab)
  }), 30000)

  test.skipIf(!executable)("discovers tabs opened by links without switching automatically", async () => fixture(async (browser, url, signal) => {
    const first = await browser.perform({ action: "open", url: url + "public" }, signal) as Observation
    const link = first.controls.find((node) => node.name === "Open another tab")!
    let page = await browser.perform({ action: "click", target: link.target, revision: first.revision }, signal) as Observation
    const deadline = Date.now() + 3000
    while (page.tabs.length < 2 && Date.now() < deadline) page = await browser.perform({ action: "observe" }, signal) as Observation
    expect(page.tabs).toHaveLength(2)
    expect(page.activeTab).toBe(first.activeTab)
    const other = page.tabs.find((tab) => !tab.active)!
    const switched = await browser.perform({ action: "switch_tab", tab: other.tab }, signal) as Observation
    expect(switched.url).toBe(url + "other")
  }), 30000)

  test.skipIf(!executable)("captures an actual PNG and refuses visible private fields", async () => fixture(async (browser, url, signal) => {
    await browser.perform({ action: "open", url }, signal)
    await expect(browser.perform({ action: "screenshot" }, signal)).rejects.toThrow("private field")
    await browser.perform({ action: "navigate", url: url + "public" }, signal)
    const page = await browser.perform({ action: "screenshot" }, signal) as Observation & { screenshot: { data: string; mime: string } }
    expect(page.screenshot.mime).toBe("image/png")
    const bytes = Buffer.from(page.screenshot.data, "base64")
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(bytes.length).toBeGreaterThan(1000)
    expect(page.text).toContain("Public screenshot fixture")
  }), 30000)
})
