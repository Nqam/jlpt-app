import { GrammarListScreen } from './screens/GrammarListScreen';
import { GrammarDetailScreen } from './screens/GrammarDetailScreen';
import { KanjiListScreen } from './screens/KanjiListScreen';
import { KanjiDetailScreen } from './screens/KanjiDetailScreen';
import { VocabListScreen } from './screens/VocabListScreen';
import { VocabDetailScreen } from './screens/VocabDetailScreen';
import { TextsListScreen } from './screens/TextsListScreen';
import { TextDetailScreen } from './screens/TextDetailScreen';
import { TodayScreen } from './screens/TodayScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type { RouteObject } from 'react-router-dom';

export const routes: RouteObject[] = [
  { path: '/', element: <TodayScreen /> },
  { path: '/review', element: <ReviewScreen /> },
  { path: '/placement', element: <PlacementScreen /> },
  { path: '/grammar', element: <GrammarListScreen /> },
  { path: '/grammar/:id', element: <GrammarDetailScreen /> },
  { path: '/kanji', element: <KanjiListScreen /> },
  { path: '/kanji/:id', element: <KanjiDetailScreen /> },
  { path: '/vocab', element: <VocabListScreen /> },
  { path: '/vocab/:id', element: <VocabDetailScreen /> },
  { path: '/texts', element: <TextsListScreen /> },
  { path: '/texts/:id', element: <TextDetailScreen /> },
  { path: '/progress', element: <ProgressScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
];
