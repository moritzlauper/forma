import {recommend,validateProduct,type Profile,type Product} from './fit';
import {detect,type Page} from './detect';
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 if(msg.type!=='page'||!sender.tab?.id)return;
 const tab=sender.tab.id;
 (async()=>{
  const page:Page={url:sender.url||'',name:String(msg.name).slice(0,200),text:String(msg.text).slice(0,16000),charts:Array.isArray(msg.charts)?msg.charts.slice(0,12).map((t:{text?:unknown;context?:unknown})=>({text:String(t.text||'').slice(0,8000),context:String(t.context||'').slice(0,10000)})):[]};
  const data=await chrome.storage.local.get(['profile','products']);
  const saved=(data.products as Record<string,{product:Product;fingerprint:string}>|undefined)?.[page.url];
  const fingerprint=JSON.stringify([page.name,page.charts]);
  const found=detect(page);
  const product=saved?.fingerprint===fingerprint?validateProduct(saved.product):found.product;
  const result=product&&data.profile?recommend(data.profile as Profile,product):null;
  const snapshot={...page,product,result,reason:found.reason};
  await chrome.storage.session.set({['page:'+tab]:snapshot});
  reply({url:page.url,result:result||{message:product?'Set up your fit profile once.':found.reason,ranked:[]}});
 })().catch(()=>reply({error:'No reliable recommendation yet.'}));return true;
});
chrome.permissions.onRemoved.addListener(async()=>{
 const scripts=await chrome.scripting.getRegisteredContentScripts();
 for(const script of scripts)if(!await chrome.permissions.contains({origins:script.matches!}))await chrome.scripting.unregisterContentScripts({ids:[script.id]});
});
chrome.storage.onChanged.addListener(async(changes,area)=>{
 if(area!=='local'||!changes.profile)return;
 for(const tab of await chrome.tabs.query({}))if(tab.id)chrome.tabs.sendMessage(tab.id,{type:'refresh'}).catch(()=>{});
});
