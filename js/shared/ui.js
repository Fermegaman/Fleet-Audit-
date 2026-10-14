/**
 * Build the small tables, forms and checklists reused across pages.
 * Classic script module; shared services and state are loaded by index.html.
 */

function setTitle(title, subtitle) {
  $('title').textContent = title;
  $('subtitle').textContent = subtitle;
}

function table(headers, records, rowRenderer, limit = 500) {
  if (!records.length) return '<div class="empty">No records yet.</div>';
  return '<div class="table"><table><thead><tr>' +
    headers.map(header => '<th>' + esc(header) + '</th>').join('') +
    '</tr></thead><tbody>' +
    records.slice(0, limit).map(rowRenderer).join('') +
    '</tbody></table></div>';
}

function workbookTable(sheet, limit = 500) {
  if (!sheet || !sheet.length) return '<div class="empty">No records yet.</div>';
  const headers = sheet[0] || [];
  return table(headers, sheet.slice(1, limit + 1), row =>
    '<tr>' + headers.map((_, index) => '<td>' + esc(row && row[index]) + '</td>').join('') + '</tr>',
    limit
  );
}

function form(fields, handler) {
  return '<div class="formgrid">' + fields.map(([key, label]) =>
    '<div class="field"><label>' + esc(label) + '</label><input id="f_' + esc(key) + '"></div>'
  ).join('') + '<div class="field full"><button class="btn" onclick="' + handler + '()">Save</button></div></div>';
}

function check(items) {
  return '<div class="check">' + items.map(item => '<label><input type="checkbox"> ' + item + '</label>').join('') + '</div>';
}
