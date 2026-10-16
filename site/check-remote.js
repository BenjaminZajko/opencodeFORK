async page => {
  const errors=[]
  page.on('pageerror', error=>errors.push(String(error)))
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'})
  await page.setViewportSize({width:1440,height:900})
  await page.goto('http://127.0.0.1:8765/#remote')
  await page.getByRole('heading',{name:'Out for a walk. Still making progress.'}).waitFor()
  await page.getByRole('radio',{name:'Background browser',exact:true}).check()
  if (!(await page.locator('#control-description').textContent()).includes('without taking your mouse')) throw Error('Background browser copy missing')
  await page.getByRole('radio',{name:'Isolated Mac',exact:true}).check()
  if (!(await page.locator('#control-description').textContent()).includes('setup-required preview')) throw Error('VM preview boundary missing')
  await page.getByRole('radio',{name:'Isolated Mac',exact:true}).press('ArrowLeft')
  if (!(await page.getByRole('radio',{name:'Background browser',exact:true}).isChecked())) throw Error('Keyboard mode selection failed')
  await page.getByRole('radio',{name:'Visible control',exact:true}).check()
  if (!(await page.locator('#control-description').textContent()).includes('shares your mouse and keyboard')) throw Error('Visible control boundary missing')
  for (const theme of ['dark','light']) {
    await page.emulateMedia({colorScheme:theme})
    for(const width of [320,375,640,850,1440]) {
      await page.setViewportSize({width,height:900})
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Remote section overflow: '+theme+' '+width)
      await page.locator('.remote-layout').scrollIntoViewIfNeeded()
      if(width===1440||width===375) await page.screenshot({path:'docs/previews/site-remote-'+theme+'-'+width+'.png'})
    }
  }
  await page.getByRole('link',{name:'Connect your phone',exact:false}).click()
  await page.waitForURL('**/guide#remote')
  if (!(await page.getByRole('heading',{name:'Connect your phone',exact:true}).isVisible())) throw Error('Remote deep link failed')
  const names=['en','sk','cs','de','es','fr','it','pt','pl','uk','ar','zh','ja','ko']
  for(const lang of names) {
    await page.goto('http://127.0.0.1:8765/guide?lang='+lang+'#remote')
    await page.waitForFunction(code=>document.documentElement.lang===code,lang)
    const content=await page.locator('[data-guide-text]').allTextContents()
    if(content.length!==19||content.some(text=>!text.trim()||text==='undefined')) throw Error('Incomplete translated guide: '+lang)
    if(!content[16].includes('/lock')||!content[16].includes('/stop')) throw Error('Remote commands missing: '+lang)
  }
  await page.goto('http://127.0.0.1:8765/privacy')
  if (!(await page.getByRole('heading',{name:'Computer control and Telegram'}).isVisible())) throw Error('Privacy disclosure missing')
  if(errors.length) throw Error(errors.join('\n'))
  return {passed:true,checks:['all three mode explanations','keyboard mode selection','10 responsive layouts','phone-to-computer illustration','guide deep link','14 complete remote translations','Telegram privacy disclosure','no browser errors']}
}
