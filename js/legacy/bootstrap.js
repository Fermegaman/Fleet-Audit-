/** Historical navigation and startup. Load this file last. */
const views={dashboard,clients,fleet,rentals,maintenance,invoices,fif,tolls,pave,recalls,element,leaseplan,actions,legacy};
function go(v){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));views[v]()}
document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
go('dashboard');
