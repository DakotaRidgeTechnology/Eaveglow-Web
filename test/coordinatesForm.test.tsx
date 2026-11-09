// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/preact';
import { CoordinatesForm } from '../src/ui/schedule/CoordinatesForm';

describe('CoordinatesForm', () => {
  it('renders latitude and longitude inputs', () => {
    render(<CoordinatesForm onSet={() => {}} />);
    expect(screen.getByPlaceholderText('Latitude')).toBeTruthy();
    expect(screen.getByPlaceholderText('Longitude')).toBeTruthy();
  });

  it('disables Set button when inputs are empty', () => {
    render(<CoordinatesForm onSet={() => {}} />);
    const btn = screen.getByText('Set') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables Set button with valid coordinates', () => {
    render(<CoordinatesForm onSet={() => {}} />);
    fireEvent.input(screen.getByPlaceholderText('Latitude'), { target: { value: '40.7' } });
    fireEvent.input(screen.getByPlaceholderText('Longitude'), { target: { value: '-74.0' } });
    const btn = screen.getByText('Set') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('calls onSet with parsed location', () => {
    const onSet = vi.fn();
    render(<CoordinatesForm onSet={onSet} />);
    fireEvent.input(screen.getByPlaceholderText('Latitude'), { target: { value: '40.7' } });
    fireEvent.input(screen.getByPlaceholderText('Longitude'), { target: { value: '-74.0' } });
    fireEvent.click(screen.getByText('Set'));
    expect(onSet).toHaveBeenCalledWith({ lat: 40.7, lon: -74, label: '40.700, -74.000' });
  });
});
