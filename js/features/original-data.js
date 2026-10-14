/**
 * Browse the original workbook sheets for the selected client.
 * Classic script module; shared services and state are loaded by index.html.
 */

function legacy() {
  setTitle('Original Data', 'The original workbook data is preserved here while the new modules are being built.');
  const names = Object.keys(seed);
  $('content').innerHTML = '<div class="tabs">' + names.map((name, index) =>
    '<button data-i="' + index + '">' + esc(name) + '</button>'
  ).join('') + '</div><div id="legacyPanel"></div>';
  document.querySelectorAll('.tabs button').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    $('legacyPanel').innerHTML = workbookTable(clientSheet(names[Number(button.dataset.i)]));
  }));
  document.querySelector('.tabs button').click();
}
