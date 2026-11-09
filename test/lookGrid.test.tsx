// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/preact';
import { h } from 'preact';
import { Ctx } from '../src/app';
import { LookGrid } from '../src/ui/home/LookGrid';
import { Look } from '../src/engine/model';

const looks: Look[] = [
  {
    id: 'l1',
    name: 'Warm White',
    emoji: '☀️',
    category: 'Everyday',
    l: [{ t: { kind: 'all' }, e: ['Solid'], p: [], c: [[255, 200, 100]], s: 128, i: 128 }],
  },
  {
    id: 'l2',
    name: 'Twinkle',
    emoji: '✨',
    category: 'Party',
    l: [{ t: { kind: 'all' }, e: ['Twinkle'], p: [], c: [[255, 0, 0]], s: 128, i: 128 }],
  },
];

const mockCtx = {
  settings: { activeLookId: 'l1' },
  store: {},
  client: {},
  snapshot: null,
  offline: false,
  refresh: () => {},
  toast: () => {},
  applyLook: async () => {},
  setLights: async () => {},
  propSync: {},
  saveSchedule: async () => {},
  go: () => {},
  back: () => {},
} as any;

describe('LookGrid', () => {
  it('renders all looks', () => {
    render(
      h(
        Ctx.Provider,
        { value: mockCtx },
        h(LookGrid, { looks, onPick: () => {}, onEdit: () => {} })
      )
    );
    expect(screen.getByText('Warm White')).toBeTruthy();
    expect(screen.getByText('Twinkle')).toBeTruthy();
  });

  it('calls onPick when tile clicked', () => {
    const onPick = vi.fn();
    render(h(Ctx.Provider, { value: mockCtx }, h(LookGrid, { looks, onPick, onEdit: () => {} })));
    fireEvent.click(screen.getByText('Warm White'));
    expect(onPick).toHaveBeenCalledWith(looks[0]);
  });
});
