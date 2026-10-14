/** Historical workbook sheet browser. */
function legacy(){
 setTitle('Original Data','The original workbook data is preserved here while the new modules are being built.');
 const names=Object.keys(seed);$('content').innerHTML='<div class="tabs">'+names.map((n,i)=>'<button data-i="'+i+'">'+esc(n)+'</button>').join('')+'</div><div id="legacyPanel"></div>';
 document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('legacyPanel').innerHTML=tbl(seed[names[+b.dataset.i]])}));
 document.querySelector('.tabs button').click();
}
