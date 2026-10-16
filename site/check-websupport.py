"""Exercise generated .htaccess on a disposable local Apache HTTPS server."""
import os,ssl,socket,subprocess,tempfile,time,json,http.client,shutil,signal
from pathlib import Path
root=Path(__file__).resolve().parent.parent

def port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]

with tempfile.TemporaryDirectory(prefix='olivecode-apache-') as temporary:
    temp=Path(temporary);plain=port();secure=port()
    public=temp/'public';shutil.copytree(root/'site-dist',public)
    openssl=subprocess.run(['rtk','openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(temp/'key.pem'),'-out',str(temp/'cert.pem'),'-days','1','-subj','/CN=olivecode.dev'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if openssl.returncode:raise RuntimeError('Could not create local test certificate')
    modules=['mpm_event','unixd','authz_core','authz_host','dir','mime','rewrite','headers','ssl','socache_shmcb','filter','deflate']
    module_path=Path('/usr/libexec/apache2')
    config=f'ServerRoot "{temp}"\nPidFile "{temp}/httpd.pid"\nServerName localhost\nListen 127.0.0.1:{plain}\nListen 127.0.0.1:{secure}\nErrorLog "{temp}/error.log"\nLogLevel warn\n'
    for module in modules:
        config+=f'LoadModule {module}_module "{module_path}/mod_{module}.so"\n'
    config+=f'TypesConfig /etc/apache2/mime.types\nDocumentRoot "{public}"\n<Directory "{public}">\nAllowOverride All\nRequire all granted\n</Directory>\n'
    config+=f'<VirtualHost 127.0.0.1:{plain}>\nServerName olivecode.dev\n</VirtualHost>\n'
    config+=f'<VirtualHost 127.0.0.1:{secure}>\nServerName olivecode.dev\nSSLEngine on\nSSLCertificateFile "{temp}/cert.pem"\nSSLCertificateKeyFile "{temp}/key.pem"\n</VirtualHost>\n'
    conf=temp/'httpd.conf';conf.write_text(config)
    proc=subprocess.Popen(['rtk','/usr/sbin/httpd','-X','-f',str(conf)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    context=ssl._create_unverified_context()
    def request(path='/',host='olivecode.dev',tls=True):
        conn=http.client.HTTPSConnection('127.0.0.1',secure,context=context,timeout=2) if tls else http.client.HTTPConnection('127.0.0.1',plain,timeout=2)
        conn.request('GET',path,headers={'Host':host});response=conn.getresponse();body=response.read().decode('utf8',errors='replace');headers=dict((k.lower(),v) for k,v in response.getheaders());conn.close();return response.status,headers,body
    try:
        for _ in range(20):
            if proc.poll() is not None:raise RuntimeError(proc.communicate()[1].decode()+'\n'+(temp/'error.log').read_text())
            try:
                status,headers,body=request();break
            except (OSError,ssl.SSLError):time.sleep(.05)
        else:raise RuntimeError('Local Apache did not start')
        assert status==200,(status,body)
        for host in ['olivecode.online','www.olivecode.online','www.olivecode.dev']:
            code,h,_=request('/guide?lang=sk',host);assert code==301 and h.get('location')=='https://olivecode.dev/guide?lang=sk',(host,code,h)
        code,h,_=request('/guide?lang=sk',tls=False);assert code==301 and h.get('location')=='https://olivecode.dev/guide?lang=sk',(code,h)
        for name in ['guide','privacy','sponsors','about','terms']:
            code,h,b=request('/'+name);assert code==200 and '<html' in b,(name,code,b[:300])
            code,h,_=request('/'+name+'.html?lang=sk');assert code==301 and h.get('location')=='https://olivecode.dev/'+name+'?lang=sk',(name,code,h)
        code,h,_=request('/index.html');assert code==301 and h.get('location')=='https://olivecode.dev/',(code,h)
        code,h,b=request('/missing/path');assert code==404 and 'This branch ends here' in b,(code,b[:300])
        for name in ['install','install.ps1']:
            code,h,b=request('/'+name);assert code==200 and h.get('content-type','').startswith('text/plain'),(name,code,h)
            assert h.get('cache-control')=='no-store' and 'noindex' in h.get('x-robots-tag',''),(name,h)
            assert '<html' not in b
        for path in ['/.env','/.git/config','/test.php']:
            code,_,_=request(path);assert code==403,(path,code)
        code,_,b=request('/.well-known/security.txt');assert code==200 and 'olivecode.ai@gmail.com' in b
        code,h,_=request('/');assert h.get('x-content-type-options')=='nosniff' and h.get('x-frame-options')=='DENY' and h.get('strict-transport-security')=='max-age=31536000'
        assert "script-src 'self'" in h.get('content-security-policy','')
        print(json.dumps({'passed':True,'checks':['real Apache HTTPS','four-domain canonical redirect','query preservation','clean routes and legacy redirects','real 404','plain-text installers','private-file and PHP denial','security.txt','security headers']}))
    except Exception:
        if (temp/'error.log').exists():print((temp/'error.log').read_text()[-4000:])
        raise
    finally:
        os.killpg(proc.pid,signal.SIGTERM)
        try:proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid,signal.SIGKILL);proc.communicate(timeout=5)
