import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {detectClothingPage} from '../src/product-page';
function classify(body:string,path='/products/cotton-hoodie',head=''){
 const {document}=parseHTML(`<html><head>${head}</head><body>${body}</body></html>`);
 Object.defineProperty(document,'URL',{value:'https://shop.test'+path});
 return detectClothingPage(document as unknown as Document);
}
test('A hoodie is recognised from local product data with a closed sizing tab',()=>{
 const result=classify('<main><h1>Android Dreams Hoodie - Black</h1><button>Sizing</button><div hidden>PIT TO PIT (CM)</div></main>',undefined,'<script type="application/ld+json">{"@type":"Product","name":"Android Dreams Hoodie - Black","offers":{"price":68}}</script>');
 assert.equal(result.kind,'clothing');assert.equal(result.category,'top');assert.ok(result.signals.includes('product data'));
});
test('Price and purchase controls identify a clothing page without structured data',()=>{
 const result=classify('<main><h1>Heavy cotton hoodie</h1><span>CHF 68.00</span><button>Add to cart</button></main>');
 assert.equal(result.kind,'clothing');assert.equal(result.category,'top');
});
test('Unusual product names use category breadcrumbs and size controls',()=>{
 assert.equal(classify('<main><nav class="breadcrumb">Home / Knitwear</nav><h1>Midnight No. 2</h1><p>£80</p><button>Add to bag</button><select name="size"><option>M</option></select></main>','/shop/midnight').category,'top');
 assert.equal(classify('<main><h1>Archive 04</h1><p>CHF 80 · Size M · sleeve length 65 cm</p><button>Add to cart</button></main>').kind,'clothing');
});
test('Sold-out products, German clothing and jackets remain recognisable',()=>{
 for(const [name,button,category] of [['Cotton hoodie','Sold out','top'],['Winterjacke','Ausverkauft','jacket'],['Weite Hose','In den Warenkorb','trousers']]){
  const result=classify(`<main><h1>${name}</h1><p>EUR 90</p><button>${button}</button></main>`);
  assert.equal(result.kind,'clothing',name);assert.equal(result.category,category,name);
 }
});
test('Listing pages with product cards and Product ItemLists do not start analysis',()=>{
 const result=classify('<main><h1>Hoodies</h1><p>CHF 80</p><button>Add to cart</button></main>','/collections/hoodies','<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"@type":"Product","name":"Hoodie"}]}</script>');
 assert.equal(result.kind,'other');
 const cards='<article class="product-card"><h2>Cotton hoodie</h2><button>Add to cart</button><p>CHF 80</p></article>'.repeat(3);
 assert.equal(classify('<main><h1>Hoodies</h1>'+cards+'</main>','/shop').kind,'other');
});
test('Editorial pages and unrelated products are not clothing product pages',()=>{
 assert.equal(classify('<main><h1>How to style a hoodie</h1><p>Our favourite hoodie styles.</p></main>','/journal/hoodies').kind,'other');
 assert.equal(classify('<main><h1>Laptop</h1><p>CHF 900, Size M</p><button>Add to cart</button></main>').kind,'other');
 assert.equal(classify('<main><h1>Limited edition</h1><p>CHF 90</p><button>Add to cart</button></main>').kind,'unknown');
});
test('Related-product commerce and schemas cannot turn an article into a product',()=>{
 const related='<div class="related-products"><script type="application/ld+json">{"@type":"Product","name":"Cotton hoodie"}</script><button>Add to cart</button><p>CHF 80</p></div>';
 assert.equal(classify('<main><h1>Hoodie care</h1>'+related+'</main>','/journal/care').kind,'other');
});
