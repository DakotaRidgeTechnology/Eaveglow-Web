// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/preact';
import { Slider } from '../src/ui/lookEditor/Slider';

describe('Slider', () => {
  it('renders label and range input', () => {
    render(<Slider label="Speed" left="Slow" right="Fast" value={128} onChange={() => {}} />);
    expect(screen.getByText('Speed')).toBeTruthy();
    expect(screen.getByText('Slow')).toBeTruthy();
    expect(screen.getByText('Fast')).toBeTruthy();
  });

  it('calls onChange on input', () => {
    const onChange = vi.fn();
    render(<Slider label="Speed" left="Slow" right="Fast" value={128} onChange={onChange} />);
    const input = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '200' } });
    expect(onChange).toHaveBeenCalledWith(200);
  });
});
