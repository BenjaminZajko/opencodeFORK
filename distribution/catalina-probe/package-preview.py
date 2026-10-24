"""Prepare a local, portable Intel/Catalina trial without changing installed OliveCode."""
import hashlib
import json
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import zipfile

source=Path(__file__).resolve().parent
root=Path(sys.argv[1]).resolve()
root.mkdir(parents=True,exist_ok=False)
app=root/'app'
app.mkdir()
(root/'runtime').mkdir()
required={'legacy.js','worker-legacy.js','bootstrap.js','worker-bootstrap.js','parser-bootstrap.js','syntax-legacy.js','runtime-adapters-test.js','format-check.js'}
for file in (source/'output').iterdir():
    if not file.is_file():continue
    if file.name in required or file.name.startswith('parser.worker') or file.suffix in ('.wasm','.scm','.mp3'):
        shutil.copyfile(file,app/file.name)
for name in required:
    if not (app/name).exists():raise RuntimeError('Missing preview input: '+name)
library=Path(sys.argv[2]).resolve()
audit=subprocess.run(['otool','-l',str(library)],capture_output=True,text=True,check=True).stdout
if 'minos 10.15' not in audit:raise RuntimeError('Native library was not built for macOS 10.15')
for file in (source/'output').glob('libopentui*.dylib'):
    header=file.read_bytes()[:8]
    if int.from_bytes(header[4:8],'little')==0x1000007:
        shutil.copyfile(library,app/file.name)
        break
else:raise RuntimeError('No x86_64 terminal asset found in application bundle')
for name in ('timezone-env.sh','timezone-check.js'):
    shutil.copyfile(source/name,app/name)
shutil.copyfile(source/'runtime/bun',root/'runtime/bun')
(root/'runtime/bun').chmod(0o755)
(app/'olivecode-preview').write_text('''#!/bin/sh
set -eu
preview_app=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$preview_app/timezone-env.sh"
exec "$preview_app/../runtime/bun" --no-install "$preview_app/bootstrap.js" "$@"
''')
(app/'olivecode-preview').chmod(0o755)
shutil.copyfile(source.parent.parent/'LICENSE',root/'LICENSE-OliveCode.txt')
notices=[]
for name in ('@formatjs/intl-numberformat','@formatjs/intl-pluralrules','@formatjs/intl-listformat','@formatjs/intl-segmenter','@formatjs/bigdecimal','@formatjs/intl-localematcher','@formatjs/fast-memoize'):
    metadata=json.loads((source/'node_modules'/name/'package.json').read_text())
    notices.append(name+' '+metadata['version']+'\n'+(source/'node_modules'/name/'LICENSE.md').read_text())
