import { describe, expect, test } from "bun:test"
import { ComputerBrowser } from "../../src/computer/browser"

const executable = await ComputerBrowser.findBrowser().catch(() => undefined)
type Observation = { revision: number; title: string; text: string; textStart: string; textTruncated?: string; headings: { level: number; text: string }[]; url: string; activeTab: string; tabs: { tab: string; url: string; active: boolean }[]; controls: { target: number; name: string; offscreen?: boolean; sensitive: boolean; value: string; readonly?: boolean; options?: { value: string; label: string; disabled: boolean; selected: boolean }[] }[] }

const HTML = `<!doctype html><title>OliveCode test page</title>
<label>Name <input aria-label="Name"></label>
<label>Password <input type="password" aria-label="Password" value="secret-never-expose"></label>
<button onclick="document.querySelector('#result').textContent='Saved: '+document.querySelector('input').value">Save</button>
<button onclick="this.textContent='Changed'">Change control</button>
<p id="result">Not saved</p>
<div style="height:1800px"></div><button>Bottom control</button>`
const PUBLIC_HTML = `<!doctype html><title>Public fixture</title><label>Search <input aria-label="Search" value="original"></label><a href="/other" target="_blank">Open another tab</a><p>Public screenshot fixture</p>
<label>Country <select aria-label="Country" onchange="document.querySelector('#selection').textContent=this.value"><option value="sk">Slovakia</option><option value="cz">Czechia</option><option value="locked" disabled>Unavailable</option><optgroup disabled label="Not available"><option value="grouped">Grouped</option></optgroup><option value="dup1">Duplicate</option><option value="dup2">Duplicate</option></select></label><p id="selection">sk</p>
<input aria-label="Receipt" readonly value="Keep me">
<button aria-disabled="true" onclick="this.textContent='Should never happen'">Unavailable action</button>`

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
  test("Ubuntu Snap browser profiles stay in the app-owned common directory", () => {
    expect(ComputerBrowser.browserProfileRoot("/snap/bin/chromium", "linux", "/home/test", "/tmp")).toBe("/home/test/snap/chromium/common/olivecode-profiles")
    expect(ComputerBrowser.browserProfileRoot("/usr/bin/chromium-browser", "linux", "/home/test", "/tmp")).toBe("/home/test/snap/chromium/common/olivecode-profiles")
    expect(ComputerBrowser.browserProfileRoot("/usr/bin/google-chrome", "linux", "/home/test", "/tmp")).toBe("/tmp")
    expect(ComputerBrowser.browserProfileRoot("/Applications/Google Chrome.app", "darwin", "/Users/test", "/tmp")).toBe("/tmp")
  })
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
    const name = page.controls.find((node) => node.name === "Name")!
    page = await browser.perform({ action: "click", target: name.target, revision: page.revision }, signal) as Observation
    page = await browser.perform({ action: "press", key: "Tab" }, signal) as Observation
    await expect(browser.perform({ action: "press", key: "Enter" }, signal)).rejects.toThrow("Private fields")
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

  test.skipIf(!executable)("lists controls below the fold, clicks them directly and closes permanently", async () => fixture(async (browser, url, signal) => {
    let page = await browser.perform({ action: "open", url }, signal) as Observation
    const bottom = page.controls.find((node) => node.name === "Bottom control")!
    expect(bottom.offscreen).toBe(true)
    page = await browser.perform({ action: "click", target: bottom.target, revision: page.revision }, signal) as Observation
    expect(page.controls.find((node) => node.name === "Bottom control")?.offscreen).toBeUndefined()
    expect(page.controls.find((node) => node.name === "Save")?.offscreen).toBe(true)
    for (let i = 0; i < 6; i++) page = await browser.perform({ action: "scroll", direction: "up" }, signal) as Observation
    // Input wheel events may finish rendering after their acknowledgment.
    const deadline = Date.now() + 3000
    while (page.controls.find((node) => node.name === "Save")?.offscreen && Date.now() < deadline)
      page = await browser.perform({ action: "observe" }, signal) as Observation
    expect(page.controls.find((node) => node.name === "Save")?.offscreen).toBeUndefined()
    await browser.close()
    await expect(browser.perform({ action: "open", url }, signal)).rejects.toThrow("Browser stopped")
  }), 30000)

  test.skipIf(!executable)("waits for a form submission to load the result page and keeps observations compact", async () => {
    const links = Array.from({ length: 300 }, (_, i) => `<p><a href="/item/${i}">Item ${i}</a></p>`).join("")
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async (request) => {
      const url = new URL(request.url)
      if (url.pathname === "/search") {
        await Bun.sleep(300)
        return new Response(`<!doctype html><title>Results</title><h1>Results for ${url.searchParams.get("q")}</h1>`, { headers: { "content-type": "text/html" } })
      }
      return new Response(`<!doctype html><title>Home</title><form action="/search"><input name="q" aria-label="Query"><button>Search</button></form>${links}`, { headers: { "content-type": "text/html" } })
    } })
    const browser = new ComputerBrowser.Browser({ executable, headless: true })
    const signal = new AbortController().signal
    try {
      let page = await browser.perform({ action: "open", url: `http://127.0.0.1:${server.port}/` }, signal) as Observation
      expect(page.controls.length).toBeLessThanOrEqual(125)
      expect(page.controls.filter((node) => node.offscreen).length).toBe(25)
      expect(JSON.stringify(page.controls[0])).not.toContain("disabled")
      const query = page.controls.find((node) => node.name === "Query")!
      page = await browser.perform({ action: "fill", target: query.target, revision: page.revision, text: "olives" }, signal) as Observation
      const search = page.controls.find((node) => node.name === "Search")!
      page = await browser.perform({ action: "click", target: search.target, revision: page.revision }, signal) as Observation
      expect(page.title).toBe("Results")
      expect(page.text).toContain("Results for olives")
      page = await browser.perform({ action: "back" }, signal) as Observation
      const again = page.controls.find((node) => node.name === "Query")!
      page = await browser.perform({ action: "fill", target: again.target, revision: page.revision, text: "figs" }, signal) as Observation
      page = await browser.perform({ action: "press", key: "Enter" }, signal) as Observation
      expect(page.text).toContain("Results for figs")
      await expect(browser.perform({ action: "press", key: "Meta" }, signal)).rejects.toThrow("Press one of")
    } finally { await browser.close(); await server.stop(true) }
  }, 60000)

  test.skipIf(!executable)("reads long pages from the scroll position and outlines headings", async () => {
    const sections = Array.from({ length: 40 }, (_, i) => `<h2>Section ${i + 1}</h2><p>${`Paragraph ${i + 1} filler text. `.repeat(40)}</p>`).join("")
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(`<!doctype html><title>Long</title><h1>Long article</h1>${sections}<p>Final sentence marker.</p>`, { headers: { "content-type": "text/html" } }) })
    const browser = new ComputerBrowser.Browser({ executable, headless: true })
    const signal = new AbortController().signal
    try {
      let page = await browser.perform({ action: "open", url: `http://127.0.0.1:${server.port}/` }, signal) as Observation
      expect(page.headings[0]).toEqual({ level: 1, text: "Long article" })
      expect(page.headings).toHaveLength(41)
      expect(page.textTruncated).toBeDefined()
      expect(page.text).not.toContain("Final sentence marker.")
      const deadline = Date.now() + 20000
      while (!page.text.includes("Final sentence marker.") && Date.now() < deadline)
        page = await browser.perform({ action: "scroll", direction: "down" }, signal) as Observation
      expect(page.textStart).toBe("viewport")
      expect(page.text).toContain("Final sentence marker.")
      expect(page.text).not.toContain("Paragraph 1 filler")
    } finally { await browser.close(); await server.stop(true) }
  }, 60000)

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
    expect(page.controls.find((node) => node.name === "Search")?.value ?? "").toBe("")
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

