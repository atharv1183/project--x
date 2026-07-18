import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Maximize2, RotateCcw } from 'lucide-react';

interface PanoramaViewerProps {
  isOpen: boolean;
  onClose: () => void;
  panoramaPhotos: string[];
  panoramaLabels?: string[];
  startIndex?: number;
}

/**
 * Full-screen 360 degree panoramic tour viewer.
 *
 * Works with standard smartphone horizontal panorama photos.
 * Uses @photo-sphere-viewer/core with pitch clamped to +/-20 deg
 * so the missing ceiling/floor (from a plain phone pano) is never visible.
 */
export default function PanoramaViewer({
  isOpen,
  onClose,
  panoramaPhotos,
  panoramaLabels = [],
  startIndex = 0,
}: PanoramaViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [viewerReady, setViewerReady] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerInstanceRef = useRef<any>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(startIndex);
      setShowTip(true);
      setViewerReady(false);
    }
  }, [isOpen, startIndex]);

  // Auto-hide tip after 3.5s
  useEffect(() => {
    if (!isOpen || !showTip) return;
    const t = setTimeout(() => setShowTip(false), 3500);
    return () => clearTimeout(t);
  }, [isOpen, showTip, currentIndex]);

  // Init or destroy viewer on room change
  useEffect(() => {
    if (!isOpen) return;
    setViewerReady(false);
    let destroyed = false;

    const init = async () => {
      if (!containerRef.current || destroyed) return;

      if (viewerInstanceRef.current) {
        try { viewerInstanceRef.current.destroy(); } catch { /* noop */ }
        viewerInstanceRef.current = null;
      }
      if (containerRef.current) containerRef.current.innerHTML = '';

      try {
        const { Viewer } = await import('@photo-sphere-viewer/core');
        if (destroyed || !containerRef.current) return;

        const viewer = new Viewer({
          container: containerRef.current,
          panorama: panoramaPhotos[currentIndex],
          defaultPitch: 0,
          minFov: 30,
          maxFov: 90,
          defaultZoomLvl: 50,
          mousewheel: true,
          mousemove: true,
          touchmoveTwoFingers: false,
          navbar: false,
          loadingTxt: '',
          defaultYaw: 0,
        });

        viewer.addEventListener('ready', () => {
          if (!destroyed) setViewerReady(true);
        });

        // Clamp pitch to +/-20 degrees (0.35 rad) so black bars stay hidden
        viewer.addEventListener('position-updated', (e: any) => {
          const MAX = 0.35;
          if (Math.abs(e.position.pitch) > MAX) {
            viewer.rotate({
              yaw: e.position.yaw,
              pitch: Math.sign(e.position.pitch) * MAX,
            });
          }
        });

        viewerInstanceRef.current = viewer;
      } catch (err) {
        console.error('PanoramaViewer init error:', err);
        if (!destroyed) setViewerReady(true);
      }
    };

    init();

    return () => {
      destroyed = true;
      if (viewerInstanceRef.current) {
        try { viewerInstanceRef.current.destroy(); } catch { /* noop */ }
        viewerInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex((p) => (p + 1) % panoramaPhotos.length);
    setShowTip(false);
  }, [panoramaPhotos.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((p) => (p - 1 + panoramaPhotos.length) % panoramaPhotos.length);
    setShowTip(false);
  }, [panoramaPhotos.length]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, goNext, goPrev]);

  const roomLabel = panoramaLabels[currentIndex] || `Room ${currentIndex + 1}`;
  const prevLabel = panoramaLabels[(currentIndex - 1 + panoramaPhotos.length) % panoramaPhotos.length]
    || `Room ${((currentIndex - 1 + panoramaPhotos.length) % panoramaPhotos.length) + 1}`;
  const nextLabel = panoramaLabels[(currentIndex + 1) % panoramaPhotos.length]
    || `Room ${((currentIndex + 1) % panoramaPhotos.length) + 1}`;

  if (!panoramaPhotos.length) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[200] bg-black flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-auto"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full">
                <Maximize2 size={12} className="text-blue-400" />
                <span className="text-white text-xs font-bold">{roomLabel}</span>
                {panoramaPhotos.length > 1 && (
                  <span className="text-white/40 text-[10px] font-semibold">
                    {currentIndex + 1} / {panoramaPhotos.length}
                  </span>
                )}
              </div>
            </motion.div>

            <button
              onClick={onClose}
              className="pointer-events-auto w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
              aria-label="Close 360 degree tour"
            >
              <X size={18} />
            </button>
          </div>

          {/* Viewer */}
          <div className="flex-1 relative overflow-hidden">
            {/* Loading */}
            {!viewerReady && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black">
                <div className="w-12 h-12 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                <p className="text-white/50 text-sm font-semibold tracking-wide">Loading 360 view…</p>
              </div>
            )}

            {/* PSV mounts here */}
            <div
              ref={containerRef}
              id="psv-container"
              className="w-full h-full"
              style={{ opacity: viewerReady ? 1 : 0, transition: 'opacity 0.4s ease' }}
            />

            {/* Drag tip */}
            <AnimatePresence>
              {showTip && viewerReady && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 px-4 py-2.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-2 pointer-events-none select-none"
                >
                  <RotateCcw size={14} className="text-blue-400 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="text-white/80 text-xs font-semibold whitespace-nowrap">
                    Click and drag to look around
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Navigation (only when multiple rooms) */}
          {panoramaPhotos.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-5 bg-gradient-to-t from-black/90 to-transparent">
              <motion.button
                onClick={goPrev}
                whileTap={{ scale: 0.92 }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl text-white hover:bg-white/20 active:scale-95 transition-all"
              >
                <ChevronLeft size={18} />
                <span className="text-sm font-bold hidden sm:inline">{prevLabel}</span>
                <span className="text-sm font-bold sm:hidden">Prev</span>
              </motion.button>

              <div className="flex gap-2 items-center">
                {panoramaPhotos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setCurrentIndex(i); setShowTip(false); }}
                    className={`rounded-full transition-all duration-300 ${
                      i === currentIndex ? 'w-6 h-2 bg-blue-500' : 'w-2 h-2 bg-white/30 hover:bg-white/60'
                    }`}
                    aria-label={`Go to room ${i + 1}`}
                  />
                ))}
              </div>

              <motion.button
                onClick={goNext}
                whileTap={{ scale: 0.92 }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl text-white hover:bg-white/20 active:scale-95 transition-all"
              >
                <span className="text-sm font-bold hidden sm:inline">{nextLabel}</span>
                <span className="text-sm font-bold sm:hidden">Next</span>
                <ChevronRight size={18} />
              </motion.button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

