// @vitest-environment happy-dom
import { render } from '@testing-library/preact';
import { CanePreview } from '../src/ui/props/PropCard';

describe('CanePreview', () => {
  it('renders an SVG', () => {
    const model = {
      name: 'Cane',
      width: 10,
      height: 20,
      nodes: [
        [0, 0],
        [1, 1],
        [2, 2],
      ] as [number, number][],
    };
    const { container } = render(
      <CanePreview
        model={model as any}
        width={3}
        colors={[
          [255, 0, 0],
          [0, 255, 0],
          [0, 0, 255],
        ]}
      />
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('circle').length).toBe(3);
  });
});