test.skipIf(!executable)(
  "selects observed dropdown options and verifies change events",
  async () =>
    fixture(async (browser, url, signal) => {
      let page = (await browser.perform({ action: "open", url: url + "public" }, signal)) as Observation
      const field = page.controls.find((node) => node.name === "Country")!
      expect(field.options?.find((option) => option.value === "cz")?.label).toBe("Czechia")
      page = (await browser.perform(
        { action: "select", target: field.target, revision: page.revision, text: "Czechia" },
        signal,
      )) as Observation
      expect(page.controls.find((node) => node.name === "Country")?.value).toBe("cz")
      expect(page.text).toContain("cz")
      for (const text of ["Unavailable", "Grouped", "Duplicate", "Missing"]) {
        await expect(
          browser.perform({ action: "select", target: field.target, revision: page.revision, text }, signal),
        ).rejects.toThrow()
        page = (await browser.perform({ action: "observe" }, signal)) as Observation
        expect(page.controls.find((node) => node.name === "Country")?.value).toBe("cz")
      }
      page = (await browser.perform(
        { action: "select", target: field.target, revision: page.revision, text: "sk" },
        signal,
      )) as Observation
      expect(page.controls.find((node) => node.name === "Country")?.value).toBe("sk")
      await expect(
        browser.perform({ action: "select", target: field.target, revision: 1, text: "cz" }, signal),
      ).rejects.toThrow("Observe again")
    }),
  30000,
)

test.skipIf(!executable)(
  "refuses read-only fields and aria-disabled controls without sending input",
  async () =>
    fixture(async (browser, url, signal) => {
      const page = (await browser.perform({ action: "open", url: url + "public" }, signal)) as Observation
      const receipt = page.controls.find((node) => node.name === "Receipt")!
      expect(receipt.readonly).toBe(true)
      await expect(
        browser.perform({ action: "fill", target: receipt.target, revision: page.revision, text: "Replace" }, signal),
      ).rejects.toThrow("read-only")
      const unavailable = page.controls.find((node) => node.name === "Unavailable action")!
      await expect(
        browser.perform({ action: "click", target: unavailable.target, revision: page.revision }, signal),
      ).rejects.toThrow("disabled")
      const after = (await browser.perform({ action: "observe" }, signal)) as Observation
      expect(after.controls.find((node) => node.name === "Receipt")?.value).toBe("Keep me")
      expect(after.text).not.toContain("Should never happen")
    }),
  30000,
)
