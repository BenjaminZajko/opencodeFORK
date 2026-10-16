import { languages } from './guide-copy.js'
import { remoteGuide } from './remote-guide-copy.js'
const guideCopy = code => [...languages[code][1], ...remoteGuide[code]]

function initGuideLanguage() {
const guide=document.querySelector('[data-guide]')
if (!guide) return
const requested=new URL(location.href).searchParams.get('lang')
const browserLanguage=(navigator.language || 'en').split('-')[0]
const hasLanguage=code=>typeof code==='string' && Object.hasOwn(languages,code)
let selected=hasLanguage(requested) ? requested : 'en'
const element=(tag,text,attributes={})=>{
  const node=document.createElement(tag)
  if (text) node.textContent=text
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,value)
  return node
}
const applyLanguage=code=>{
  selected=code
  if (!guide) return
  document.documentElement.lang=code
  guide.dir=code==='ar' ? 'rtl' : 'ltr'
  document.querySelectorAll('[data-guide-text]').forEach(node=>{node.textContent=guideCopy(code)[Number(node.dataset.guideText)]})
  document.title=`${languages[code][1][0]} | OliveCode`
  document.querySelector('#guide-language').textContent=languages[code][0]+' ▾'
}
const dialog=element('dialog',null,{'class':'language-dialog','aria-labelledby':'language-title'})
const top=element('div',null,{'class':'language-heading'})
const title=element('h2','Choose your language',{id:'language-title'})
const close=element('button','×',{type:'button','class':'dialog-close','aria-label':'Close language picker'})
close.addEventListener('click',()=>dialog.close())
top.append(title,close)
const search=element('input',null,{type:'search',placeholder:'Find a language…','aria-label':'Find a language',autocomplete:'off',autofocus:''})
const list=element('div',null,{'class':'language-list'})
const empty=element('p','No match. More languages are available below.',{'class':'language-empty',role:'status'})
empty.hidden=true
for (const [code,[name]] of Object.entries(languages)) {
  const button=element('button',name,{type:'button',lang:code,'data-language':code})
  button.addEventListener('click',()=>{
    dialog.close()
    applyLanguage(code)
    const url=new URL(location.href);url.searchParams.set('lang',code);history.replaceState(null,'',url)
  })
  list.append(button)
}
const normalize=text=>text.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')
search.addEventListener('input',()=>{
  let count=0
  for (const button of list.children) {
    button.hidden=!normalize(button.textContent+' '+button.dataset.language).includes(normalize(search.value))
    if (!button.hidden) count++
  }
  empty.hidden=count>0
})
const translatedText=guideCopy('en').join('\n\n')
const moreURL=new URL('https://translate.google.com/')
moreURL.searchParams.set('sl','en');moreURL.searchParams.set('tl',browserLanguage);moreURL.searchParams.set('text',translatedText);moreURL.searchParams.set('op','translate')
const more=element('a','More languages · Google Translate ↗',{href:moreURL.href,target:'_blank',rel:'noopener noreferrer','class':'language-more'})
dialog.append(top,search,list,empty,more,element('p','Opens only this public guide in Google Translate. You can choose any language it supports.',{'class':'language-note'}))
document.body.append(dialog)
const showPicker=()=>{
  search.value=''
  for (const button of list.children) {button.hidden=false;button.setAttribute('aria-pressed',String(button.dataset.language===selected))}
  empty.hidden=true
  dialog.showModal()
}
applyLanguage(selected)
document.querySelector('#guide-language').addEventListener('click',showPicker)
}
initGuideLanguage()
