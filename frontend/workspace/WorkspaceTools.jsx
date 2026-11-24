import { LampFloor, Ruler, Square } from 'lucide-react';
import { SAMPLE_LAMP } from '../../../smart-home/layout-document.mjs';
import { useUIStore } from '../../store/useUIStore';

export default function WorkspaceTools({ onAddLamp }) {
  const {
    beginPaletteDrag,
    isDrawingWall,
    isMeasuring,
    setIsMeasuring,
    setViewMode,
    toggleWallDrawing,
    viewMode,
  } = useUIStore();

  return (
    <aside className="workspace-tools" aria-label="Layout tools">
      <h2>Layout tools</h2>
      <button
        type="button"
        className="workspace-tool"
        aria-pressed={isDrawingWall}
        data-testid="wall-tool-toggle"
        onClick={() => {
          setViewMode('2D');
          toggleWallDrawing();
        }}
      >
        <Square size={17} aria-hidden="true" /> Draw wall
      </button>
      <button
        type="button"
        className="workspace-tool workspace-lamp-tool"
        data-testid="catalog-item-sample-floor-lamp"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          setViewMode('2D');
          beginPaletteDrag({ ...SAMPLE_LAMP, offsetX: event.clientX, offsetY: event.clientY });
        }}
        onClick={onAddLamp}
      >
        <LampFloor size={17} aria-hidden="true" /> Add floor lamp
      </button>
      {viewMode === '2D' && (
        <button
          type="button"
          className="workspace-tool workspace-measure"
          aria-pressed={isMeasuring}
          onClick={() => setIsMeasuring(!isMeasuring)}
        >
          <Ruler size={17} aria-hidden="true" /> Measure
        </button>
      )}
    </aside>
  );
}
