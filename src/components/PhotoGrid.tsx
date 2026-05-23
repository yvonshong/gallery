import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { CategoryData } from '../App';
import { ArrowLeft } from 'lucide-react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import PhotoDetailModal from './PhotoDetailModal';

interface PhotoGridProps {
  categories: CategoryData[];
  activeCategoryId?: string;
  setLocation: (lat: number, lng: number) => void;
}

function LazyCategorySection({
  category,
  activeCategoryId
}: {
  category: CategoryData;
  activeCategoryId?: string;
}) {
  const [hasBeenInView, setHasBeenInView] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  // If this is the active category, load it immediately
  useEffect(() => {
    if (activeCategoryId === category.id) {
      setHasBeenInView(true);
    }
  }, [activeCategoryId, category.id]);

  useEffect(() => {
    if (hasBeenInView) return; // Already loaded

    const scrollContainer = document.getElementById('scroll-container');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasBeenInView(true);
        }
      },
      {
        root: scrollContainer,
        rootMargin: '600px 0px 600px 0px', // Load 600px ahead of viewport for seamless UX
        threshold: 0.01
      }
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [category.id, hasBeenInView]);

  return (
    <section
      ref={elementRef}
      id={category.id}
      style={{
        marginBottom: '8rem',
        scrollMarginTop: '6rem',
        minHeight: '350px' // reasonable minimum height for layout stability
      }}
    >
      <header style={{ marginBottom: '3rem' }}>
        <h2 style={{
          fontFamily: 'var(--font-heading)',
          fontStyle: 'italic',
          fontSize: 'clamp(2rem, 5vw, 4rem)',
          fontWeight: 400,
          letterSpacing: '0.02em',
          lineHeight: 1.1,
          marginBottom: '0',
          color: 'var(--text-primary)'
        }}>
          {category.name.replace(/^[0-9.]+-/, '')}
        </h2>
      </header>

      {hasBeenInView ? (
        <PhotoProvider
          maskOpacity={0.9}
          bannerVisible={false}
          overlayRender={({ index, onClose }) => {
            const photo = category.photos[index];
            if (!photo) return null;
            return <PhotoDetailModal photo={photo} locationName={photo.locationName || category.locationName} onClose={onClose} />;
          }}
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '5rem 4rem',
          } as React.CSSProperties}>
            {category.photos.map((photo, index) => (
              <PhotoView key={photo.id} src={photo.webRawUrl}>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, type: 'spring', damping: 20, stiffness: 100 }}
                  className="fuji-sq"
                >
                  <div className="fuji-sq-inner">
                    <img
                      src={photo.thumbUrl}
                      alt={photo.filename}
                      className="photo-img"
                      loading="lazy"
                    />
                  </div>
                </motion.div>
              </PhotoView>
            ))}
          </div>
        </PhotoProvider>
      ) : (
        <div style={{
          height: '250px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: '1rem',
          fontStyle: 'italic',
          fontFamily: 'var(--font-heading)',
          border: '1px dashed rgba(0,0,0,0.1)',
          borderRadius: '8px'
        }}>
          Loading category gallery...
        </div>
      )}
    </section>
  );
}

export default function PhotoGrid({ categories, activeCategoryId, setLocation }: PhotoGridProps) {
  // Scroll to active category on mount or when activeCategoryId changes
  useEffect(() => {
    if (activeCategoryId) {
      // Small timeout to ensure DOM is fully rendered and active category is populated
      const timer = setTimeout(() => {
        const element = document.getElementById(activeCategoryId);
        if (element) {
          element.scrollIntoView({ behavior: 'auto' });
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [activeCategoryId]);

  // Set up intersection observer to update the globe location as categories scroll into view
  useEffect(() => {
    const scrollContainer = document.getElementById('scroll-container');
    const observerOptions = {
      root: scrollContainer,
      rootMargin: '-20% 0px -60% 0px', // focused in the upper-middle of the screen
      threshold: 0.1
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const categoryId = entry.target.id;
          const matchedCategory = categories.find(c => c.id === categoryId);
          if (matchedCategory) {
            setLocation(matchedCategory.lat, matchedCategory.lng);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    categories.forEach(cat => {
      const el = document.getElementById(cat.id);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [categories, setLocation]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      padding: '2rem',
      position: 'relative',
      zIndex: 20
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <header style={{ marginBottom: '4rem', paddingTop: '2rem', position: 'relative' }}>
          <Link to="/" style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'var(--text-secondary)',
            transition: 'color 0.3s ease',
            textDecoration: 'none',
            fontSize: '0.9rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 500,
          }}
            onMouseOver={e => e.currentTarget.style.color = '#000'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
            <ArrowLeft size={16} style={{ marginRight: '8px' }} />
            Back to Gallery
          </Link>
        </header>

        {categories.map((category) => {
          if (!category.photos || category.photos.length === 0) return null;

          return (
            <LazyCategorySection
              key={category.id}
              category={category}
              activeCategoryId={activeCategoryId}
            />
          );
        })}
      </div>
    </div>
  );
}