(root/'LICENSE-FormatJS.txt').write_text('\n\n'.join(notices))
(root/'Workspace').mkdir()
(root/'Workspace/README.md').write_text('A safe empty workspace for the first OliveCode preview launch. Open your own project by passing its path to app/olivecode-preview.\n')
(root/'Start OliveCode Preview.command').write_text('''#!/bin/sh
set -eu
preview_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != x86_64 ]; then
  echo "This experimental preview is for Intel Macs."
  exit 1
fi
preview_state="$HOME/Library/Application Support/OliveCode Catalina Preview"
export XDG_DATA_HOME="$preview_state/data"
export XDG_CONFIG_HOME="$preview_state/config"
export XDG_STATE_HOME="$preview_state/state"
export XDG_CACHE_HOME="$preview_state/cache"
export OPENCODE_CONFIG_CONTENT='{"autoupdate":false}'
if [ "$#" -eq 0 ]; then set -- "$preview_root/Workspace"; fi
exec "$preview_root/app/olivecode-preview" --pure "$@"
''')
(root/'Check This Mac.command').write_text('''#!/bin/sh
set -u
preview_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
preview_report="$preview_root/compatibility-report.txt"
preview_temporary=$(mktemp -d)
trap 'rm -rf "$preview_temporary"' EXIT
export OPENCODE_TEST_HOME="$preview_temporary"
export OPENCODE_DISABLE_MODELS_FETCH=1
export OPENCODE_CONFIG_CONTENT='{"autoupdate":false,"enabled_providers":[]}'
export XDG_DATA_HOME="$preview_temporary/data"
export XDG_CONFIG_HOME="$preview_temporary/config"
export XDG_STATE_HOME="$preview_temporary/state"
export XDG_CACHE_HOME="$preview_temporary/cache"
{
  echo "OliveCode experimental Intel/Catalina compatibility check"
  SYSTEM_VERSION_COMPAT=0 sw_vers
  uname -m
  echo "Checking preview file integrity"
  (cd "$preview_root" && shasum -a 256 --status -c SHA256SUMS)
  preview_integrity=$?
  echo "Integrity exit: $preview_integrity"
  if [ "$preview_integrity" -ne 0 ]; then echo "Preview files failed integrity verification; stopping."; exit 1; fi
  . "$preview_root/app/timezone-env.sh"
  echo "Detected timezone: $TZ"
  "$preview_root/runtime/bun" --no-install "$preview_root/app/timezone-check.js"
  echo "Timezone check exit: $?"
  "$preview_root/runtime/bun" --no-install "$preview_root/app/format-check.js"
  echo "Formatting check exit: $?"
  "$preview_root/runtime/bun" --version
  echo "Runtime exit: $?"
  "$preview_root/app/olivecode-preview" --version
  echo "Application exit: $?"
  "$preview_root/runtime/bun" --no-install "$preview_root/app/native-check.js"
  echo "Native library exit: $?"
  "$preview_root/runtime/bun" --no-install "$preview_root/app/syntax-legacy.js" "$preview_temporary/parser"
  echo "Syntax worker exit: $?"
} > "$preview_report" 2>&1
cat "$preview_report"
echo "Report saved beside this script as compatibility-report.txt"
''')
for name in ('Start OliveCode Preview.command','Check This Mac.command'):(root/name).chmod(0o755)
lib=next(app.glob('libopentui*.dylib')).name
(app/'native-check.js').write_text('''import {dlopen} from "bun:ffi";
import {fileURLToPath} from "node:url";
const library=dlopen(fileURLToPath(new URL('''+json.dumps('./'+lib)+''',import.meta.url)),{YGConfigNew:{args:[],returns:"ptr"},YGConfigFree:{args:["ptr"],returns:"void"}});
const config=library.symbols.YGConfigNew();
if(!config)throw Error("Native configuration allocation failed");
library.symbols.YGConfigFree(config);
library.close();
console.log("PASS: native Intel terminal library loaded and allocated/freed its configuration");
''')
(root/'README.txt').write_text('''OliveCode — experimental Intel/Catalina preview

This local trial is not a supported public release. Actual macOS 10.15 verification is still needed.

1. Copy this whole folder to the Intel Mac mini and unzip it there.
2. Double-click Check This Mac.command. It checks local timezone behavior, number formatting in main/background threads, startup, the rebuilt native library and syntax highlighting, then saves compatibility-report.txt beside it. It does not use a model account.
3. If those checks pass, double-click Start OliveCode Preview.command. Try typing and opening the provider/model controls.

The preview keeps its own settings under Library/Application Support/OliveCode Catalina Preview. It does not replace your installed olivecode command. The launcher uses --pure; external plugins and optional computer/background-Mac features are not verified in this preview. The included empty Workspace is only the first-launch location. You can open a project with app/olivecode-preview --pure /path/to/project.

The wrapper reads the local timezone identifier from /etc/localtime when TZ is unset. It passes that identifier to this process and its children to avoid a newer ICU lookup absent on Catalina. An existing nonempty TZ is preserved. It does not change the Mac’s timezone.

For the archived runtime, number formatting, plural rules, lists and text segmentation use pinned FormatJS JavaScript code and English/Slovak locale data, avoiding newer ICU number-range functions absent on Catalina. Other requested number locales fall back to the bundled locale data.

This preview uses an archived 2023 runtime. Runtime security/support assessment is still outstanding; it is not ready for general distribution. The upstream public installer still requires the currently supported macOS version. Do not distribute this trial as official Catalina support.
''')
manifest={str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(root.rglob('*')) if f.is_file()}
(root/'SHA256SUMS').write_text(''.join(digest+'  '+name+'\n' for name,digest in manifest.items()))
archive=root.with_suffix('.zip')
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as package:
    for file in sorted(root.rglob('*')):
        if file.is_file():package.write(file,str(Path(root.name)/file.relative_to(root)))
print(json.dumps({'folder':str(root),'zip':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':len(manifest)},indent=2))
