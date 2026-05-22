import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PhotoData } from '../App';
import { Info, X } from 'lucide-react';

interface ExifOverlayProps {
  photo: PhotoData;
  locationName: string;
  onClose?: () => void;
}

export default function PhotoDetailModal({ photo, locationName, onClose }: ExifOverlayProps) {
  const [showExif, setShowExif] = useState(false);

  return (
    <>
      {onClose && (
        <button onClick={onClose} style={iconButtonStyle({ top: '20px', right: '20px' })}>
          <X size={24} />
        </button>
      )}

      {!showExif && (
        <button 
          onClick={(e) => { e.stopPropagation(); setShowExif(true); }} 
          style={iconButtonStyle({ bottom: '20px', right: '20px' })}
        >
          <Info size={24} />
        </button>
      )}

      <AnimatePresence>
        {showExif && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => {
              e.stopPropagation();
              setShowExif(false);
            }}
            style={{
              position: 'absolute',
              bottom: '20px',
              right: '20px',
              padding: '1.5rem',
              borderRadius: '8px',
              color: '#ffffff',
              background: 'rgba(20,20,20,0.85)',
              width: '380px',
              fontSize: '0.9rem',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              zIndex: 120,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)'
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontWeight: 400 }}>{locationName}</h3>
            
            <div style={exifRowStyle}>
              <span style={exifLabelStyle}>Camera</span>
              <span>{photo.make} {photo.model}</span>
            </div>
            <div style={exifRowStyle}>
              <span style={exifLabelStyle}>Lens</span>
              <span>{formatNumber(photo.focalLength)}mm</span>
            </div>
            <div style={exifRowStyle}>
              <span style={exifLabelStyle}>Settings</span>
              <span>ƒ/{formatNumber(photo.fNumber)} · {formatExposure(photo.exposureTime)}s · ISO {photo.iso}</span>
            </div>
            <div style={exifRowStyle}>
              <span style={exifLabelStyle}>Date</span>
              <span>{new Date(photo.date).toLocaleDateString()}</span>
            </div>
            <div style={exifRowStyle}>
              <span style={exifLabelStyle}>GPS</span>
              <span style={{ fontSize: '0.8rem', color: '#aaaaaa' }}>
                {photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const formatNumber = (val: string | number) => {
  const num = Number(val);
  if (isNaN(num)) return val;
  return Math.round(num * 1000) / 1000;
};

const formatExposure = (val: string | number) => {
  const num = Number(val);
  if (isNaN(num)) return val;
  if (num > 0 && num < 1) {
    return `1/${Math.round(1 / num)}`;
  }
  return Math.round(num * 1000) / 1000;
};

const iconButtonStyle = (extra: React.CSSProperties): React.CSSProperties => ({
  position: 'absolute',
  background: 'none',
  border: 'none',
  color: 'white',
  cursor: 'pointer',
  padding: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 110,
  opacity: 0.7,
  transition: 'opacity 0.2s',
  ...extra
});

const exifRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '0.5rem',
};

const exifLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-heading)',
  fontStyle: 'italic',
  fontSize: '1rem',
};
