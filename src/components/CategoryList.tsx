import { useMemo, useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { PhotosDB, CategoryData } from '../App';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface CategoryListProps {
  db: PhotosDB;
  onHoverCategory: (lat: number, lng: number) => void;
}

function FilmStripRow({
  group,
  groupIndex,
  onHoverCategory
}: {
  group: { year: string, categories: (CategoryData & { randomCover: string })[] },
  groupIndex: number,
  onHoverCategory: (lat: number, lng: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Wheel → horizontal scroll
  useEffect(() => {
    const el = wrapperRef.current;
    const scrollEl = scrollRef.current;
    if (!el || !scrollEl) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        scrollEl.scrollBy({ left: e.deltaY * 2, behavior: 'smooth' });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scrollByAmount = (amount: number) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const cats = group.categories;

  return (
    <div style={{ position: 'relative' }}>
      {/* Year label */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 + groupIndex * 0.1 }}
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(1.2rem, 3vw, 2rem)',
          color: 'var(--text-secondary)',
          paddingLeft: 'max(4rem, calc(50vw - 800px + 4rem))',
          marginBottom: 'clamp(0.5rem, 2vw, 1rem)'
        }}
      >
        {group.year}
      </motion.div>

      {/* Film strip */}
      <div className="film-strip-wrapper" style={{ position: 'relative' }} ref={wrapperRef}>
        {/* Nav buttons */}
        <button onClick={() => scrollByAmount(-400)} className="nav-btn left-btn" aria-label="Scroll left">
          <ChevronLeft size={32} />
        </button>
        <button onClick={() => scrollByAmount(400)} className="nav-btn right-btn" aria-label="Scroll right">
          <ChevronRight size={32} />
        </button>

        {/* Scroll container */}
        <div className="film-strip-scroll" ref={scrollRef}>
          {/* Inner: 5 rows stacked vertically, all scroll together */}
          <div className="film-strip-inner">

            {/* Row 1: Top text */}
            <div className="film-row">
              {cats.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  className="film-cell"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 + groupIndex * 0.1 + i * 0.05 }}
                >
                  <div className={`film-edge-text top-edge${hoveredId === cat.id ? ' hovered' : ''}`}>
                    {cat.locationName || 'UNKNOWN LOCATION'}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Row 2: Top sprocket — full width */}
            <div className="film-sprocket-bar top-sprocket" />

            {/* Row 3: Images */}
            <div className="film-row">
              {cats.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  className="film-cell"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + groupIndex * 0.1 + i * 0.05, type: 'spring', damping: 20, stiffness: 100 }}
                  onMouseEnter={() => { setHoveredId(cat.id); onHoverCategory(cat.lat, cat.lng); }}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <Link to={`/category/${cat.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div className={`film-image-wrap${hoveredId === cat.id ? ' hovered' : ''}`}>
                      <img
                        src={cat.randomCover}
                        alt={cat.name}
                        className="cover-img"
                        loading="lazy"
                        draggable={false}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Row 4: Bottom sprocket — full width */}
            <div className="film-sprocket-bar bottom-sprocket" />

            {/* Row 5: Bottom text */}
            <div className="film-row">
              {cats.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  className="film-cell"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 + groupIndex * 0.1 + i * 0.05 }}
                >
                  <div className={`film-edge-text bottom-edge${hoveredId === cat.id ? ' hovered' : ''}`}>
                    {cat.name.replace(/^[0-9.]+-/, '')}
                  </div>
                </motion.div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function CategoryList({ db, onHoverCategory }: CategoryListProps) {
  const groupedByYear = useMemo(() => {
    const map = new Map<string, (typeof db.categories[0] & { randomCover: string })[]>();

    for (const cat of db.categories) {
      const yearMatch = cat.name.match(/^(\d{4})/);
      const year = yearMatch ? yearMatch[1] : 'Other';
      if (!map.has(year)) map.set(year, []);

      const photos = cat.photos;
      let randomCover = cat.cover;
      if (photos && photos.length > 0) {
        randomCover = photos[Math.floor(Math.random() * photos.length)].thumbUrl || cat.cover;
      }
      map.get(year)!.push({ ...cat, randomCover });
    }

    const sortedYears = Array.from(map.keys()).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return parseInt(b) - parseInt(a);
    });

    return sortedYears.map(year => ({ year, categories: map.get(year)! }));
  }, [db]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '6rem 0',
      width: '100%',
      position: 'relative',
      zIndex: 10,
    }}>
      <header style={{ marginBottom: '6rem', paddingLeft: '4rem', maxWidth: '1600px', margin: '0 auto 6rem auto', width: '100%', boxSizing: 'border-box' }}>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(3rem, 8vw, 5rem)', fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.02em', marginBottom: '1rem', color: 'var(--text-primary)' }}
        >
          Gallery
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-secondary)', fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', fontWeight: 400, fontStyle: 'italic', maxWidth: '500px', lineHeight: 1.6 }}
        >
          photography for yvonshong
        </motion.p>
      </header>

      <div>
        {groupedByYear.map((group, groupIndex) => (
          <FilmStripRow
            key={group.year}
            group={group}
            groupIndex={groupIndex}
            onHoverCategory={onHoverCategory}
          />
        ))}
      </div>
    </div>
  );
}
