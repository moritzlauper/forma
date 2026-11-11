import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {collectProductEvidence} from '../src/product-evidence';
import {inputForReview,validateReview} from '../src/assessment';
import {detect} from '../src/detect';
import {recordScan} from '../src/scan-library';
import type {Profile} from '../src/fit';
const profile:Profile={mode:'body',category:'trousers',name:'Test',fit:'relaxed',measures:{},context:{height:185,weight:83,waistLabel:'33/34',style:'Urban',concerns:['Avoid short trousers']}};
const page={url:'https://shop.test/shorts',name:'Denim Shorts',text:'Loose fit',charts:[{text:'EU;INT;FR;JEANS\n48;M;48;32\n50;L;50;33\n50;L;50;34',context:'Size guide'},{text:'EU;INT;TAILLENUMFANG;HÜFTUMFANG;BEINLÄNGE AN DER INNENSEITE\n48;M;80;98;82\n50;L;84;102;83\n50;L;88;106;84',context:'Körpermasse'}]};
const result={size:'L',summary:"I'd try L based on your usual W33/W34 labels in this guide.",checks:{width:'W33 and W34 map to L; actual garment ease is unknown.',length:'The body guide does not establish shorts length.',sleeves:'Not applicable.'},ratings:[],reasons:[],limitations:[]};
test('Unitless body references permit a tentative label choice instead of overriding the AI with a refusal',()=>{
 const found=detect(page);assert.equal(found.product,null);
 const input=inputForReview(page,null,profile,[]);
 assert.equal(input.decision.canSelectSize,true);assert.deepEqual(input.decision.eligibleSizes,['M','L']);assert.deepEqual(input.product.labelMatches.map(m=>m.label),['33','34']);
 const review=validateReview(result,null,input);assert.equal(review.size,'L');assert.equal(review.summary,result.summary);assert.equal(review.basis,'estimate');assert.deepEqual(review.ranked,[]);assert.match(review.limitations.join(' '),/not verified centimetres/);
 const scan=recordScan([],page,null)[0];assert.deepEqual(scan.measurements,[]);assert.equal(scan.measurementTables[0]?.unit,null);assert.equal(scan.measurementTables[0]?.rows[1][2],'84');
});
test('Guide label choices still reject invented sizes and negative fit feedback',()=>{
 const input=inputForReview(page,null,profile,[]);assert.throws(()=>validateReview({...result,size:'XXL'},null,input),/missing from the chart/);
 const rejected=inputForReview(page,null,profile,[{name:page.name,size:'L',value:'Too tight'}]);assert.deepEqual(rejected.decision.eligibleSizes,[]);assert.throws(()=>validateReview(result,null,rejected));
 const unknown=inputForReview(page,null,{...profile,context:undefined},[]);assert.equal(unknown.decision.canSelectSize,false);
});
function doc(html:string){const {document}=parseHTML('<html><body>'+html+'</body></html>');Object.defineProperty(document,'URL',{value:'https://shop.test/jeans'});return document as unknown as Document;}
test('Model height, worn size and W x L options support a chart-free estimate independently of the selected size',()=>{
 const evidence=collectProductEvidence(doc('<main><h1>Astro Jeans</h1><p>Loose baggy fit</p><p>The model is <strong>1.86m</strong> tall and is wearing size 32 x 32 (Inches)</p><select aria-label="Size"><option selected>24 x 32</option><option>32 x 32</option><option>34 x 32</option><option disabled>36 x 32</option></select></main>'));
 assert.equal(evidence.models[0]?.heightCm,186);assert.equal(evidence.models[0]?.size,'32 x 32');assert.deepEqual(evidence.sizes,['24 x 32','32 x 32','34 x 32']);assert.ok(evidence.fit.includes('baggy'));assert.match(evidence.sourceHTML,/32 x 32/);
 const input=inputForReview({...page,name:'Astro Jeans',charts:[],evidence},null,profile,[]);assert.equal(input.decision.canSelectSize,true);
 const review=validateReview({...result,size:'34 x 32',summary:'I would try W34 L32 based on your usual waist label and the similarly tall model wearing L32.'},null,input);
 assert.equal(review.size,'34 x 32');assert.equal(review.basis,'estimate');assert.deepEqual(review.ratings,[]);assert.match(review.limitations.join(' '),/Model height/);
});
test('Source fallback excludes scripts, credentials, account fields and recommendations and stays bounded',()=>{
 const evidence=collectProductEvidence(doc('<header>PRIVATE ACCOUNT</header><main><h1>Jeans</h1><input value="SECRET"><textarea>PRIVATE NOTE</textarea><script>const token="AUTH_SECRET";size=34</script><p data-token="ATTR_SECRET" onclick="secret()">The model is 186 cm tall and is wearing size 32 x 32</p><div class="recommendations">Model is 170 cm tall and is wearing size 24 x 30</div><p>'+('Fit description '.repeat(2000))+'</p></main>'));
 assert.doesNotMatch(evidence.sourceHTML,/SECRET|PRIVATE|onclick|data-token|170 cm/);assert.equal(evidence.models.length,1);assert.ok(evidence.sourceHTML.length<=12060);
});
test('Product JSON-LD supplies hidden size variants without leaking arbitrary script data or splitting XL',()=>{
 const evidence=collectProductEvidence(doc('<main><h1>Box Hoodie</h1><select><option>XS</option><option>XL</option></select></main><script type="application/ld+json">'+JSON.stringify({'@type':'ProductGroup',name:'Box Hoodie',description:'The model is 186 cm tall and wears size XL. Loose fit.',token:'SECRET',hasVariant:[{size:'XL',account:'PRIVATE'},{size:'XXL'}],isRelatedTo:{'@type':'Product',name:'Other Hoodie',size:'S'}})+'</script>'));
 assert.deepEqual(evidence.sizes,['XS','XL','XXL']);assert.equal(evidence.models[0]?.size,'XL');assert.match(evidence.sourceHTML,/Product JSON-LD fields/);assert.doesNotMatch(evidence.sourceHTML,/SECRET|PRIVATE|Other Hoodie/);
});

