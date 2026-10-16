// Use an installed Playwright module; browser dependencies are development-only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.OLIVECODE_TEST_ORIGIN || 'http://127.0.0.1:8765';
(async () => {
  const browser = await chromium.launch({ headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}) });
  try {
    for (const name of ['check-browser.js','check-guide.js','check-remote.js','check-grove.js']) {
      const context = await browser.newContext({ viewport:{width:1440,height:900} });
      await context.addInitScript(() => {
        window.securityViolations=[];
        document.addEventListener('securitypolicyviolation', e => window.securityViolations.push(e.violatedDirective+': '+e.blockedURI));
      });
      const page = await context.newPage();
      const run = eval('('+fs.readFileSync(path.join(__dirname,name),'utf8').replaceAll('http://127.0.0.1:8765',base)+')');
      const result = await run(page, {releaseReady:process.env.OLIVECODE_TEST_RELEASE_READY === 'true'});
      const violations = await page.evaluate(() => window.securityViolations);
      if(violations.length) throw Error('CSP: '+violations.join(', '));
      console.log(JSON.stringify({test:name,...result}));
      await context.close();
    }
    const context = await browser.newContext({viewport:{width:320,height:812},reducedMotion:'reduce'});
    const page = await context.newPage();
    const failures=[];
    page.on('pageerror', e=>failures.push(String(e)));
    page.on('response', r=>{if(r.status()>=400) failures.push(r.status()+' '+r.url())});
    for(const route of ['/','/guide','/privacy','/sponsors','/about','/terms']) {
      await page.goto(base+route);
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Mobile overflow '+route);
      if(await page.locator('link[rel=canonical]').getAttribute('href')!=='https://olivecode.dev'+route) throw Error('Canonical '+route);
      if(!await page.getByRole('link',{name:'Contact',exact:true}).isVisible()) throw Error('Contact missing '+route);
      if(await page.locator('footer a[href="/about"]').count()!==1) throw Error('Wrong contact destination '+route);
    }
    if(failures.length) throw Error(failures.join('\n'));
    console.log(JSON.stringify({test:'launch browser checks',passed:true,checks:['six clean URLs','all page assets load','320px layouts','canonical metadata','public contact on every page']}));
    await context.close();
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
