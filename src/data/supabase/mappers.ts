import type { Advisor, Client, Decision, MarketViewVersion, Position, Review } from '@/domain/schemas';

export type DbRow = Record<string, any>;
export const advisorId = (r: DbRow) => r['advisor_name'] ? `${r['advisor_name']}|${r['advisor_email'] || ''}` : 'unassigned';
export function mapClient(r: DbRow): Client {
  return { id: r['id'], name: r['name'], segment: r['segment'], sector: r['sector'] || undefined, advisorId: advisorId(r), reviewDay: r['review_day'] ?? 0, isDemo: false, liquidityNote:r['liquidity_note']||undefined,horizonMonths:r['horizon_months'],updatedAt: r['updated_at'] };
}
export function mapAdvisors(rows: DbRow[]): Advisor[] {
  return [...new Map(rows.map(r => [advisorId(r), { id: advisorId(r), name: r['advisor_name'] || 'Sin asignar', email: r['advisor_email'] || '' }])).values()];
}
export function mapMarket(r: DbRow, index: number): MarketViewVersion {
  let content: DbRow = {}; try { const parsed = JSON.parse(r['body']); if (parsed.schema === 'agenda-market-v1') content = parsed; } catch { /* lectura escrita en texto */ }
  return { id: r['id'], marketViewId: 'agenda-market', version: index + 1, title: r['title'], summary: content['summary'] || r['body'].slice(0, 400), body: content['body'] || r['body'], author: content['author'] || 'Amauta', publishedAt: r['created_at'] };
}
export function mapPosition(r: DbRow): Position {
  const metadata = decode(r['summary']);
  const match = r['drive_url']?.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)/);
  return { id: r['id'], clientId: r['client_id'], alyc: r['broker'], cutoffDate: r['as_of'], drivePdf: match ? { fileId: match[1], fileName: metadata['fileName'] || (r['summary'] && !r['summary'].startsWith('{') ? r['summary'] : 'PDF de posición') } : null, sourceNote: metadata['sourceNote'] || undefined, items: r['details'], declaredTotals: Array.isArray(r['totals']) ? r['totals'] : Object.entries(r['totals'] || {}).map(([currency, amount]) => ({ currency, amount })) } as Position;
}
export function mapReview(r: DbRow, markets: MarketViewVersion[], previous: string | null): Review {
  const meta = decode(r['conclusion']);
  let decision: Decision;
  if (meta['schema'] === 'agenda-review-v1') decision = meta['decision'];
  else if (r['decision'] === 'maintain') decision = { type: 'mantener', nota: r['note'] };
  else if (r['decision'] === 'propose') decision = { type: 'proponer_cambio', propuesta: r['proposed_change'], fundamentoHorizonte: r['horizon_liquidity_reason'], fundamentoLiquidez: r['horizon_liquidity_reason'], validacionAsesor: 'pendiente', datoReconsiderar: r['reconsider_if'] };
  else decision = { type: 'falta_informacion', informacionFaltante: r['note'], fechaLimite: r['reviewed_at'].slice(0, 10) };
  const market = markets.find(v => v.id === r['market_version_id']);
  const snap = r['market_snapshot'] || {};
  const frozen = snap['body'] ? mapMarket({ id: snap['id'], title: snap['title'], body: snap['body'], created_at: snap['created_at'] }, market ? market.version - 1 : 0) : market;
  if (!frozen && r['market_version_id']) throw new Error('La revisión no conserva una visión de mercado válida.');
  return { id: r['id'], clientId: r['client_id'], month: r['period'].slice(0, 7), status: 'cerrada', positionId: r['position_id'], previousConclusion: meta['previousConclusion'] ?? previous, decision, marketViewSnapshot: frozen ? { versionId: frozen.id, version: frozen.version, title: frozen.title, summary: frozen.summary, body: frozen.body, publishedAt: frozen.publishedAt, capturedAt: meta['startedAt'] || r['reviewed_at'] } : null, startedAt: meta['startedAt'] || r['reviewed_at'], closedAt: r['reviewed_at'] };
}
export function decode(value: unknown): DbRow { if (typeof value !== 'string') return {}; try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
