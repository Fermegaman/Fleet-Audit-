/** Historical client list and creation. */
function clients(){
 setTitle('Clients','One client registry instead of one workbook per client.');
 $('content').innerHTML='<div class="panel"><div class="toolbar"><button class="btn" onclick="addClient()">+ Add client</button></div>'+
 '<div class="table"><table><thead><tr><th>Short Code</th><th>Company</th><th>Station</th><th>Status</th></tr></thead><tbody>'+
 state.clients.map((c,i)=>'<tr><td>'+esc(c.shortCode)+'</td><td>'+esc(c.company)+'</td><td>'+esc(c.station)+'</td><td>'+esc(c.status)+'</td></tr>').join('')+
 '</tbody></table></div></div>';
}
function addClient(){
 const short=prompt('Client short code (example: AGPL):'); if(!short)return;
 const company=prompt('Company name:')||short;
 const station=prompt('Station code:')||'';
 state.clients.push({shortCode:short.toUpperCase(),company,station,status:'Active'}); save(); clients();
}
