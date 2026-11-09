// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/preact';
import { h } from 'preact';
import { Ctx } from '../src/app';
import { PropCard } from '../src/ui/props/PropCard';

const mockCtx = {
  settings: {},
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
  guest: false,
} as any;

const prop = {
  id: 'p1',
  name: 'Path lights',
  kind: 'pathLights' as const,
  controllerId: 'c1',
  start: 0,
  count: 10,
  brightness: 100,
};

const outputs = [{ start: 0, len: 50 }];

describe('PropCard', () => {
  it('renders prop name and brightness', () => {
    render(
      h(
        Ctx.Provider,
        { value: mockCtx },
        h(PropCard, { prop, outputs, onChange: () => {}, onRemove: () => {} })
      )
    );
    expect(screen.getByDisplayValue('Path lights')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('calls onRemove when delete clicked', () => {
    const onRemove = vi.fn();
    render(
      h(
        Ctx.Provider,
        { value: mockCtx },
        h(PropCard, { prop, outputs, onChange: () => {}, onRemove })
      )
    );
    fireEvent.click(screen.getByTitle('Remove prop'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('calls onChange when name edited', () => {
    const onChange = vi.fn();
    render(
      h(
        Ctx.Provider,
        { value: mockCtx },
        h(PropCard, { prop, outputs, onChange, onRemove: () => {} })
      )
    );
    const input = screen.getByDisplayValue('Path lights') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'My lights' } });
    expect(onChange).toHaveBeenCalled();
  });
});
