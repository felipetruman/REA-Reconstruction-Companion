import readline from 'node:readline';
// Match Python str.strip whitespace, including U+001C–U+001F and excluding BOM.
const strip = s => s.replace(/^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g, '');
function normalize(input) {
  const fail = error => ({ok:false,error});
  if (input === null || typeof input !== 'object' || Array.isArray(input) || typeof input.text !== 'string') return fail('TYPE');
  const parts = input.text.split(';').map(strip).filter(Boolean);
  if (parts.length > 8) return fail('COUNT');
  const values = new Map();
  for (const part of parts) {
    const pair = part.split('=');
    if (pair.length !== 2) return fail('PAIR');
    const key = strip(pair[0]), number = strip(pair[1]);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,7}$/.test(key)) return fail('KEY');
    if (!/^[+-]?[0-9]{1,4}$/.test(number)) return fail('NUMBER');
    const value = Number(number);
    if (value < -999 || value > 999) return fail('RANGE');
    values.set(key.toUpperCase(), value || 0);
  }
  const items = [...values].sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return {ok:true,items,sum:items.reduce((s,[k,v])=>s+v,0),weight:items.reduce((s,[k,v])=>s+(k.length+1)*v,0)};
}
const lines = readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await (const line of lines) {
  try { process.stdout.write(JSON.stringify(normalize(JSON.parse(line)))+'\n'); }
  catch { process.stdout.write('{"ok":false,"error":"TYPE"}\n'); }
}
