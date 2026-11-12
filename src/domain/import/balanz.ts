import type { PositionItem } from '@/domain/schemas';
export function arNumber(value: string) {
  const clean=value.trim();
  if (!/^(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?$/.test(clean)) throw Error('Importe no reconocido: '+value);
  return Number(clean.replace(/\./g,'').replace(',','.'));
}
export function parseBalanz(text: string) {
  if (!/BALANZ/i.test(text) || !/Posición consolidada|Posicion consolidada/i.test(text)) throw Error('El importador automático reconoce resúmenes de posición de Balanz. Para otro formato, usá la carga manual.');
  const date=text.match(/Fecha\s+resumen\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  const total=text.match(/\bTotal\s+\$\s*([\d.,]+)/);
  if (!date || !total) throw Error('No se identificaron la fecha o el total declarado. Revisá el PDF.');
  const pattern=/^([A-Z][A-Z0-9.]{0,15})\s+(.+?)\s+([\d.]+,\d{2})\s+[\d.,]+\s+\$\s*([\d.]+,\d{2})\s+\$\s*([\d.]+(?:,\d{2})?)\s*$/;
  const items:PositionItem[]=[];
  for(const line of text.split('\n')) {const m=line.trim().match(pattern);if(m)items.push({id:'pdf-'+items.length,instrument:m[2]!,ticker:m[1]!,currency:'ARS',quantity:arNumber(m[3]!),price:arNumber(m[4]!),marketValue:arNumber(m[5]!)});}
  if (!items.length) throw Error('No se reconocieron las filas de tenencias. No se importaron importes parciales.');
  const cashARS=text.match(/Pesos\s+\$\s*([\d.,]+)/),cashUSD=text.match(/D[oó]lares\s+USD\s*([\d.,]+)/),fx=text.match(/MEP\s+\$\s*([\d.,]+)/);
  if(cashARS) {const amount=arNumber(cashARS[1]!);items.push({id:'cash-ars',instrument:'Saldo en pesos',currency:'ARS',quantity:amount,price:1,marketValue:amount});}
  let conversion='';
  if(cashUSD) {if(!fx)throw Error('El PDF contiene dólares y no se identificó el MEP para conciliar el consolidado. Usá carga manual.');const amount=arNumber(cashUSD[1]!),rate=arNumber(fx[1]!);items.push({id:'cash-usd',instrument:'Saldo USD convertido a ARS al MEP del resumen',currency:'ARS',quantity:amount,price:rate,marketValue:Math.round(amount*rate*100)/100});conversion=`Saldo USD ${amount} convertido al MEP reportado de ARS ${rate}. Es una conversión calculada para comparar con el total consolidado; no es un saldo adicional.`;}
  const declared=arNumber(total[1]!),computed=items.reduce((sum,it)=>sum+it.marketValue,0),difference=Math.round((declared-computed)*100)/100;
  return {alyc:'Balanz',cutoffDate:`${date[3]}-${date[2]}-${date[1]}`,items,declaredTotals:[{currency:'ARS' as const,amount:declared}],sourceNote:`Extracción automática para verificar contra el PDF original. ${conversion} Diferencia declarado menos detalle: ARS ${difference}. No representa una validación del broker.`,difference};
}
