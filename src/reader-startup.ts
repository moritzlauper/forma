import {createPageConnector} from './page-connection';

/** Repair/start permitted active pages without requiring the side panel to open.
 * A live reader only receives a ping: no refresh, new analysis or new permission.
 */
export function installReaderStartup(api:typeof chrome,isEnabled:()=>Promise<boolean>){
 const connect=createPageConnector(api);
 const start=async(tab:chrome.tabs.Tab)=>{
  if(tab.active&&tab.status==='complete'&&/^https?:/.test(tab.url||'')&&await isEnabled())await connect(tab);
 };
 const active=async()=>{for(const tab of await api.tabs.query({active:true}))await start(tab);};
 const safely=(work:Promise<unknown>)=>{void work.catch(()=>{});};
 api.tabs.onUpdated.addListener((_id,change,tab)=>{if(change.status==='complete')safely(start(tab));});
 api.tabs.onActivated.addListener(({tabId})=>{safely(api.tabs.get(tabId).then(start));});
 api.runtime.onInstalled.addListener(()=>safely(active()));
 api.runtime.onStartup.addListener(()=>safely(active()));
 api.permissions.onAdded.addListener(()=>safely(active()));
 safely(active());
 return ()=>safely(active());
}
