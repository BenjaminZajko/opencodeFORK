import { spawn, type ChildProcess } from "node:child_process"

// Use the desktop's GTK clipboard when wl-copy/xclip are absent (common on a
// fresh Ubuntu install). Text arrives on stdin, never as Python source/args.
// GTK owns the selection until it is replaced; no clipboard history is read.
export const gtkClipboardSource = `import sys
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk, GLib
ok, _ = Gtk.init_check([])
if not ok:
    raise RuntimeError("No graphical clipboard session")
text = sys.stdin.buffer.read().decode("utf-8")
clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
clipboard.set_text(text, -1)
clipboard.set_can_store(None)
clipboard.store()
armed = False
def arm():
    global armed
    armed = True
    return False
def changed(*args):
    if armed:
        Gtk.main_quit()
clipboard.connect("owner-change", changed)
GLib.idle_add(arm)
print("READY", flush=True)
Gtk.main()
`

// Read the desktop clipboard (text, or a PNG image) without xclip/wl-paste.
export const gtkReadSource = `import base64, sys
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk, Gdk
ok, _ = Gtk.init_check([])
if not ok:
    raise RuntimeError("No graphical clipboard session")
clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
image = clipboard.wait_for_image() if clipboard.wait_is_image_available() else None
if image is not None:
    ok, data = image.save_to_bufferv("png", [], [])
    if ok:
        sys.stdout.write("image/png\\n" + base64.b64encode(data).decode("ascii"))
        sys.exit(0)
text = clipboard.wait_for_text()
if text is not None:
    sys.stdout.write("text/plain\\n" + text)
`

// On Wayland desktops (GNOME/KDE), a windowless helper may not own the
// clipboard, so a copy would be silently dropped. When XWayland is present,
// use the X11 clipboard, which the compositor bridges to Wayland apps.
function gtkEnv() {
  return process.env.DISPLAY ? { ...process.env, GDK_BACKEND: "x11" } : process.env
}

export function readGtk() {
  return new Promise<{ data: string; mime: string } | undefined>((resolve, reject) => {
    const child = spawn("/usr/bin/python3", ["-I", "-u", "-c", gtkReadSource], { stdio: ["ignore", "pipe", "ignore"], env: gtkEnv() })
    const chunks: Buffer[] = []
    const timer = setTimeout(() => { child.kill(); reject(new Error("The desktop clipboard did not respond.")) }, 5000)
    child.once("error", (error) => { clearTimeout(timer); reject(error) })
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
    child.once("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error("The GTK clipboard is unavailable."))
      const output = Buffer.concat(chunks).toString("utf8")
      const split = output.indexOf("\n")
      if (split < 0) return resolve(undefined)
      resolve({ mime: output.slice(0, split), data: output.slice(split + 1) })
    })
  })
}

let owner: ChildProcess | undefined

export function writeGtk(text: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/python3", ["-I", "-u", "-c", gtkClipboardSource], { stdio: ["pipe", "pipe", "ignore"], env: gtkEnv() })
    let settled = false
    let output = ""
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) { child.kill(); reject(error); return }
      owner?.kill()
      owner = child
      child.stdout.destroy()
      child.unref()
      resolve()
    }
    const timer = setTimeout(() => finish(new Error("The desktop clipboard did not respond.")), 5000)
    child.once("error", (error) => finish(error))
    child.stdin.on("error", (error) => finish(error))
    child.once("exit", () => {
      if (owner === child) owner = undefined
      finish(new Error("The GTK clipboard is unavailable."))
    })
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      // Confirm the desktop really holds the text before reporting success.
      if (output === "READY\n") readGtk().then((read) => finish(read?.mime === "text/plain" && read.data === text ? undefined : new Error("The desktop did not accept the copy.")), finish)
      else if (output.length > 100) finish(new Error("Invalid desktop clipboard response."))
    })
    child.stdin.end(text)
  })
}
