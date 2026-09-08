import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusDot } from '@/ui/components/StatusDot';

describe('StatusDot', () => {
  it('renders nothing for status "new"', () => {
    const { container } = render(<StatusDot status="new" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a titled, classed dot for each non-new status', () => {
    for (const [status, label, cls] of [
      ['learning', 'изучается', 'status-dot-learning'],
      ['learned', 'изучено', 'status-dot-learned'],
      ['mastered', 'освоено', 'status-dot-mastered'],
    ] as const) {
      const { container } = render(<StatusDot status={status} />);
      const dot = container.querySelector('span.status-dot')!;
      expect(dot).toHaveClass(cls);
      expect(dot).toHaveAttribute('title', label);
    }
  });
});
