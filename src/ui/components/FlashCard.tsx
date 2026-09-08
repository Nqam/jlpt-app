import { useState, type ReactNode } from 'react';

export function FlashCard({
  front, back, onKnown, onAgain,
}: {
  front: ReactNode;
  back: ReactNode;
  onKnown: () => void;
  onAgain: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flashcard">
      <div className="flashcard-front">{front}</div>
      {revealed ? (
        <>
          <div className="flashcard-back">{back}</div>
          <div className="flashcard-actions">
            <button type="button" className="btn-ghost" onClick={onAgain}>Ещё раз</button>
            <button type="button" className="btn-primary" onClick={onKnown}>Понятно</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn-primary" onClick={() => setRevealed(true)}>
          Показать
        </button>
      )}
    </div>
  );
}
