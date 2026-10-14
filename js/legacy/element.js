/** Historical Element checklist and save action. */
function element(){
 setTitle('Element Invoice Audit','Upload the source files, then work through the SOP checklist.');
 $('content').innerHTML='<div class="grid2"><div class="panel"><h3>1. Source files</h3><div class="drop">Element PDF<br><input type="file" accept=".pdf"></div><br><div class="drop">Element CDV / CSV<br><input type="file" accept=".csv,.txt,.cdv"></div><div class="notice">The production build will read these files automatically. For now this screen is the workflow/checklist.</div></div><div class="panel"><h3>2. Audit checklist</h3>'+
 check(['Invoice ready by the 1st','Fleet export uploaded','Element invoice data processed','VIN matched to fleet','Amazon Lease / Amazon owned identified','Charges summarized','VIN-level review completed','Client review sent by the 15th','Maintenance charges sent to Element and marked pending'])+'</div></div>'+
 '<div class="panel" style="margin-top:14px"><h3>3. Audit record</h3>'+form([['month','Invoice Month'],['total','Invoice Total'],['status','Status'],['notes','Notes']],'saveElement')+'</div>';
}
function saveElement(){const o={client:'AGPL',month:$('f_month').value,total:$('f_total').value,status:$('f_status').value,notes:$('f_notes').value};state.elementAudits.push(o);save();alert('Element audit saved.');go('dashboard')}
