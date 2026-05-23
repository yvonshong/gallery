#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

// Resolve current directory and load local .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');

dotenv.config({ path: envPath });

const {
  CLOUDFLARE_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME
} = process.env;

if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error(`Error: Missing required environment variables in ${envPath}`);
  console.error('Please configure your credentials in the .env file in the publish_img directory:');
  console.error('  CLOUDFLARE_ACCOUNT_ID=...');
  console.error('  R2_ACCESS_KEY_ID=...');
  console.error('  R2_SECRET_ACCESS_KEY=...');
  console.error('  R2_BUCKET_NAME=...');
  process.exit(1);
}

// Local photos directory is located at the project root
const PHOTOS_DIR = path.join(__dirname, '..', '..', 'photos');

// Initialize S3/R2 client
const s3 = new S3Client({
  endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  region: 'auto',
});

// Helper to get mime type
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.heic':
      return 'image/heic';
    case '.heif':
      return 'image/heif';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

// Recursively get all files in a directory
async function getFilesRecursively(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const res = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        return getFilesRecursively(res);
      } else {
        // Skip hidden files
        if (entry.name.startsWith('.')) return [];
        return res;
      }
    })
  );
  return files.flat();
}

// Fetch all keys currently in the R2 bucket under the "photos/" prefix
async function getExistingR2Keys() {
  console.log('Fetching list of existing objects in R2 bucket...');
  const keys = new Set();
  let continuationToken = undefined;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: R2_BUCKET_NAME,
        Prefix: 'photos/',
        ContinuationToken: continuationToken,
      });

      const response = await s3.send(command);
      if (response.Contents) {
        for (const obj of response.Contents) {
          keys.add(obj.Key);
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`Found ${keys.size} existing files in R2.`);
    return keys;
  } catch (error) {
    console.error('Error listing R2 objects:', error.message);
    throw error;
  }
}

// Limit concurrency for upload
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

async function main() {
  try {
    // 1. Scan local photos directory
    let localFiles = [];
    try {
      localFiles = await getFilesRecursively(PHOTOS_DIR);
    } catch (e) {
      console.error(`Error reading local photos directory ${PHOTOS_DIR}:`, e.message);
      process.exit(1);
    }

    if (localFiles.length === 0) {
      console.log('No local files found in the photos directory.');
      return;
    }

    console.log(`Found ${localFiles.length} local files in photos directory.`);

    // 2. Fetch existing R2 keys
    const existingKeys = await getExistingR2Keys();

    // 3. Filter files that need upload
    const uploadTasks = [];
    for (const filePath of localFiles) {
      const relativePath = path.relative(path.join(PHOTOS_DIR, '..'), filePath);
      // Key must use forward slashes even on Windows
      const r2Key = relativePath.replace(/\\/g, '/');

      // Filter only image types we care about
      const ext = path.extname(filePath).toLowerCase();
      if (!ext.match(/\.(jpg|jpeg|png|heic|heif|bmp)$/i)) {
        continue;
      }

      if (!existingKeys.has(r2Key)) {
        uploadTasks.push({ filePath, r2Key });
      }
    }

    if (uploadTasks.length === 0) {
      console.log('All local files are already synchronized with Cloudflare R2.');
      return;
    }

    console.log(`Starting upload of ${uploadTasks.length} new/missing files...`);

    let uploadedCount = 0;

    // 4. Upload tasks with concurrency pool of 5
    await asyncPool(5, uploadTasks, async ({ filePath, r2Key }) => {
      try {
        const fileBuffer = await fs.readFile(filePath);
        const command = new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: r2Key,
          Body: fileBuffer,
          ContentType: getContentType(filePath),
        });

        await s3.send(command);
        uploadedCount++;
        console.log(`[${uploadedCount}/${uploadTasks.length}] Successfully uploaded: ${r2Key}`);
      } catch (err) {
        console.error(`Failed to upload ${r2Key}:`, err.message);
      }
    });

    console.log(`\nSynchronization complete. Uploaded ${uploadedCount} files.`);
  } catch (error) {
    console.error('Fatal error during synchronization:', error);
    process.exit(1);
  }
}

main();
