export const allShopOrigins=['https://*/*','http://*/*'];
type API=Pick<typeof chrome,'permissions'|'scripting'|'tabs'>;
export async function automaticDetectionEnabled(api:API=chrome){
 const [allowed,scripts]=await Promise.all([api.permissions.contains({origins:allShopOrigins}),api.scripting.getRegisteredContentScripts()]);
 return allowed&&scripts.some(s=>s.id==='all-shops'&&allShopOrigins.every(o=>s.matches?.includes(o))&&s.js?.includes('content.js'));
}
// Call directly from the click handler: no tab query before requesting access.
export async function enableAutomaticDetection(api:API=chrome,connect?:(tab:chrome.tabs.Tab)=>Promise<unknown>){
 if(!await api.permissions.request({origins:allShopOrigins}))throw Error('Website access was not granted. Click again and allow access in Chrome.');
 const scripts=await api.scripting.getRegisteredContentScripts();
 const script={id:'all-shops',matches:allShopOrigins,js:['content.js'],runAt:'document_idle' as const};
 if(scripts.some(s=>s.id===script.id))await api.scripting.updateContentScripts([script]);
 else await api.scripting.registerContentScripts([script]);
 const old=scripts.filter(s=>s.id.startsWith('shop-')).map(s=>s.id);
 if(old.length)await api.scripting.unregisterContentScripts({ids:old});
 // A chrome:// tab is fine: detection is enabled for subsequent shop visits.
 const tabs=await api.tabs.query({active:true,currentWindow:true});
 if(connect&&tabs[0]?.id&&/^https?:/.test(tabs[0].url||''))await connect(tabs[0]);
}
