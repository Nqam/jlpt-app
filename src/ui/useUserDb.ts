import { useContext } from 'react';
import { UserDbContext } from './UserDbProvider';

export function useUserDb() {
  const ctx = useContext(UserDbContext);
  if (!ctx) throw new Error('useUserDb used outside UserDbProvider');
  return ctx.db;
}
