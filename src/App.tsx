import { useEffect, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import GlobeBackground from './components/GlobeBackground';
import CategoryList from './components/CategoryList';
import PhotoGrid from './components/PhotoGrid';
import './index.css';

export interface PhotoData {
  id: string;
  filename: string;
  webRawUrl: string;
  thumbUrl: string;
  lat: number;
  lng: number;
  date: string;
  width: number;
  height: number;
  make: string;
  model: string;
  focalLength: number | string;
  fNumber: number | string;
  iso: number | string;
  exposureTime: number | string;
  locationName?: string;
}

export interface CategoryData {
  id: string;
  name: string;
  cover: string;
  lat: number;
  lng: number;
  locationName: string;
  photos: PhotoData[];
}

export interface PhotosDB {
  categories: CategoryData[];
}

function MainLayout({ db }: { db: PhotosDB | null }) {
  const [activeLocation, setActiveLocation] = useState<{lat: number, lng: number} | null>(null);
  const location = window.location.hash;

  useEffect(() => {
    if (window.location.hash.startsWith('#/photos')) {
      return;
    }
    const container = document.getElementById('scroll-container');
    if (container) container.scrollTop = 0;
  }, [location]);

  const handleSetLocation = useCallback((lat: number, lng: number) => {
    setActiveLocation(prev => {
      if (prev && prev.lat === lat && prev.lng === lng) return prev;
      return { lat, lng };
    });
  }, []);

  if (!db) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
        <GlobeBackground targetLocation={activeLocation} />
      </div>

      {/* 毛玻璃水雾遮罩 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        zIndex: 0, pointerEvents: 'none',
        backdropFilter: 'blur(12px) saturate(140%)',
        backgroundColor: 'rgba(250, 250, 250, 0.15)',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.06%22/%3E%3C/svg%3E")'
      }}></div>
      
      <div id="scroll-container" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<CategoryList db={db} onHoverCategory={handleSetLocation} />} />
          <Route path="/photos" element={<PhotoGridWrapper db={db} setLocation={handleSetLocation} />} />
        </Routes>
      </div>
    </div>
  );
}

function PhotoGridWrapper({ db, setLocation }: { db: PhotosDB, setLocation: (lat: number, lng: number) => void }) {
  const location = useLocation();
  const id = location.hash ? location.hash.slice(1) : undefined;
  
  return <PhotoGrid categories={db.categories} activeCategoryId={id} setLocation={setLocation} />;
}

function App() {
  const [db, setDb] = useState<PhotosDB | null>(null);

  useEffect(() => {
    // Use BASE_URL to support GitHub Pages subpath deployments
    const dbUrl = (import.meta.env.BASE_URL || '/') + 'photos_db.json';
    
    fetch(dbUrl.replace('//', '/'))
      .then(res => res.json())
      .then((data: PhotosDB) => {
        // Support R2 deployment mode via VITE_IMAGE_BASE_URL, fallback to local debug mode
        const imageBaseUrl = import.meta.env.VITE_IMAGE_BASE_URL || import.meta.env.BASE_URL || '/';
        const prefix = imageBaseUrl.endsWith('/') ? imageBaseUrl : imageBaseUrl + '/';
        
        data.categories.forEach(cat => {
          if (cat.cover && !cat.cover.startsWith('http')) cat.cover = prefix + cat.cover;
          cat.photos.forEach(photo => {
            if (photo.webRawUrl && !photo.webRawUrl.startsWith('http')) photo.webRawUrl = prefix + photo.webRawUrl;
            if (photo.thumbUrl && !photo.thumbUrl.startsWith('http')) photo.thumbUrl = prefix + photo.thumbUrl;
          });
        });
        
        setDb(data);
      })
      .catch(err => console.error('Failed to load photos DB:', err));
  }, []);

  return (
    <HashRouter>
      <MainLayout db={db} />
    </HashRouter>
  );
}

export default App;
