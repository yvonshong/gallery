import fs from 'fs/promises';
import path from 'path';
import exifr from 'exifr';
import sharp from 'sharp';
import convert from 'heic-convert';
import https from 'https';
import { execSync } from 'child_process';

const PHOTOS_DIR = path.join(process.cwd(), 'photos');
const DB_OUTPUT_PATH = path.join(process.cwd(), 'public', 'photos_db.json');
const CACHE_PATH = path.join(process.cwd(), '.geocache.json');

// Helper to delay for rate limiting
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getGeocache() {
  try {
    const data = await fs.readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveGeocache(cache) {
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function findNearestCachedLocation(lat, lng, cache, maxDistanceDegrees = 0.05) {
  let nearestName = null;
  let minDistance = Infinity;

  for (const key of Object.keys(cache)) {
    const [cLatStr, cLngStr] = key.split(',');
    const cLat = parseFloat(cLatStr);
    const cLng = parseFloat(cLngStr);
    if (isNaN(cLat) || isNaN(cLng)) continue;
    
    const dist = Math.hypot(lat - cLat, lng - cLng);
    if (dist < minDistance) {
      minDistance = dist;
      nearestName = cache[key];
    }
  }

  if (minDistance <= maxDistanceDegrees) {
    return nearestName;
  }
  return null;
}

// Reverse Geocoding using Nominatim (with cache and rate limit)
async function reverseGeocode(lat, lng, cache) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache[key]) {
    return cache[key];
  }

  const nearest = findNearestCachedLocation(lat, lng, cache, 0.05);
  if (nearest) {
    console.log(`  Geocode cache hit (nearby): ${lat.toFixed(4)},${lng.toFixed(4)} -> using "${nearest}"`);
    cache[key] = nearest;
    return nearest;
  }

  await delay(1100); // Nominatim limit: 1 req/sec

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'nominatim.openstreetmap.org',
      path: `/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
      headers: { 'User-Agent': 'Gallery-Build-Script/1.0' }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const country = parsed.address?.country || '';
          const state = parsed.address?.state || parsed.address?.province || parsed.address?.region || '';
          const city = parsed.address?.city || parsed.address?.town || parsed.address?.village || parsed.address?.county || '';
          // Remove duplicates in case city and state are the same
          const parts = [country, state, city].filter(Boolean);
          const uniqueParts = [...new Set(parts)];
          const locationName = uniqueParts.join(' ');
          cache[key] = locationName;
          resolve(locationName);
        } catch (e) {
          console.warn(`Failed to parse geocode for ${lat},${lng}`);
          resolve('');
        }
      });
    }).on('error', (e) => {
      console.warn(`Geocode request failed: ${e.message}`);
      resolve('');
    });
  });
}

async function processPhoto(filePath, categoryName) {
  console.log(`Processing: ${filePath}`);
  let ext = path.extname(filePath).toLowerCase();
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath, ext);

  let activeFilePath = filePath;

  // Convert BMP to JPG on disk using ImageMagick CLI
  if (ext === '.bmp') {
    const jpgPath = path.join(dir, `${baseName}.jpg`);
    let jpgExists = false;
    try {
      await fs.access(jpgPath);
      jpgExists = true;
    } catch {}

    if (!jpgExists) {
      console.log(`  Converting BMP to JPG: ${baseName}.jpg`);
      execSync(`convert "${filePath}" -quality 88 "${jpgPath}"`);
    }
    activeFilePath = jpgPath;
    ext = '.jpg';
  }

  let buffer = await fs.readFile(activeFilePath);
  const thumbFileName = `thumb_${baseName}.jpg`;
  const thumbDir = path.join(PHOTOS_DIR, 'thumbnails', categoryName);
  await fs.mkdir(thumbDir, { recursive: true });
  const thumbPath = path.join(thumbDir, thumbFileName);

  let needsThumb = false;
  try { await fs.access(thumbPath); } catch { needsThumb = true; }

  let processableBuffer = buffer;

  if ((ext === '.heic' || ext === '.heif') && needsThumb) {
    console.log(`  Converting HEIC/HEIF to JPG buffer...`);
    processableBuffer = await convert({
      buffer: buffer,
      format: 'JPEG',
      quality: 1
    });
  } else if (ext === '.heic' || ext === '.heif') {
    // Already have thumbnail, still need a processable buffer for metadata
    processableBuffer = await convert({
      buffer: buffer,
      format: 'JPEG',
      quality: 1
    });
  }

  // Generate Thumbnail
  if (needsThumb) {
    console.log(`  Generating thumbnail...`);
    await sharp(processableBuffer)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);
  }

  // Extract EXIF from original file buffer (exifr supports HEIC)
  let exifData = null;
  try {
    exifData = await exifr.parse(buffer, {
      tiff: true, ifd0: true, exif: true, gps: true
    });
  } catch (e) {
    console.warn(`  Failed to parse EXIF for ${filePath}`);
  }

  if (!exifData || !exifData.latitude || !exifData.longitude) {
    console.warn(`  Missing GPS data for ${filePath}`);
    // We now allow photos without GPS
  }

  // Extract Metadata (width/height) from processable buffer
  const metadata = await sharp(processableBuffer).metadata();

  // Use original file as the full-res URL (HEIC browsers may not support, but it's the source of truth)
  // For HEIC, the filename keeps .heic extension; front-end should handle accordingly
  const originalFileName = path.basename(filePath);

  return {
    id: baseName,
    filename: originalFileName,
    webRawUrl: `photos/${categoryName}/${originalFileName}`,
    thumbUrl: `photos/thumbnails/${categoryName}/${thumbFileName}`,
    lat: exifData?.latitude || 0,
    lng: exifData?.longitude || 0,
    date: exifData?.DateTimeOriginal || exifData?.CreateDate || new Date().toISOString(),
    width: metadata.width,
    height: metadata.height,
    make: exifData?.Make || 'Unknown',
    model: exifData?.Model || 'Camera',
    focalLength: exifData?.FocalLength || '?',
    fNumber: exifData?.FNumber || '?',
    iso: exifData?.ISO || '?',
    exposureTime: exifData?.ExposureTime || '?'
  };
}

async function main() {
  const cache = await getGeocache();
  const db = { categories: [] };

  try {
    const categories = await fs.readdir(PHOTOS_DIR);

    for (const category of categories) {
      if (category === 'thumbnails') continue;

      const categoryPath = path.join(PHOTOS_DIR, category);
      const stat = await fs.stat(categoryPath);
      if (!stat.isDirectory()) continue;

      console.log(`\nProcessing category: ${category}`);
      const files = await fs.readdir(categoryPath);
      
      const updatedFiles = [];
      for (const file of files) {
        if (file.includes(' ')) {
          const newFile = file.replace(/\s+/g, '_');
          const oldPath = path.join(categoryPath, file);
          const newPath = path.join(categoryPath, newFile);
          console.log(`  Renaming file: "${file}" -> "${newFile}"`);
          await fs.rename(oldPath, newPath);
          updatedFiles.push(newFile);
        } else {
          updatedFiles.push(file);
        }
      }

      const photos = [];

      for (const file of updatedFiles) {
        const ext = path.extname(file).toLowerCase();
        const baseName = path.basename(file, ext);

        // Skip thumbnails and non-image files
        if (!ext.match(/\.(jpg|jpeg|png|heic|heif|bmp)$/i) || baseName.startsWith('thumb_')) {
          continue;
        }

        // Deduplicate: if this is a JPG and there is a HEIC/HEIF or BMP with the same base name, skip the JPG
        if ((ext === '.jpg' || ext === '.jpeg') && (updatedFiles.includes(`${baseName}.heic`) || updatedFiles.includes(`${baseName}.heif`) || updatedFiles.includes(`${baseName}.bmp`))) {
          continue;
        }

        if (['.jpg', '.jpeg', '.png', '.heic', '.heif', '.bmp'].includes(ext)) {
          const photoData = await processPhoto(path.join(categoryPath, file), category);
          if (photoData) {
            let photoLocationName = 'Unknown Location';
            if (photoData.lat !== 0 || photoData.lng !== 0) {
              photoLocationName = await reverseGeocode(photoData.lat, photoData.lng, cache);
            }
            photoData.locationName = photoLocationName || 'Unknown Location';
            photos.push(photoData);
          }
        }
      }

      if (photos.length > 0) {
        // Sort photos by date
        photos.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Use the first photo's location as category location, preferring one with valid GPS
        const representativePhoto = photos.find(p => p.lat !== 0 && p.lng !== 0) || photos[0];

        let locationName = 'Unknown Location';
        if (representativePhoto.lat !== 0 || representativePhoto.lng !== 0) {
          locationName = await reverseGeocode(representativePhoto.lat, representativePhoto.lng, cache);
        }

        db.categories.push({
          id: category,
          name: category,
          cover: photos[0].thumbUrl,
          lat: representativePhoto.lat,
          lng: representativePhoto.lng,
          locationName: locationName,
          photos: photos
        });
      }
    }

    // Ensure public dir exists
    await fs.mkdir(path.dirname(DB_OUTPUT_PATH), { recursive: true });

    await fs.writeFile(DB_OUTPUT_PATH, JSON.stringify(db, null, 2));
    await saveGeocache(cache);

    console.log(`\nSuccess! Processed ${db.categories.length} categories.`);
    console.log(`Database saved to ${DB_OUTPUT_PATH}`);

  } catch (error) {
    console.error('Error processing photos:', error);
  }
}

main();
