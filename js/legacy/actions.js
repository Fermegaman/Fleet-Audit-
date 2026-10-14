/** Historical follow-up actions. */
function actions(){
 setTitle('Open Actions','A single place for disputes, missing documents and follow-ups.');
 $('content').innerHTML='<div class="panel"><div class="toolbar"><button class="btn" onclick="addAction()">+ Add action</button></div>'+
 (state.actions.length?'<div class="table"><table><thead><tr><th>Client</th><th>Area</th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>'+
 state.actions.map((a,i)=>'<tr><td>'+esc(a.client)+'</td><td>'+esc(a.area)+'</td><td>'+esc(a.action)+'</td><td>'+esc(a.owner)+'</td><td>'+esc(a.due)+'</td><td>'+esc(a.status)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">No open actions.</div>')+'</div>';
}
function addAction(){
 const action=prompt('What needs to be done?');if(!action)return;
 const area=prompt('Area (Element, LeasePlan, Grounded, Rental, etc.):')||'';
 const owner=prompt('Owner:')||'';const due=prompt('Due date:')||'';
 state.actions.push({client:'AGPL',area,action,owner,due,status:'Open'});save();actions();
}
