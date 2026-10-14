/** Historical LeasePlan checklist and save action. */
function leaseplan(){
 setTitle('LeasePlan / Wheels Audit','PDF summary → verification → completion.');
 $('content').innerHTML='<div class="panel"><h3>1. Invoice PDF</h3><div class="drop">Choose LeasePlan PDF<br><input type="file" accept=".pdf"></div><div class="notice">The production version will extract the five categories from the PDF. For now, enter/verify the amounts below.</div></div>'+
 '<div class="grid2" style="margin-top:14px"><div class="panel"><h3>2. Charge Summary</h3>'+form([['month','Invoice Month'],['lease','Lease Charges'],['maintenance','Maintenance Charges'],['tolls','Tolls'],['misc','Misc Charges'],['credit','Credits'],['total','PDF Total']],'saveLease')+'</div>'+
 '<div class="panel"><h3>3. SOP Checklist</h3>'+check(['Invoice exported / saved','Summary includes Lease, Maintenance, Tolls, Misc and Credit','Summary total matches PDF','Maintenance VINs / descriptions / costs reviewed','Toll VINs / amounts reviewed','Credits and Misc communicated','Lease charge count checked','Audit marked complete and client email sent'])+'</div></div>';
}
function saveLease(){let o={client:'AGPL'};['month','lease','maintenance','tolls','misc','credit','total'].forEach(k=>o[k]=$('f_'+k).value);state.leaseAudits.push(o);save();alert('LeasePlan audit saved.');go('dashboard')}
