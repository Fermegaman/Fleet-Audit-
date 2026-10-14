/** Historical dashboard cards and page. */
function cards(){
 const fleet=Math.max(0,rows('Branded Fleet').length), ground=Math.max(0,rows('Van Info').length),
 rentals=Math.max(0,rows('Rental Tracker').length), actions=state.actions.length;
 return '<div class="cards">'+
 '<div class="card"><div class="muted">Fleet records</div><div class="num">'+fleet+'</div></div>'+
 '<div class="card"><div class="muted">Grounded records</div><div class="num">'+ground+'</div></div>'+
 '<div class="card"><div class="muted">Rental records</div><div class="num">'+rentals+'</div></div>'+
 '<div class="card"><div class="muted">Open actions</div><div class="num">'+actions+'</div></div></div>';
}
function dashboard(){
 setTitle('Dashboard','Your AGPL workbook, organized into one application.');
 $('content').innerHTML=cards()+
 '<div class="grid"><div class="panel"><h3>Start here</h3><div class="toolbar">'+
 '<button class="btn" onclick="go(\'fleet\')">Upload / update fleet</button>'+
 '<button class="btn" onclick="go(\'element\')">Element audit</button>'+
 '<button class="btn" onclick="go(\'leaseplan\')">LeasePlan audit</button>'+
 '<button class="btn secondary" onclick="go(\'clients\')">Manage clients</button></div>'+
 '<div class="notice"><b>How to use it:</b> Select a module on the left. You can add records with the blue “Add” buttons. Information is saved in this browser for this prototype.</div></div>'+
 '<div class="panel"><h3>Audit cadence</h3><p class="muted">Element: invoice ready by the 1st and client review by the 15th. LeasePlan: complete the invoice summary, VIN-level tables and completion status.</p></div></div>'+
 '<div class="panel" style="margin-top:14px"><h3>Current fleet</h3>'+tbl(data('Branded Fleet'),20)+'</div>';
}
