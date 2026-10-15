import { expect, it } from 'vitest';
import { clusterPins, type ScreenPin } from '../lib/map-clusters';
const pin = (id: string, x: number): ScreenPin => ({ id, x, y: 100, width: 10, height: 34 });
const twoPairs = (distance: number) => [pin('a', 0), pin('b', 1), pin('c', distance), pin('d', distance + 1)];
const measure = () => ({ width: 120, height: 36 });

it('merges two resulting cluster badges at 50% coverage but leaves lighter overlap alone', () => {
  expect(clusterPins(twoPairs(60), measure).map(g => g.ids)).toEqual([['a', 'b', 'c', 'd']]);
  expect(clusterPins(twoPairs(61), measure).map(g => g.ids)).toEqual([['a', 'b'], ['c', 'd']]);
});
it('rechecks the resized and recentered badge until no further 50% overlap remains', () => {
  const pins = [...twoPairs(50), pin('e', 120), pin('f', 121)];
  const measureGrowing = (count: number) => ({ width: count >= 4 ? 240 : 120, height: 36 });
  const result = clusterPins(pins, measureGrowing);
  expect(result.map(g => g.ids)).toEqual([['a', 'b', 'c', 'd', 'e', 'f']]);
  expect(result[0].x).toBe(343 / 6);
  expect(result).toEqual(clusterPins([...pins].reverse(), measureGrowing));
});
it('starts from originals on zoom, so previously merged badges separate again', () => {
  expect(clusterPins(twoPairs(50), measure)).toHaveLength(1);
  expect(clusterPins(twoPairs(100), measure)).toHaveLength(2);
});
it('never absorbs a selected detail pin into a badge, including at identical coordinates', () => {
  const pins = [pin('a', 0), pin('b', 0), pin('c', 0)];
  expect(clusterPins(pins, measure, 'b').map(g => g.ids)).toEqual([['a', 'c'], ['b']]);
});
