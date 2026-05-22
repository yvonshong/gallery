import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { CategoryData } from '../App';
import { ArrowLeft, MapPin } from 'lucide-react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import PhotoDetailModal from './PhotoDetailModal'; // Now ExifOverlay

export default function PhotoGrid({ category }: { category: CategoryData }) {
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
        <header style={{ marginBottom: '6rem', paddingTop: '2rem', position: 'relative' }}>
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
            marginBottom: '3rem'
          }}
          onMouseOver={e => e.currentTarget.style.color = '#000'}
          onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
            <ArrowLeft size={16} style={{ marginRight: '8px' }} />
            Back to Exhibitions
          </Link>

          <div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ fontFamily: 'var(--font-heading)', fontStyle: 'italic', fontSize: 'clamp(2.5rem, 6vw, 6rem)', fontWeight: 400, letterSpacing: '0.02em', lineHeight: 1.1, marginBottom: '1.5rem', color: 'var(--text-primary)' }}
            >
              {category.name.replace(/^[0-9.]+-/, '')}
            </motion.h1>
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               transition={{ delay: 0.2 }}
               style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '1rem', fontWeight: 400, letterSpacing: '0.1em', textTransform: 'uppercase' }}
            >
              <MapPin size={16} style={{ marginRight: '8px' }} />
              {category.locationName}
            </motion.div>
          </div>
        </header>

        <PhotoProvider
          maskOpacity={0.9}
          bannerVisible={false}
          overlayRender={({ index, onClose }) => {
            const photo = category.photos[index];
            if (!photo) return null;
            return <PhotoDetailModal photo={photo} locationName={category.locationName} onClose={onClose} />;
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
      </div>
    </div>
  );
}
