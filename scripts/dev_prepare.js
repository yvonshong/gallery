/**
 * dev_prepare.js — 离线调试模式图片处理脚本
 *
 * 功能：
 *   1. 把 photos/<category>/ 下的 HEIC 文件转成 JPG，保留在原位置
 *   2. 为所有图片生成缩略图，统一放到 photos/thumbnails/<category>/ 下
 *   3. 更新 public/photos_db.json（webRawUrl 指向 JPG，thumbUrl 指向缩略图）
 *
 * 用法：
 *   node scripts/dev_prepare.js
 */

import fs from 'fs/promises';
import path from 'path';
import exifr from 'exifr';
import sharp from 'sharp';
import convert from 'heic-convert';
import https from 'https';

const PHOTOS_DIR    = path.join(process.cwd(), 'photos');
const THUMBS_DIR    = path.join(PHOTOS_DIR, 'thumbnails');
const DB_OUTPUT     = path.join(process.cwd(), 'public', 'photos_db.json');
const CACHE_PATH    = path.join(process.cwd(), '.geocache.json');
const THUMB_WIDTH   = 800;
const THUMB_QUALITY = 80;
const JPG_QUALITY   = 88;   // HEIC → JPG 转换质量

// ─── 工具函数 ────────────────────────────────────────────────────────────────

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadCache() {
  try { return JSON.parse(await fs.readFile(CACHE_PATH, 'utf-8')); }
  catch { return {}; }
}

