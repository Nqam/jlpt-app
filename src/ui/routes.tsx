import { GrammarListScreen } from './screens/GrammarListScreen';
import { GrammarDetailScreen } from './screens/GrammarDetailScreen';
import { KanjiListScreen } from './screens/KanjiListScreen';
import { KanjiDetailScreen } from './screens/KanjiDetailScreen';
import { VocabListScreen } from './screens/VocabListScreen';
import { VocabDetailScreen } from './screens/VocabDetailScreen';
import { CourseScreen } from './screens/CourseScreen';
import { GrammarLessonScreen } from './screens/GrammarLessonScreen';
import { TextsListScreen } from './screens/TextsListScreen';
import { TextDetailScreen } from './screens/TextDetailScreen';
import { TodayScreen } from './screens/TodayScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { PlacementScreen } from './screens/PlacementScreen';
import { Navigate, useParams } from 'react-router-dom';
import { ProgressScreen } from './screens/ProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import type { RouteObject } from 'react-router-dom';

function PlacementRedirect() {
  return <Navigate to="/placement/grammar" replace />;
}

function PlacementRoute() {
  const { type } = useParams();
  return <PlacementScreen key={type} />;
}

// Remount the grammar lesson player when only the :grammarId changes.
function GrammarLessonRoute() {
  const { grammarId } = useParams();
  return <GrammarLessonScreen key={grammarId} />;
}

// Old lesson-player URLs now resolve to the restored free-reading text.
function LessonToTextRedirect() {
  const { id } = useParams();
  return <Navigate to={`/texts/${id}`} replace />;
}

export const routes: RouteObject[] = [
  { path: '/', element: <TodayScreen /> },
  { path: '/review', element: <ReviewScreen /> },
  { path: '/placement', element: <PlacementRedirect /> },
  { path: '/placement/:type', element: <PlacementRoute /> },
  { path: '/grammar', element: <GrammarListScreen /> },
  { path: '/grammar/:id', element: <GrammarDetailScreen /> },
  { path: '/kanji', element: <KanjiListScreen /> },
  { path: '/kanji/:id', element: <KanjiDetailScreen /> },
  { path: '/vocab', element: <VocabListScreen /> },
  { path: '/vocab/:id', element: <VocabDetailScreen /> },
  { path: '/course', element: <CourseScreen /> },
  { path: '/course/:grammarId', element: <GrammarLessonRoute /> },
  { path: '/lesson/:id', element: <LessonToTextRedirect /> },
  { path: '/texts', element: <TextsListScreen /> },
  { path: '/texts/:id', element: <TextDetailScreen /> },
  { path: '/progress', element: <ProgressScreen /> },
  { path: '/settings', element: <SettingsScreen /> },
];
