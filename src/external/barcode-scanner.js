export class BarcodeScanner {
  normalize(value) {
    const barcode=String(value||'').trim().toUpperCase();
    if (barcode.length<4||barcode.length>64||/[\u0000-\u001f]/.test(barcode)) throw new Error('Scan or enter a valid barcode.');
    return barcode;
  }

  bind(input) {
    input?.focus();
    input?.select();
  }
}