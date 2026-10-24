async page => {
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto('http://127.0.0.1:8765');
  await page.evaluate(()=>localStorage.setItem('olivecode-guide-language','sk'));
  await page.reload();
  await page.getByRole('link',{name:'Guide',exact:true}).first().click();
  await page.waitForURL('**/guide');
  if ((await page.locator('html').getAttribute('lang'))!=='en') throw new Error('Guide must default to English');
  if (await page.getByRole('dialog').isVisible()) throw new Error('Guide must not ask for language on arrival');
  await page.getByRole('button',{name:'English ▾',exact:true}).click();
  await page.getByRole('dialog',{name:'Choose your language'}).waitFor();
  await page.getByRole('searchbox',{name:'Find a language'}).fill('sloven');
  await page.getByRole('button',{name:'Slovenčina',exact:true}).click();
  await page.waitForURL('**/guide?lang=sk');
  if (!(await page.getByRole('heading',{name:'Začnite vo svojom projekte.'}).isVisible())) throw new Error('Slovak guide missing');
  await page.reload();
  if (await page.getByRole('dialog').isVisible()) throw new Error('Locale URL should not reopen picker');
  await page.getByRole('button',{name:'Slovenčina ▾',exact:true}).click();
  await page.getByRole('button',{name:'العربية',exact:true}).click();
  if ((await page.locator('[data-guide]').getAttribute('dir'))!=='rtl') throw new Error('Arabic direction missing');
  if ((await page.locator('html').getAttribute('lang'))!=='ar') throw new Error('Arabic language metadata missing');
  await page.getByRole('button',{name:'العربية ▾',exact:true}).click();
  await page.keyboard.press('Escape');
  if (await page.getByRole('dialog').isVisible()) throw new Error('Escape should dismiss picker');
  for (const language of ['en','sk','cs','de','es','fr','it','pt','pl','uk','ar','zh','ja','ko']) {
    await page.goto('http://127.0.0.1:8765/guide?lang='+language);
    if ((await page.locator('html').getAttribute('lang'))!==language) throw new Error('Wrong guide language: '+language);
    if ((await page.locator('[data-guide-text]').count())!==19) throw new Error('Incomplete guide structure');
  }
  await page.goto('http://127.0.0.1:8765/guide?lang=__proto__');
  await page.locator('#guide-language').click();
  const more=new URL(await page.getByRole('link',{name:'More languages · Google Translate ↗'}).getAttribute('href'));
  if (more.hostname!=='translate.google.com' || !more.searchParams.get('text').includes('Provider limits still apply.')) throw new Error('External translation should preserve complete public guide');
  await page.keyboard.press('Escape');
  await page.goto('http://127.0.0.1:8765');
  await page.locator('#product-heading').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  if (!(await page.locator('.product-shot img').evaluate(img=>img.complete && img.naturalWidth>0))) throw new Error('Real app screenshot missing');
  await page.setViewportSize({width:1440,height:900});
  await page.emulateMedia({colorScheme:'dark'});
  await page.locator('.product-section').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.screenshot({path:'docs/previews/site-product-dark.png'});
  await page.locator('.cost-section').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.screenshot({path:'docs/previews/site-cost-dark.png'});
  for (const theme of ['dark','light']) {
    await page.emulateMedia({colorScheme:theme});
    for (const width of [320,375,640,850,1440]) {
      await page.setViewportSize({width,height:812});
      if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error('Below-fold horizontal overflow');
      await page.goto('http://127.0.0.1:8765/guide');
      await page.getByRole('button',{name:'English ▾',exact:true}).click();
      if (await page.getByRole('dialog').evaluate(el=>el.getBoundingClientRect().width>innerWidth)) throw new Error('Dialog overflow');
      await page.keyboard.press('Escape');
      await page.goto('http://127.0.0.1:8765');
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return {passed:true,checks:['English first despite old preference','optional guide picker','search','Slovak translation','locale URL persistence','Arabic RTL','Escape dismiss','all 14 translations','invalid language fallback','external public-guide translation','real app image','ten section/dialog layouts']};
}
