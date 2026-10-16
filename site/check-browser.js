async (page, options = {}) => {
  const base = 'http://127.0.0.1:8765';
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base);
  const releaseReady = options.releaseReady === true;
  if ((await page.getByRole('button', {name:'Copy install command'}).isDisabled()) === releaseReady) throw new Error(releaseReady ? 'Published install copy must be enabled' : 'Preview copy must be disabled');
  await page.getByRole('radio', {name:'Windows'}).check();
  if (!(await page.locator('#install-command').textContent()).startsWith('irm ')) throw new Error('Wrong Windows command');
  await page.getByRole('radio', {name:'Windows'}).press('ArrowLeft');
  if (!(await page.locator('#install-command').textContent()).startsWith('curl ')) throw new Error('Keyboard OS switch failed');
  const layouts = [];
  for (const theme of ['light','dark']) {
    await page.emulateMedia({colorScheme:theme});
    for (const width of [320,375,640,1200,1440]) {
      await page.setViewportSize({width,height:800});
      const layout = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,command:document.querySelector('.command-row').getBoundingClientRect().bottom}));
      if (layout.scroll > width || layout.command > 800) throw new Error('Overflow or hidden installer: '+JSON.stringify(layout));
      layouts.push({theme,...layout});
    }
  }
  await page.getByRole('link',{name:'Installation guide',exact:true}).click();
  if (!(await page.getByRole('heading',{name:'Start in your project.'}).isVisible())) throw new Error('Guide failed');
  await page.route('**/config.js*', route => route.fulfill({contentType:'application/javascript',body:'export const siteConfig={publicOrigin:"https://install.test",releaseReady:true}'}));
  await page.addInitScript(() => {
    Object.defineProperty(navigator,'userAgentData',{configurable:true,value:{platform:'Windows'}});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.testCopied=text}}});
  });
  await page.goto(base);
  if (!(await page.getByRole('radio',{name:'Windows'}).isChecked())) throw new Error('Windows detection failed');
  await page.getByRole('button',{name:'Copy install command'}).click();
  if ((await page.evaluate(()=>window.testCopied)) !== 'irm https://install.test/install.ps1 | iex') throw new Error('Copy content wrong');
  await page.evaluate(() => {
    navigator.clipboard.writeText=async()=>{throw new Error('denied')};
    document.execCommand=name=>{window.testLegacyCopied=document.activeElement.value;return name==='copy'};
  });
  await page.getByRole('button',{name:'Copy install command'}).click();
  if ((await page.evaluate(()=>window.testLegacyCopied)) !== 'irm https://install.test/install.ps1 | iex') throw new Error('Direct copy fallback failed');
  await page.evaluate(() => {document.execCommand=()=>false});
  await page.getByRole('button',{name:'Copy install command'}).click();
  if ((await page.evaluate(()=>String(getSelection()))) !== 'irm https://install.test/install.ps1 | iex') throw new Error('Copy fallback failed');
  await page.unroute('**/config.js*');
  if (errors.length) throw new Error(errors.join('\n'));
  return {passed:true,layouts,checks:[releaseReady ? 'published install enabled' : 'preview disabled','Windows command','keyboard OS selection','Windows detection','copy success','direct copy fallback','manual copy fallback','guide navigation','no browser errors']};
}
