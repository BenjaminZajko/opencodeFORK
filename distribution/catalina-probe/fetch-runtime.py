"""Fetch one official archived runtime with its pinned upstream checksum."""
import hashlib
from pathlib import Path
import stat
import urllib.request
import zipfile

root=Path(__file__).resolve().parent/'runtime'
root.mkdir(parents=True,exist_ok=True)
archive=root/'bun.zip'
url='https://github.com/oven-sh/bun/releases/download/bun-v1.0.14/bun-darwin-x64-baseline.zip'
with urllib.request.urlopen(url,timeout=60) as source,archive.open('wb') as target:
    while True:
        chunk=source.read(1024*1024)
        if not chunk:break
        target.write(chunk)
expected='ff6f07f6657f6fe43c10f444b7e58eed7db221f13126e07c8112e0e2d1efabc2'
if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected:raise RuntimeError('Runtime checksum mismatch')
with zipfile.ZipFile(archive) as package:
    with package.open('bun-darwin-x64-baseline/bun') as source:(root/'bun').write_bytes(source.read())
(root/'bun').chmod(stat.S_IRUSR|stat.S_IWUSR|stat.S_IXUSR|stat.S_IRGRP|stat.S_IXGRP|stat.S_IROTH|stat.S_IXOTH)
print('Verified official Bun 1.0.14 x64 baseline runtime; isolated diagnostic only')
