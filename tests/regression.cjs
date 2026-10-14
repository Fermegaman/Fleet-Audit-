// Compare the reorganization with the original behavior using an isolated workspace.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
function load(dir,saved){
 const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},click(){},querySelectorAll(){return []},querySelector(){return el('dummy')},appendChild(){},remove(){}});return elements.get(id)}
 const seed=html.match(/<script id="seed" type="application\/json">([\s\S]*?)<\/script>/);
 if(seed)el('seed').textContent=seed[1];
 const storage={};if(saved)storage.FleetAuditHub_v3=saved;
 const context=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[],querySelector:()=>el('dummy'),createElement:()=>el('new'),baseURI:'file:///app/index.html'},localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v},console,Intl,URL,Blob,Date:class extends Date{constructor(...a){super(...(a.length?a:['2026-10-14T12:00:00Z']))}static now(){return 1791979200000}},crypto:{randomUUID:()=> 'stable-test-id'},alert(){},prompt:()=>null,confirm:()=>true});
 context.window=context;
 for(const m of html.matchAll(/<script src="([^"]+)"><\/script>/g))vm.runInContext(fs.readFileSync(path.join(dir,m[1]),'utf8'),context,{filename:m[1]});
 return {context,run:s=>vm.runInContext(s,context),el};
}
const baseline=process.argv[2];
if (!baseline) throw new Error('Pass the extracted original project directory as the first argument.');
const target=path.resolve(__dirname,'..');
function pair(saved){return [load(baseline,saved),load(target,saved)]}
function same(apps,code,label){const out=apps.map(a=>JSON.stringify(a.run(code)));assert.equal(out[1],out[0],label);console.log('PASS',label)}
let apps=pair();same(apps,'state','initial migrations and workbook data');
for(const name of apps[0].run('Object.keys(views)')){
 for(const a of apps)a.run(`go('${name}')`);
 assert.equal(apps[1].el('content').innerHTML.replace(/data-layout="([^"]*)"/g,(_,n)=>'style="'+({'space-bottom-12':'margin-bottom:12px','space-top-10':'margin-top:10px','space-top-12':'margin-top:12px','space-top-14':'margin-top:14px','actions-right':'margin-top:14px;text-align:right','source-details':'white-space:pre-wrap;margin:0'}[n])+'"'),apps[0].el('content').innerHTML,name);
 console.log('PASS render',name);
}
for(const text of ['VIN,Description,Amount\r\nABC,"hello, world",12','VIN;Description;Amount\nABC;"line\nnext";20','VIN\tDescription\tAmount\nABC\ttoll\t-3','\uFEFFVIN,Description\nABC,"a""b"'])same(apps,`csvRows(${JSON.stringify(text)})`,'CSV delimiters and quoting');
const fleetExports=[
 [['vin','vehicleName','status','operationalStatus'],['TESTVIN12345678901','Test van','ACTIVE','GROUNDED']],
 [['vin','vehicleName','status','operationalStatus'],['TESTVIN12345678901','Updated van','ACTIVE','OPERATIONAL']],
 [['vin','vehicleName','status','operationalStatus'],['TESTVIN12345678901','Updated van','INACTIVE','GROUNDED']]
];
for(const rows of fleetExports){same(apps,`importFleetRows(${JSON.stringify(rows)}); state`,'Amazon VIN reconciliation and status transitions');}
same(apps,`elementRecordValues({'VIN':'TESTVIN12345678901','Maintenance':'120','Ticket / Toll':'20','Lease':'200','Total Unit Charges':'340'})`,'Element charge categorization');
for(const a of apps)a.run(`state.activeElementAuditByClient[currentClientId]=Object.assign(createEmptyElementAuditDraft('October 2026'),{invoiceDate:'2026-10-01',invoiceNumber:'TEST-1',sourceInvoiceTotal:'340',elementRecords:[elementRecordValues({'VIN':'TESTVIN12345678901','Maintenance':'120','Ticket / Toll':'20','Lease':'200','Total Unit Charges':'340'})]});`);
same(apps,'elementSummary(currentElementAudit())','Element totals');same(apps,'elementAuditReconciliation(currentElementAudit())','invoice reconciliation');
same(apps,'ensureMaintenanceReviewFromElement(currentElementAudit())','maintenance review generation');same(apps,'ensureTollReviewFromElement(currentElementAudit())','toll review generation');
same(apps,`matchMaintenanceReviewRecords([{VIN:'TESTVIN12345678901','Element Charge':120,'Reviewed Amount':100,'Review Status':'Approved'}]); currentElementAudit()`,'maintenance review matching');
same(apps,`matchTollReviewRecords([{VIN:'TESTVIN12345678901','Element Charge':20,'Reviewed Amount':10,'Review Status':'Approved'}]); currentElementAudit()`,'toll review matching');
same(apps,'saveCurrentElementAudit(currentElementAudit(),false); state','save audit history');
for(const a of apps)a.run('save()');
const saved=apps[0].run('localStorage.getItem(KEY)');apps=pair(saved);same(apps,'state','reload saved workspace');
same(apps,'JSON.stringify(currentElementAudit())','restore current audit');
for(const root of [target])for(const file of walk(root).filter(p=>p.endsWith('.js')))new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])}
console.log('PASS syntax for every JS file');
