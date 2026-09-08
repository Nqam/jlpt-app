import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Furigana } from '@/ui/components/Furigana';

const furiganaSetting: { value: boolean } = { value: true };
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({ getSetting: () => furiganaSetting.value }),
}));

describe('Furigana', () => {
  beforeEach(() => {
    furiganaSetting.value = true;
  });

  it('renders ruby for kanji groups and plain text for kana', () => {
    const { container } = render(<Furigana text="私[わたし]は 学生[がくせい]です。" />);
    const rubies = container.querySelectorAll('ruby');
    expect(rubies).toHaveLength(2);
    expect(rubies[0]!.querySelector('rt')!.textContent).toBe('わたし');
    expect(container.textContent).toContain('です。');
  });

  it('hides furigana when showFurigana={false} is passed explicitly, overriding the setting', () => {
    const { container } = render(<Furigana text="私[わたし]" showFurigana={false} />);
    expect(container.querySelector('rt')).toBeNull();
    expect(container.textContent).toBe('私');
  });

  it('hides furigana when furigana_enabled is false and no prop override is given', () => {
    furiganaSetting.value = false;
    const { container } = render(<Furigana text="私[わたし]" />);
    expect(container.querySelector('rt')).toBeNull();
    expect(container.textContent).toBe('私');
  });

  it('an explicit showFurigana={true} wins over a false setting', () => {
    furiganaSetting.value = false;
    const { container } = render(<Furigana text="私[わたし]" showFurigana={true} />);
    expect(container.querySelector('rt')).not.toBeNull();
  });
});
