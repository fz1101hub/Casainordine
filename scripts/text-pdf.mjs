// Usato dai test e dalla prova nel browser: niente file binari nel repository.
// Un PDF di una pagina con una riga di testo per voce, come quelli dei negozi e dei fornitori.
// € è 0x80 in WinAnsiEncoding: senza questa conversione diventava «¬».
const escapePdf = line => line.replace(/[\\()]/g, m => '\\' + m).replace(/€/g, '\\200');
export function textPdf(lines) {
  return pdfWith('BT /F1 12 Tf 50 780 Td 16 TL ' + lines.map(line => `(${escapePdf(line)}) '`).join(' ') + ' ET');
}
// Due colonne: ogni riga ha un testo a sinistra (x 50) e uno a destra (x 320) alla stessa altezza,
// come le intestazioni «Scadenza | Totale da pagare» di molte bollette.
export function columnsPdf(rows) {
  const parts = rows.map(([left, right], i) => {
    const y = 780 - i * 18;
    return `BT /F1 11 Tf 50 ${y} Td (${escapePdf(left)}) Tj ET` + (right ? ` BT /F1 11 Tf 320 ${y} Td (${escapePdf(right)}) Tj ET` : '');
  });
  return pdfWith(parts.join(' '));
}
function pdfWith(content) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`];
  let out = '%PDF-1.4\n'; const offsets = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}
