// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/preact';
import { ColorRow } from '../src/ui/lookEditor/ColorRow';

const colors = [
  { name: 'Red', rgb: [255, 0, 0] as [number, number, number] },
  { name: 'Green', rgb: [0, 255, 0] as [number, number, number] },
  { name: 'Blue', rgb: [0, 0, 255] as [number, number, number] },
];

describe('ColorRow', () => {
  it('renders title and color dots', () => {
    render(<ColorRow title="Colors" colors={colors} selected={[]} onToggle={() => {}} />);
    expect(screen.getByText('Colors')).toBeTruthy();
  });

  it('marks selected colors', () => {
    render(
      <ColorRow title="Colors" colors={colors} selected={[[255, 0, 0]]} onToggle={() => {}} />
    );
    const btns = screen.getAllByRole('button');
    expect(btns[0].textContent).toBe('✓');
    expect(btns[1].textContent).toBe('');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<ColorRow title="Colors" colors={colors} selected={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getAllByRole('button')[1]);
    expect(onToggle).toHaveBeenCalledWith([0, 255, 0]);
  });
});
