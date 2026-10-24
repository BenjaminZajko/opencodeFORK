"""Run a bounded terminal startup and input regression in an isolated home."""
import fcntl
import json
import os
from pathlib import Path
import platform
import pty
import re
import select
import struct
import subprocess
import sys
import tempfile
import termios
import time

binary=Path(sys.argv[1]).resolve()
report_path=Path(sys.argv[2]).resolve()
with tempfile.TemporaryDirectory(prefix='olivecode-terminal-probe-') as folder:
    env={key:os.environ[key] for key in ('PATH','TMPDIR','LANG') if key in os.environ}
    env.update(HOME=folder,PWD=folder,OPENCODE_TEST_HOME=folder,OPENCODE_DISABLE_MODELS_FETCH='1',OPENCODE_CONFIG_CONTENT=json.dumps({'autoupdate':False,'enabled_providers':[]}),TERM='xterm-256color',COLORTERM='truecolor')
    for name in ('DATA','CONFIG','STATE','CACHE'):env['XDG_'+name+'_HOME']=folder+'/'+name.lower()
    master,slave=pty.openpty()
    fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',32,110,0,0))
    started=time.monotonic()
    proc=subprocess.Popen([str(binary),'--pure',*sys.argv[3:]],cwd=folder,env=env,stdin=slave,stdout=slave,stderr=slave,start_new_session=True)
    os.close(slave)
    captured=bytearray()
    # Answer basic VT terminal queries so headless CI behaves like a terminal.
    replied=set()
    queries=[
        (rb'\x1b\[6n',lambda m:b'\x1b[1;1R'),
        (rb'\x1b\]10;\?\x07',lambda m:b'\x1b]10;rgb:ffff/ffff/ffff\x07'),
        (rb'\x1b\]11;\?\x07',lambda m:b'\x1b]11;rgb:0000/0000/0000\x07'),
        (rb'\x1b\]4;(\d+);\?\x07',lambda m:b'\x1b]4;'+m.group(1)+b';rgb:0000/0000/0000\x07'),
        (rb'\x1b\[\?(\d+)\$p',lambda m:b'\x1b[?'+m.group(1)+b';0$y'),
        (rb'\x1b\[\?u',lambda m:b'\x1b[?0u'),
        (rb'\x1b\[14t',lambda m:b'\x1b[4;640;880t'),
        (rb'\x1b\[>0q',lambda m:b'\x1bP>|OliveCodeBasicVT(1.0)\x1b\\'),
        (rb'\x1bP\+q([0-9a-fA-F]+)\x1b\\',lambda m:b'\x1bP0+r'+m.group(1)+b'\x1b\\'),
    ]
    typed=False
    running=False
    try:
        while time.monotonic()-started<35 and proc.poll() is None:
            if select.select([master],[],[],0.1)[0]:
                try:chunk=os.read(master,65536)
                except OSError:break
                captured.extend(chunk)
                for index,(pattern,response) in enumerate(queries):
                    for match in re.finditer(pattern,captured):
                        key=(index,match.start())
                        if key in replied:continue
                        os.write(master,response(match))
                        replied.add(key)
            if not typed and time.monotonic()-started>3 and b'0.1.0-catalina-probe' in captured:
                os.write(master,b'compatibility-input')
                typed=True
        running=proc.poll() is None
    finally:
        if proc.poll() is None:proc.terminate()
        try:proc.wait(timeout=4)
        except subprocess.TimeoutExpired:proc.kill();proc.wait()
        os.close(master)
    output=captured.decode(errors='replace')
    translated=subprocess.run(['sysctl','-in','sysctl.proc_translated'],capture_output=True,text=True)
    logs={str(f.relative_to(folder)):f.read_text(errors='replace') for f in Path(folder).rglob('*.log') if f.stat().st_size<1024*1024}
    report={'logs':logs,'host_platform':platform.platform(),'host_machine':platform.machine(),'host_translated':translated.stdout.strip()=='1','binary':str(binary),'seconds':round(time.monotonic()-started,2),'running_before_cleanup':running,'exit_code':proc.returncode,'rendered_version':'0.1.0-catalina-probe' in output,'typed':typed,'rendered_input':'compatibility-input' in output,'output':output}
    report['passed']=running and report['rendered_version'] and report['rendered_input'] and 'Unexpected server error' not in output
    report_path.parent.mkdir(parents=True,exist_ok=True)
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({key:value for key,value in report.items() if key not in ('output','logs')},indent=2))
    sys.exit(0 if report['passed'] else 1)
