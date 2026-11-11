import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {collectCharts,discoverCharts,findSizeGuide,collectProductImages,productText} from '../src/page-discovery';
import {detect} from '../src/detect';
const table='<p>Width measured across the front of the chest, pit-to-pit. Body length from HPS to hem.</p><table><tr><th></th><th>XS</th><th>S</th><th>M</th><th>L</th></tr><tr><td>PIT TO PIT (CM)</td><td>55.5</td><td>58</td><td>60.5</td><td>63</td></tr><tr><td>BODY LENGTH HPS* (CM)</td><td>61</td><td>64</td><td>66</td><td>68</td></tr></table>';
function documentFor(html:string){const {document}=parseHTML('<html><head></head><body>'+html+'</body></html>');Object.defineProperty(document,'URL',{value:'https://example.test/products/hoodie'});return document as unknown as Document;}
test('Closed Sizing tab is read and parsed without opening it',async()=>{
 const doc=documentFor('<main><h1>Box hoodie</h1><button role="tab" aria-controls="sizing">Sizing</button><div id="sizing" role="tabpanel" hidden>'+table+'</div></main>');
 let clicks=0;doc.querySelector('button')!.addEventListener('click',()=>clicks++);
 const charts=await discoverCharts(doc,new Set(),async()=>{throw Error('No waiting needed');});
 assert.equal(charts.length,1);assert.equal(clicks,0);
 const result=detect({name:'Box hoodie',url:doc.URL,text:'',charts});
 assert.equal(result.product?.sizes.find(s=>s.label==='L')?.measures.length,68);
 assert.equal(result.product?.sizes.find(s=>s.label==='L')?.measures.chest,63);
});
test('Sizing control loads a lazy chart before discovery resolves',async()=>{
 const doc=documentFor('<main><h1>Box hoodie</h1><button type="button">Sizing</button><div id="sizing"></div></main>');
 let clicked=false;let waits=0;doc.querySelector('button')!.addEventListener('click',()=>clicked=true);
 const charts=await discoverCharts(doc,new Set(),async()=>{waits++;assert.equal(clicked,true);if(waits===2)doc.getElementById('sizing')!.innerHTML=table;});
 assert.equal(charts.length,1);assert.equal(waits,2);
});
test('Discovery does not click cart actions, submit buttons or external sizing links',()=>{
 for(const html of ['<button>Add to cart</button>','<form><button>Sizing</button></form>','<a href="https://other.test/size-guide">Size guide</a>','<a href="/pages/size-guide">Size guide</a>'])assert.equal(findSizeGuide(documentFor('<main>'+html+'</main>')),null);
 assert.ok(findSizeGuide(documentFor('<main><a role="tab" href="#sizing">Sizing</a></main>')));
});
test('An unresponsive guide gets one bounded hydration retry, not a click on each mutation',async()=>{
 const doc=documentFor('<main><button type="button">Size chart</button></main>');const attempted=new Set<HTMLElement>();let clicks=0;
 doc.querySelector('button')!.addEventListener('click',()=>clicks++);
 await discoverCharts(doc,attempted,async()=>{});await discoverCharts(doc,attempted,async()=>{});assert.equal(clicks,2);
});
test('Custom shop tabs and linked hidden panels outside main are discoverable',async()=>{
 const doc=documentFor('<main><div class="product-tab" data-tab="sizing">Sizing</div></main><div id="sizing" hidden>'+table+'</div>');
 assert.equal(findSizeGuide(doc)?.getAttribute('data-tab'),'sizing');
 assert.equal((await discoverCharts(doc,new Set(),async()=>{})).length,1);
});
test('Recommendation sections are excluded from size-chart discovery',()=>{
 const doc=documentFor('<main><div class="related-products">'+table+'</div></main>');assert.equal(collectCharts(doc).length,0);
});
test('Product gallery images work without JSON-LD or social metadata',()=>{
 const doc=documentFor('<main><div class="product-gallery"><img src="/front.jpg" width="700" height="900"><img data-src="//cdn.example.test/back.jpg" src="data:image/gif;base64,AA"></div><div class="related-products"><img src="/other.jpg" width="1000" height="1000"></div></main>');
 assert.deepEqual(collectProductImages(doc),['https://example.test/front.jpg','https://cdn.example.test/back.jpg']);
});
test('Nested Product JSON-LD images are discovered',()=>{
 const doc=documentFor('<main><script type="application/ld+json">{"@type":"WebPage","mainEntity":{"@type":"Product","image":{"contentUrl":"https://cdn.example.test/hoodie.jpg"}}}</script></main>');
 assert.deepEqual(collectProductImages(doc),['https://cdn.example.test/hoodie.jpg']);
});
test('Product text retains closed-tab details and omits scripts and the FORMA card',()=>{
 const doc=documentFor('<main><div hidden>Box fit with ribbed hem</div><script>privateScript()</script><div id="forma-fit-card">Old AI answer</div></main>');
 assert.equal(productText(doc),'Box fit with ribbed hem');
});