test('Known good-fit W/L wins over generic upsizing; incompatible only option is never recommended',()=>{
 const evidence={sizes:['29 x 32','33 x 32','34 x 32'],models:[],fit:['baggy'],sourceHTML:''};
 const jeans={...page,name:'Astro Jeans',charts:[],evidence};
 const known={url:'https://other.test/jeans',name:'Known jeans',category:'trousers' as const,product:null,size:'33 x 32',reason:'Perfect',savedAt:1};
 const input=inputForReview(jeans,null,profile,[],'',[known]);
 assert.deepEqual(input.decision.eligibleSizes,['33 x 32']);
 assert.equal(validateReview({...result,size:'34 x 32'},null,input).size,'33 x 32');
 const only=inputForReview({...jeans,evidence:{...evidence,sizes:['29 x 32']}},null,profile,[]);
 assert.equal(validateReview({...result,size:'29 x 32'},null,only).size,null);
});
test('SCRT Odessa transposed waist/length table supplies usable sizes even without a width convention',()=>{
 const odessa={url:'https://shop.test/odessa',name:'Odessa Pleated Selvedge Jeans - Blackout',text:"Wide fit with slight bootcut. The model is 6'1 and wears size 32.",charts:[{text:';26;28;30;32;34;36\nWAIST (CM);36;38.5;41;43.5;46;48.5\nLENGTH (CM);99;101;103;105;107;108\nTHIGH (CM);28;29;30;31;32;33',context:'Sizing. Model wearing size 32 (inches).'}]};
 const input=inputForReview(odessa,null,profile,[]);
 assert.equal(input.product.measurementTables.length,1);assert.equal(input.product.measurementTables[0]?.unit,'cm');assert.equal(input.product.measurementTables[0]?.rows[4][1],'46');assert.deepEqual(input.decision.eligibleSizes,['26','28','30','32','34','36']);assert.equal(input.decision.canSelectSize,true);
 const review=validateReview({...result,size:'34',summary:'I would try 34 using your usual waist label, with the chart’s width convention still uncertain.'},null,input);assert.equal(review.size,'34');assert.ok(review.limitations.some(s=>s.includes('chart values were read')));
 const stored=recordScan([],odessa,null)[0];assert.equal(stored.measurementTables[0]?.rows[4][2],'107');assert.deepEqual(stored.measurements,[],'Unknown circumference convention must not become verified cm');
 assert.throws(()=>validateReview({...result,size:null,summary:"The model note (6'1",checks:{width:'',length:'',sleeves:''}},null,input),/incomplete fit explanations/);
});
