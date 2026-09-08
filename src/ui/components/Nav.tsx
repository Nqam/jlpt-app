import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

const DESTINATIONS = [
  { to: '/', label: 'Сегодня', icon: '🗓' },
  { to: '/grammar', label: 'Грамматика', icon: '📘' },
  { to: '/kanji', label: 'Кандзи', icon: '㊗' },
  { to: '/vocab', label: 'Слова', icon: '📝' },
  { to: '/texts', label: 'Тексты', icon: '📖' },
  { to: '/progress', label: 'Прогресс', icon: '📈' },
];

function useIsWide(breakpoint = 768): boolean {
  const [wide, setWide] = useState(() => window.innerWidth >= breakpoint);
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return wide;
}

export function Nav() {
  const wide = useIsWide();
  return (
    <nav data-variant={wide ? 'sidebar' : 'bottom'} className="nav">
      {DESTINATIONS.map((d) => (
        <NavLink key={d.to} to={d.to} end={d.to === '/'} className="nav-link">
          <span className="nav-icon" aria-hidden>{d.icon}</span>
          <span className="nav-label">{d.label}</span>
        </NavLink>
      ))}
      <NavLink to="/settings" className="nav-link nav-link--settings">
        <span className="nav-icon" aria-hidden>⚙</span>
        <span className="nav-label">Настройки</span>
      </NavLink>
    </nav>
  );
}
