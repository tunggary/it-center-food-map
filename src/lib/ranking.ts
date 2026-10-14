import type { Catalog, Filters } from '../../shared/contracts';

export const rankingTabs = [
  { id: 'all', label: '전체' }, { id: 'food', label: '맛집', category: '맛집' },
  { id: 'cafe', label: '카페', category: '카페' }, { id: 'walk', label: '산책코스', category: '산책' },
  { id: 'custom', label: '커스텀' },
] as const;
export type RankingTab = typeof rankingTabs[number]['id'];

export function rankingTab(params: URLSearchParams, catalog?: Catalog): RankingTab {
  const explicit = params.get('rankingTab');
  if (explicit) return rankingTabs.find(t => t.id === explicit)?.id ?? 'all';
  if (params.get('team')) return 'custom';
  const categoryId = params.get('category');
  if (!categoryId) return 'all';
  const name = catalog?.allCategories.find(c => c.id === categoryId)?.name;
  return rankingTabs.find(t => 'category' in t && t.category === name)?.id ?? 'custom';
}
export function rankingFilters(tab: RankingTab, params: URLSearchParams, catalog?: Catalog): Filters | null {
  if (tab === 'custom') return { teamId: params.get('team') || null, categoryId: params.get('category') || null };
  if (tab === 'all') return { teamId: null, categoryId: null };
  const selected = rankingTabs.find(t => t.id === tab);
  const category = selected && 'category' in selected ? catalog?.allCategories.find(c => c.name === selected.category) : undefined;
  return category ? { teamId: null, categoryId: category.id } : null;
}
export function rankingHomeQuery(params: URLSearchParams, catalog?: Catalog): string {
  const copy = new URLSearchParams(params);
  if (copy.has('rankingTab')) {
    const filters = rankingFilters(rankingTab(copy, catalog), copy, catalog);
    copy.set('team', filters?.teamId ?? ''); copy.set('category', filters?.categoryId ?? '');
  }
  copy.delete('rankingTab'); copy.delete('rankPage');
  return copy.toString();
}
