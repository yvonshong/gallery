import { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';

interface GlobeBackgroundProps {
  targetLocation: { lat: number; lng: number } | null;
}

export default function GlobeBackground({ targetLocation }: GlobeBackgroundProps) {
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [countries, setCountries] = useState<any[]>([]);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Load GeoJSON for crisp, vector-based country borders
    fetch('https://unpkg.com/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(res => res.json())
      .then(data => setCountries(data.features))
      .catch(err => console.error("Failed to load geojson", err));
  }, []);

  useEffect(() => {
    if (globeRef.current) {
      // Set initial zoom (high zoom, country level)
      globeRef.current.pointOfView({ altitude: 0.15 }, 0);
      
      // Auto-rotate if no target
      globeRef.current.controls().autoRotate = !targetLocation;
      globeRef.current.controls().autoRotateSpeed = 0.5;
      globeRef.current.controls().enableZoom = false; // Disable user zoom for background
    }
  }, []);

  useEffect(() => {
    if (targetLocation && globeRef.current) {
      // Smoothly pan to the target location
      globeRef.current.controls().autoRotate = false;
      globeRef.current.pointOfView(
        { lat: targetLocation.lat, lng: targetLocation.lng, altitude: 0.15 },
        2000 // 2 seconds transition
      );
    } else if (!targetLocation && globeRef.current) {
       globeRef.current.controls().autoRotate = true;
    }
  }, [targetLocation]);

  return (
    <div style={{ opacity: 0.8 }}>
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        showGlobe={true} // Restore the base sphere to block the back side
        globeImageUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=" // 1x1 solid white pixel
        showAtmosphere={false}
        polygonsData={countries}
        polygonCapColor={() => '#e0e0e0'}
        polygonSideColor={() => '#e0e0e0'}
        polygonStrokeColor={() => '#ffffff'}
        polygonsTransitionDuration={0}
      />
    </div>
  );
}
