import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter as BaseMemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import { ContentDbContext } from '@/ui/ContentDbProvider';

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
const MemoryRouter = (p: ComponentProps<typeof BaseMemoryRouter>) => (
  <BaseMemoryRouter future={FUTURE} {...p} />
);

const completed: { value: string[] } = { value: [] };
vi.mock('@/ui/useUserDb', () => ({
  useUserDb: () => ({
    getSetting: (key: string, fb: unknown) =>
      key === 'course_completed_ids' ? completed.value : fb,
  }),
}));

import { CourseScreen } from '@/ui/screens/CourseScreen';
import type { LessonMeta, Level } from '@/core/types';

const levels: Level[] = [{ code: 'N5', ord: 1, status: 'available', titleRu: 'N5' }];
const lm = (id: string, stage: number, mandatory: boolean): LessonMeta => ({
  id, stage, kind: 'text', title: id.toUpperCase(),
  introducesCount: mandatory ? 2 : 0, isFreeReading: !mandatory,
});
const lessons: LessonMeta[] = [lm('m1', 2, true), lm('r1', 4, false), lm('m2', 8, true)];

const fakeDb = { listLessons: () => lessons } as unknown as import('@/storage/content-db').ContentDb;

function renderScreen() {
  return render(
    <ContentDbContext.Provider value={{ db: fakeDb, levels }}>
      <MemoryRouter><CourseScreen /></MemoryRouter>
    </ContentDbContext.Provider>,
  );
}

describe('CourseScreen', () => {
  beforeEach(() => { completed.value = []; });

  it('lists every lesson in course order with a state label', () => {
    const { getByRole, container } = renderScreen();
    expect(getByRole('heading', { name: 'Курс' })).toBeInTheDocument();
    const items = [...container.querySelectorAll('.course-item')];
    expect(items.map((el) => el.getAttribute('data-lesson'))).toEqual(['m1', 'r1', 'm2']);
    expect(items[0]).toHaveAttribute('data-state', 'current');
    expect(items[1]).toHaveAttribute('data-state', 'locked'); // r1 stage 4 > ceiling 2
    expect(items[2]).toHaveAttribute('data-state', 'locked');
  });

  it('renders a "Продолжить" link to the current mandatory lesson', () => {
    const { getByRole } = renderScreen();
    expect(getByRole('link', { name: /Продолжить/ })).toHaveAttribute('href', '/lesson/m1');
  });

  it('after m1 is completed, m2 is current and r1 becomes a reading link', () => {
    completed.value = ['m1'];
    const { container } = renderScreen();
    const byId = (id: string) => container.querySelector(`.course-item[data-lesson="${id}"]`)!;
    expect(byId('m1')).toHaveAttribute('data-state', 'done');
    expect(byId('m2')).toHaveAttribute('data-state', 'current');
    expect(byId('r1')).toHaveAttribute('data-state', 'unlocked-reading');
    expect(byId('r1').querySelector('a')).toHaveAttribute('href', '/lesson/r1');
  });

  it('a locked lesson is not a link', () => {
    const { container } = renderScreen();
    const locked = container.querySelector('.course-item[data-state="locked"]')!;
    expect(locked.querySelector('a')).toBeNull();
  });

  it('with only free-reading lessons every item is a reading link and there is no "Продолжить"', () => {
    (fakeDb as unknown as { listLessons: () => LessonMeta[] }).listLessons = () => [
      lm('a', 2, false), lm('b', 40, false),
    ];
    const { queryByRole, container } = renderScreen();
    expect(queryByRole('link', { name: /Продолжить/ })).toBeNull();
    expect([...container.querySelectorAll('.course-item')].every(
      (el) => el.getAttribute('data-state') === 'unlocked-reading',
    )).toBe(true);
    (fakeDb as unknown as { listLessons: () => LessonMeta[] }).listLessons = () => lessons;
  });
});
