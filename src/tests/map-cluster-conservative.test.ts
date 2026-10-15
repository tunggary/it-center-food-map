import { expect, it } from 'vitest';
import { clusterPins, type ScreenPin } from '../lib/map-clusters';
const pin = (id: string, x: number, y = 100, width = 100): ScreenPin => ({ id, x, y, width, height: 34 });
const measure = () => ({ width: 120, height: 36 });

it('splits on a modest zoom once less than 50% of the label remains hidden', () => {
  expect(clusterPins([pin('a', 0), pin('b', 12)], measure)).toHaveLength(1);
  expect(clusterPins([pin('a', 0), pin('b', 25)], measure)).toHaveLength(1);
  expect(clusterPins([pin('a', 0), pin('b', 60)], measure)).toHaveLength(2);
});
it('does not merge a lightly overlapping chain into one cluster', () => {
  const groups = clusterPins([pin('a', 0), pin('b', 75), pin('c', 150)], measure);
  expect(groups).toHaveLength(3);
});
it('rechecks the displayed badge against a remaining pin after the initial grouping', () => {
  const groups = clusterPins([pin('a', 0), pin('b', 35), pin('c', 70)], measure);
  expect(groups.map(g => g.ids)).toEqual([['a', 'b', 'c']]);
});
it('merges a separate pin when the generated badge covers at least half its label', () => {
  const groups = clusterPins([pin('a', 0, 100, 10), pin('b', 1, 100, 10), pin('c', 50, 100, 10)], () => ({ width: 200, height: 36 }));
  expect(groups.map(g => g.ids)).toEqual([['a', 'b', 'c']]);
});
it('uses an inclusive 50% area threshold including vertical overlap and unequal widths', () => {
  expect(clusterPins([pin('a', 0), pin('b', 50)], measure)).toHaveLength(1);
  expect(clusterPins([pin('a', 0), pin('b', 51)], measure)).toHaveLength(2);
  expect(clusterPins([pin('a', 0), pin('b', 0, 118)], measure)).toHaveLength(2);
  expect(clusterPins([pin('a', 0, 100, 220), pin('b', 50, 100, 80)], measure)).toHaveLength(1);
});
