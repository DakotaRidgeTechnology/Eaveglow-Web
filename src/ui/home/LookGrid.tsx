import { Look } from '../../engine/model';
import { useState } from 'preact/hooks';
import { useApp } from '../../app';
import { lookPreviewColors } from '../../engine/library';
import { isBuiltIn } from '../../engine/model';
import { Swatch, GradientBar } from '../common';

interface LookGridProps {
  looks: Look[];
  busy?: string;
  onPick: (look: Look) => void;
  onEdit: (id: string) => void;
  onHide?: (id: string) => void;
  onUnhide?: (id: string) => void;
}

export function LookGrid({ looks, busy, onPick, onEdit, onHide, onUnhide }: LookGridProps) {
  const { settings, guest } = useApp();
  const [limit, setLimit] = useState(30);
  const visible = looks.slice(0, limit);
  const hasMore = looks.length > limit;
  return (
    <>
      <div class="grid">
        {visible.map((look) => {
          const isHidden = (settings.hiddenLooks ?? []).includes(look.id);
          return (
            <div
              key={look.id}
              class={
                'tile' +
                (settings.activeLookId === look.id ? ' active' : '') +
                (isHidden ? ' hidden' : '')
              }
              role="button"
              tabIndex={0}
              onClick={() => !busy && onPick(look)}
            >
              <div class="tile-top">
                <span class="emoji">{look.emoji}</span>
                {busy === look.id ? (
                  <span class="spinner" />
                ) : (
                  <>
                    {!isBuiltIn(look) && (
                      <button
                        class="edit"
                        title="Edit"
                        onClick={(e) => (e.stopPropagation(), onEdit(look.id))}
                      >
                        ✎
                      </button>
                    )}
                    {isHidden && onUnhide && !guest && (
                      <button
                        class="unhide"
                        title="Unhide"
                        onClick={(e) => (e.stopPropagation(), onUnhide(look.id))}
                      >
                        👁
                      </button>
                    )}
                    {!isHidden && onHide && !guest && (
                      <button
                        class="hide"
                        title="Hide"
                        onClick={(e) => (e.stopPropagation(), onHide(look.id))}
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
              </div>
              <span class="name">{look.name}</span>
              <Swatch colors={lookPreviewColors(look)} />
              <GradientBar colors={lookPreviewColors(look)} />
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button class="chip" onClick={() => setLimit((l) => l + 30)}>
          Show more ({looks.length - limit} remaining)
        </button>
      )}
    </>
  );
}
