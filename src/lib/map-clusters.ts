export type ScreenPin = { id: string; x: number; y: number; width: number; height: number };
export type PinCluster = Omit<ScreenPin, 'id'> & { ids: string[] };
export type Size = { width: number; height: number };
export const clusterLabel = (count: number) => `장소·코스 ${count}개`;
const MIN_LABEL_OVERLAP = .5;

function mostlyCovered(a: Omit<ScreenPin, 'id'>, b: Omit<ScreenPin, 'id'>): boolean {
  const width = Math.max(0, Math.min(a.x + a.width / 2, b.x + b.width / 2) - Math.max(a.x - a.width / 2, b.x - b.width / 2));
  const height = Math.max(0, Math.min(a.y - a.height * .2, b.y - b.height * .2) - Math.max(a.y - a.height * 1.2, b.y - b.height * 1.2));
  return width * height / Math.min(a.width * a.height, b.width * b.height) + Number.EPSILON >= MIN_LABEL_OVERLAP;
}

// Rebuild from originals on every zoom; selected detail pins stay separate in both passes.
export function clusterPins(pins: ScreenPin[], measure: (count: number) => Size, selectedId?: string): PinCluster[] {
  const groups: ScreenPin[][] = [];
  for (const pin of [...pins].sort((a, b) => a.id.localeCompare(b.id))) {
    if (pin.id === selectedId) { groups.push([pin]); continue; }
    const group = groups.find(members => members[0].id !== selectedId && members.every(member => mostlyCovered(member, pin)));
    if (group) group.push(pin); else groups.push([pin]);
  }
  const clusters = groups.map(members => {
    const size = members.length === 1 ? members[0] : measure(members.length);
    return { ids: members.map(pin => pin.id), x: members.reduce((sum, pin) => sum + pin.x, 0) / members.length, y: members.reduce((sum, pin) => sum + pin.y, 0) / members.length, width: size.width, height: size.height };
  });
  while (true) {
    let merged = false;
    outer: for (let a = 0; a < clusters.length; a++) {
      if (clusters[a].ids[0] === selectedId) continue;
      for (let b = a + 1; b < clusters.length; b++) {
        if (clusters[b].ids[0] === selectedId || !mostlyCovered(clusters[a], clusters[b])) continue;
        const first = clusters[a], second = clusters[b], ids = [...first.ids, ...second.ids].sort();
        clusters[a] = {
          ids,
          x: (first.x * first.ids.length + second.x * second.ids.length) / ids.length,
          y: (first.y * first.ids.length + second.y * second.ids.length) / ids.length,
          ...measure(ids.length),
        };
        clusters.splice(b, 1);
        merged = true;
        break outer;
      }
    }
    if (!merged) return clusters;
  }
}