async function saveCache(cache) {
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function reverseGeocode(lat, lng, cache) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache[key]) return cache[key];

  await delay(1100); // Nominatim: 1 req/s

  return new Promise((resolve) => {
    const opts = {
      hostname: 'nominatim.openstreetmap.org',
      path: `/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
      headers: { 'User-Agent': 'Gallery-Build-Script/1.0' },
    };
    https.get(opts, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try {
          const a = JSON.parse(raw).address || {};
          const parts = [
            a.country,
            a.state || a.province || a.region,
            a.city  || a.town    || a.village || a.county,
          ].filter(Boolean);
          const name = [...new Set(parts)].join(' ');
          cache[key] = name;
          resolve(name);
        } catch {
          resolve('');
        }
      });
    }).on('error', () => resolve(''));
  });
}

// ─── HEIC → JPG 原地转换 ─────────────────────────────────────────────────────

/**
 * 如果 filePath 是 HEIC 且同目录下还没有对应 JPG，就转换并保存 JPG。
 * 返回：{ jpgPath, buffer } — buffer 是已解码的 JPEG buffer（可直接传给 sharp）
 */
async function ensureJpg(filePath) {
  const ext      = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, ext);
  const dir      = path.dirname(filePath);
  const jpgPath  = path.join(dir, `${baseName}.jpg`);

  if (ext !== '.heic') {
    // 非 HEIC，直接读原文件
    return { jpgPath: filePath, buffer: await fs.readFile(filePath) };
  }

  const heicBuffer = await fs.readFile(filePath);

  // 检查 JPG 是否已存在
  let jpgExists = false;
  try { await fs.access(jpgPath); jpgExists = true; } catch { /* noop */ }

  if (jpgExists) {
    // 已有 JPG，直接读它（避免重复转换）
    console.log(`  [skip] JPG already exists: ${path.basename(jpgPath)}`);
    return { jpgPath, buffer: await fs.readFile(jpgPath) };
  }

  // 需要转换
  console.log(`  Converting HEIC → JPG: ${path.basename(jpgPath)}`);
  const jpegBuffer = await convert({ buffer: heicBuffer, format: 'JPEG', quality: 1 });
  await sharp(jpegBuffer)
    .jpeg({ quality: JPG_QUALITY })
    .toFile(jpgPath);

  return { jpgPath, buffer: jpegBuffer };
}

// ─── 单张图片处理 ─────────────────────────────────────────────────────────────

async function processPhoto(filePath, categoryName) {
  console.log(`Processing: ${path.basename(filePath)}`);
  const origExt   = path.extname(filePath).toLowerCase();
  const baseName  = path.basename(filePath, origExt);

  // 1. 确保有 JPG（HEIC 转换 / 直接读 JPG）
  const { jpgPath, buffer } = await ensureJpg(filePath);
  const jpgFileName = path.basename(jpgPath);

  // 2. 缩略图路径
  const thumbDir  = path.join(THUMBS_DIR, categoryName);
  await fs.mkdir(thumbDir, { recursive: true });
  const thumbFile = `thumb_${baseName}.jpg`;
  const thumbPath = path.join(thumbDir, thumbFile);

  // 3. 生成缩略图（如果还没有）
  let needsThumb = false;
  try { await fs.access(thumbPath); } catch { needsThumb = true; }

  if (needsThumb) {
    console.log(`  Generating thumbnail...`);
    await sharp(buffer)
      .rotate()            // 自动应用 EXIF 方向，防止竖图被旋转
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY })
      .toFile(thumbPath);
  }

  // 4. 读取 EXIF（从原始文件读，exifr 支持 HEIC）
  let exif = null;
  try {
    const origBuffer = origExt === '.heic'
      ? await fs.readFile(filePath)   // HEIC 原文件保留 EXIF 最完整
      : buffer;
    exif = await exifr.parse(origBuffer, { tiff: true, ifd0: true, exif: true, gps: true });
  } catch {
    console.warn(`  Failed to parse EXIF for ${path.basename(filePath)}`);
  }

  if (!exif?.latitude || !exif?.longitude) {
    console.warn(`  Missing GPS: ${path.basename(filePath)}`);
  }

  // 5. 图片尺寸
  const meta = await sharp(buffer).metadata();

  return {
    id:           baseName,
    filename:     jpgFileName,
    webRawUrl:    `photos/${categoryName}/${jpgFileName}`,
    thumbUrl:     `photos/thumbnails/${categoryName}/${thumbFile}`,
    lat:          exif?.latitude  || 0,
    lng:          exif?.longitude || 0,
    date:         exif?.DateTimeOriginal || exif?.CreateDate || new Date().toISOString(),
    width:        meta.width,
    height:       meta.height,
    make:         exif?.Make         || 'Unknown',
    model:        exif?.Model        || 'Camera',
    focalLength:  exif?.FocalLength  || '?',
    fNumber:      exif?.FNumber      || '?',
    iso:          exif?.ISO          || '?',
    exposureTime: exif?.ExposureTime || '?',
  };
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
  const cache = await loadCache();
  const db    = { categories: [] };

  await fs.mkdir(THUMBS_DIR, { recursive: true });

  const entries = await fs.readdir(PHOTOS_DIR);

  for (const entry of entries) {
    // 只处理形如 YYYY.MM-Name 的相册文件夹，跳过其他目录（thumbnails、dist 等）
    if (!/^\d{4}\.\d{2}-/.test(entry)) continue;

    const categoryPath = path.join(PHOTOS_DIR, entry);
    const stat = await fs.stat(categoryPath);
    if (!stat.isDirectory()) continue;

    console.log(`\n── Category: ${entry}`);
    const files  = await fs.readdir(categoryPath);
    const photos = [];

    for (const file of files) {
      const ext      = path.extname(file).toLowerCase();
      const baseName = path.basename(file, ext);

      // 只处理图片，跳过缩略图
      if (!ext.match(/\.(jpg|jpeg|png|heic)$/i)) continue;
      if (baseName.startsWith('thumb_')) continue;

      // 去重：如果同目录已有对应 HEIC，跳过同名 JPG（HEIC 优先）
      if ((ext === '.jpg' || ext === '.jpeg') && files.includes(`${baseName}.heic`)) {
        console.log(`  [skip] ${file} (HEIC counterpart exists)`);
        continue;
      }

      const data = await processPhoto(path.join(categoryPath, file), entry);
      if (data) photos.push(data);
    }

    if (photos.length === 0) continue;

    // 按日期排序
    photos.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 代表坐标（优先有 GPS 的）
    const rep = photos.find((p) => p.lat !== 0 && p.lng !== 0) || photos[0];
    let locationName = 'Unknown Location';
    if (rep.lat !== 0 || rep.lng !== 0) {
      locationName = await reverseGeocode(rep.lat, rep.lng, cache);
    }

    db.categories.push({
      id:           entry,
      name:         entry,
      cover:        photos[0].thumbUrl,
      lat:          rep.lat,
      lng:          rep.lng,
      locationName,
      photos,
    });
  }

  await fs.mkdir(path.dirname(DB_OUTPUT), { recursive: true });
  await fs.writeFile(DB_OUTPUT, JSON.stringify(db, null, 2));
  await saveCache(cache);

  console.log(`\n✅ Done! ${db.categories.length} categories processed.`);
  console.log(`   Database → ${DB_OUTPUT}`);
  console.log(`   Thumbnails → ${THUMBS_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
