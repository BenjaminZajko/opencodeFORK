"""Simulate the thirteen potential Catalina ICU gaps; never ship the diagnostic dylib."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

source = Path(__file__).resolve().parent
runtime = source / 'runtime/bun'
rows = []
with tempfile.TemporaryDirectory(prefix='olivecode-timezone-test-') as folder:
    trap = Path(folder) / 'trap.dylib'
    subprocess.run(['clang', '-arch', 'x86_64', '-mmacosx-version-min=10.15', '-dynamiclib', '-Wl,-undefined,dynamic_lookup', str(source/'timezone-trap.c'), '-o', str(trap)], check=True)
    env = dict(os.environ, DYLD_INSERT_LIBRARIES=str(trap), OPENCODE_TEST_HOME=folder, OPENCODE_DISABLE_MODELS_FETCH='1', OPENCODE_CONFIG_CONTENT='{"autoupdate":false,"enabled_providers":[]}')
    env.pop('TZ', None)
    # This must fail: otherwise the diagnostic does not intercept the real API.
    control = subprocess.run([str(runtime), '--no-install', '-e', 'console.log(new Date(0).toString())'], env=env, text=True, capture_output=True, timeout=20)
    assert control.returncode == 88 and 'TRAP:' in control.stderr, control
    rows.append({'case': 'missing-API control', 'exit': control.returncode, 'expected_exit': 88})
    number_control = subprocess.run([str(runtime), '--no-install', '-e', 'new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(1)'], env=dict(env, TZ='Europe/Bratislava'), text=True, capture_output=True, timeout=20)
    assert number_control.returncode == 88 and 'TRAP:' in number_control.stderr, number_control
    rows.append({'case': 'missing number-range API control', 'exit': number_control.returncode, 'expected_exit': 88})
    formatted = subprocess.run(['/bin/sh', '-c', '. "$1/timezone-env.sh"; exec "$1/runtime/bun" --no-install "$1/output/format-check.js"', 'format-test', str(source)], env=env, text=True, capture_output=True, timeout=25)
    rows.append({'case': 'formatting with unavailable ICU APIs trapped', 'exit': formatted.returncode, 'stdout': formatted.stdout, 'stderr': formatted.stderr})
    assert formatted.returncode == 0, rows[-1]
    for zone in (None, 'Europe/Bratislava', 'America/New_York', 'Asia/Kolkata', 'Etc/UTC'):
        current = dict(env)
        if zone: current['TZ'] = zone
        result = subprocess.run(['/bin/sh', '-c', '. "$1/timezone-env.sh"; exec "$1/runtime/bun" --no-install "$1/timezone-check.js"', 'timezone-test', str(source)], env=current, text=True, capture_output=True, timeout=25)
        rows.append({'case': zone or 'automatic local timezone', 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
        assert result.returncode == 0, rows[-1]
    application = subprocess.run([str(source/'output/olivecode-probe'), '--version'], env=env, text=True, capture_output=True, timeout=30)
    rows.append({'case': 'actual application version with missing-API trap', 'exit': application.returncode, 'stdout': application.stdout, 'stderr': application.stderr})
    assert application.returncode == 0 and '0.1.0-catalina-probe' in application.stdout, rows[-1]
if len(sys.argv) > 1:
    Path(sys.argv[1]).parent.mkdir(parents=True, exist_ok=True)
    Path(sys.argv[1]).write_text(json.dumps(rows, indent=2)+'\n')
print(json.dumps(rows, indent=2))
