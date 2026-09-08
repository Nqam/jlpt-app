import { createHashRouter, RouterProvider, Outlet } from 'react-router-dom';
import { ContentDbProvider } from './ContentDbProvider';
import { UserDbProvider } from './UserDbProvider';
import { Nav } from './components/Nav';
import { ThemeToggle } from './components/ThemeToggle';
import { routes } from './routes';

function Shell() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main">
        <header className="app-header">
          <span data-testid="app-title" className="app-brand">JLPT</span>
          <ThemeToggle />
        </header>
        <ContentDbProvider>
          <UserDbProvider>
            <Outlet />
          </UserDbProvider>
        </ContentDbProvider>
      </main>
    </div>
  );
}

// Opt into the React Router v7 behaviours early. `v7_relativeSplatPath` is a
// data-router option; `v7_startTransition` is a RouterProvider-level flag — set
// together they match the future flags used in tests/ui/Nav.test.tsx.
const router = createHashRouter([{ element: <Shell />, children: routes }], {
  future: { v7_relativeSplatPath: true },
});

export default function App() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
