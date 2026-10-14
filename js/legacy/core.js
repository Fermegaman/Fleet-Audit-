/** Shared state and helpers for the historical prototype. */
/** Historical v3 prototype behavior. The maintained application starts at index.html. */
const seed=WORKBOOK_SEED;
const KEY='FleetAuditHub_v3';
let saved;
try{saved=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){saved=null}
const state=saved||{
 clients:[{shortCode:'AGPL',company:'Angell Parcel & Logistics, LLC',station:'DDA9',status:'Active'}],
 actions:[], elementAudits:[], leaseAudits:[],
 sheets:seed
};
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function save(){localStorage.setItem(KEY,JSON.stringify(state))}
function setTitle(t,s){$('title').textContent=t;$('subtitle').textContent=s}
function data(name){return state.sheets[name]||[]}
function rows(name){return data(name).slice(1)}
function tbl(a,limit=500){
 if(!a||!a.length)return '<div class="empty">No records yet.</div>';
 const h=a[0]||[], d=a.slice(1,limit+1);
 return '<div class="table"><table><thead><tr>'+h.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+
 d.map(r=>'<tr>'+h.map((_,i)=>'<td>'+esc(r&&r[i])+'</td>').join('')+'</tr>').join('')+
 '</tbody></table></div>';
}
