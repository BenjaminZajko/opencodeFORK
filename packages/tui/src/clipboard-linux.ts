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

let owner: ChildProcess | undefined

export function writeGtk(text: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/python3", ["-I", "-u", "-c", gtkClipboardSource], { stdio: ["pipe", "pipe", "ignore"] })
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
      if (output === "READY\n") finish()
      else if (output.length > 100) finish(new Error("Invalid desktop clipboard response."))
    })
    child.stdin.end(text)
  })
}
