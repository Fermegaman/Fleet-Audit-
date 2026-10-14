/** Historical fleet form and CSV upload. */
function fleet(){
 setTitle('Fleet & Grounded','Upload a fresh fleet export or add/update a grounded record.');
 $('content').innerHTML='<div class="grid2"><div class="panel"><h3>Import</h3><div class="drop">Choose a CSV fleet export<br><input id="fleetFile" type="file" accept=".csv"></div>'+
 '<div class="notice">For this version, CSV import is supported directly in the browser. If your Amazon download is XLSX, save/export that sheet as CSV first. The production version should accept XLSX directly.</div></div>'+
 '<div class="panel"><h3>Add grounded vehicle</h3>'+form([
 ['van','Van #'],['vin','VIN'],['date','Date Grounded'],['issue','Repair / Issue'],['location','Location'],['status','Repair Status'],['notes','Notes']
 ],'addGrounded')+'</div></div>'+
 '<div class="panel" style="margin-top:14px"><h3>Branded Fleet</h3>'+tbl(data('Branded Fleet'),300)+'</div>'+
 '<div class="panel" style="margin-top:14px"><h3>Grounded Vans</h3>'+tbl(data('Van Info'),300)+'</div>';
 $('fleetFile').addEventListener('change',e=>importCSV(e.target.files[0],'Branded Fleet'));
}
function form(fields,fn){
 return '<div class="formgrid">'+fields.map(f=>'<div class="field"><label>'+esc(f[1])+'</label><input id="f_'+esc(f[0])+'"></div>').join('')+
 '<div class="field full"><button class="btn" onclick="'+fn+'()">Save</button></div></div>';
}
function addGrounded(){
 const vals=['van','vin','date','issue','location','status','notes'].map(k=>$('f_'+k).value);
 const a=data('Van Info'); if(!a.length)return;
 a.push([vals[0],vals[1],vals[2],vals[3],'',vals[4],'',vals[5],vals[6],'','']); save(); fleet();
}
function importCSV(file,sheetName){
 if(!file)return;
 const r=new FileReader();r.onload=()=>{const text=r.result.replace(/\\r/g,'');const lines=text.split('\\n').filter(x=>x.trim());const parsed=lines.map(line=>{let out=[],cur='',q=false;for(let i=0;i<line.length;i++){let ch=line[i];if(ch==='\"'){if(q&&line[i+1]==='\"'){cur+='\"';i++}else q=!q}else if(ch===','&&!q){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out});state.sheets[sheetName]=parsed;save();fleet();};r.readAsText(file);
}
