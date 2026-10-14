/**
 * Parse comma, tab or semicolon exports, including quoted values and embedded line breaks. This is the effective parser from the original app.
 * Classic script module; shared services and state are loaded by index.html.
 */

function csvRows(text) {
  const allLines = String(text || '').split(/\r?\n/).filter(line => line.trim());
  const headerLine = allLines.find(line => /vin/i.test(line) &&
    /charge|amount|cost|description|breakdown|ticket|toll|maintenance|lease/i.test(line));
  const sampleLines = headerLine ? [headerLine] : allLines.slice(0, 12);
  const delimiters = [',', '\t', ';'];
  const delimiter = delimiters.map(candidate => {
    const count = sampleLines.map(line => {
      let quoted = false;
      let lineCount = 0;
      for (let index = 0; index < line.length; index++) {
        if (line[index] === '"') {
          if (quoted && line[index + 1] === '"') index++;
          else quoted = !quoted;
        } else if (line[index] === candidate && !quoted) lineCount++;
      }
      return lineCount;
    }).sort((left, right) => right - left)[0] || 0;
    return { delimiter: candidate, count };
  }).sort((left, right) => right.count - left.count)[0].delimiter;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      if (row.some(value => String(value).trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(value => String(value).trim())) rows.push(row);
  }
  return rows;
}
