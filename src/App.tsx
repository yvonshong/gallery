import { useEffect, useState, useCallback } from 'react';
import { HashRouter, Routes, Route, useParams } from 'react-router-dom';
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
      
      <div id="scroll-container" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<CategoryList db={db} onHoverCategory={handleSetLocation} />} />
          <Route path="/category/:id" element={<PhotoGridWrapper db={db} setLocation={handleSetLocation} />} />
        </Routes>
      </div>
    </div>
  );
}

function PhotoGridWrapper({ db, setLocation }: { db: PhotosDB, setLocation: (lat: number, lng: number) => void }) {
  const { id } = useParams();
  const category = db.categories.find(c => c.id === id);
  
  useEffect(() => {
    if (category) {
      setLocation(category.lat, category.lng);
    }
  }, [category, setLocation]);

  if (!category) return <div style={{ padding: '2rem' }}>Category not found</div>;

  return <PhotoGrid category={category} />;
}

function App() {
  const [db, setDb] = useState<PhotosDB | null>(null);

  useEffect(() => {
    fetch('/photos_db.json')
      .then(res => res.json())
      .then(data => setDb(data))
      .catch(err => console.error('Failed to load photos DB:', err));
  }, []);

  return (
    <HashRouter>
      <MainLayout db={db} />
    </HashRouter>
  );
}

export default App;
