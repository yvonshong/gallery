#!/usr/bin/env python3

import os
import sys
import mimetypes
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    print("Error: boto3 is not installed. Please run: pip install boto3")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("Error: python-dotenv is not installed. Please run: pip install python-dotenv")
    sys.exit(1)

# Resolve current directory and load local .env file
script_dir = Path(__file__).resolve().parent
env_path = script_dir / '.env'

load_dotenv(dotenv_path=env_path)

account_id = os.getenv('CLOUDFLARE_ACCOUNT_ID')
access_key_id = os.getenv('R2_ACCESS_KEY_ID')
secret_access_key = os.getenv('R2_SECRET_ACCESS_KEY')
bucket_name = os.getenv('R2_BUCKET_NAME')

if not all([account_id, access_key_id, secret_access_key, bucket_name]):
    print(f"Error: Missing required environment variables in {env_path}")
    print("Please configure your credentials in the .env file:")
    print("  CLOUDFLARE_ACCOUNT_ID=...")
    print("  R2_ACCESS_KEY_ID=...")
    print("  R2_SECRET_ACCESS_KEY=...")
    print("  R2_BUCKET_NAME=...")
    sys.exit(1)

# Local photos directory is located at the project root
project_root = script_dir.parent.parent
photos_dir = project_root / 'photos'

s3 = boto3.client('s3',
    endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
    aws_access_key_id=access_key_id,
    aws_secret_access_key=secret_access_key,
    region_name='auto'
)

def get_content_type(file_path):
    ext = file_path.suffix.lower()
    if ext in ['.jpg', '.jpeg']:
        return 'image/jpeg'
    elif ext == '.png':
        return 'image/png'
    elif ext == '.heic':
        return 'image/heic'
    elif ext == '.heif':
        return 'image/heif'
    elif ext == '.bmp':
        return 'image/bmp'
    else:
        mime_type, _ = mimetypes.guess_type(str(file_path))
        return mime_type or 'application/octet-stream'

def get_existing_keys(prefix="gallery/"):
    print(f"Fetching list of existing objects in R2 bucket under prefix '{prefix}'...")
    keys = set()
    paginator = s3.get_paginator('list_objects_v2')
    try:
        for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
            if 'Contents' in page:
                for obj in page['Contents']:
                    keys.add(obj['Key'])
        print(f"Found {len(keys)} existing files in R2.")
        return keys
    except ClientError as e:
        print(f"Error listing R2 objects: {e}")
        raise

def upload_file(file_path, r2_key):
    try:
        content_type = get_content_type(file_path)
        with open(file_path, 'rb') as f:
            s3.put_object(
                Bucket=bucket_name,
                Key=r2_key,
                Body=f,
                ContentType=content_type
            )
        return True, r2_key
    except Exception as e:
        return False, f"{r2_key}: {e}"

def main():
    if not photos_dir.exists():
        print(f"Error: Photos directory not found at {photos_dir}")
        sys.exit(1)
        
    local_files = []
    # Collect image files recursively
    valid_extensions = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.bmp'}
    for file_path in photos_dir.rglob('*'):
        if file_path.is_file() and file_path.suffix.lower() in valid_extensions:
            # Skip hidden files/folders
            if any(part.startswith('.') for part in file_path.parts):
                continue
            local_files.append(file_path)
            
    if not local_files:
        print("No local image files found in the photos directory.")
        return

    print(f"Found {len(local_files)} local files in photos directory.")

    # Fetch existing files in R2 under the gallery/ prefix
    try:
        existing_keys = get_existing_keys(prefix="gallery/")
    except Exception:
        sys.exit(1)

    upload_tasks = []
    for file_path in local_files:
        # Get path relative to project root, e.g., "photos/xxx/yyy.jpg"
        rel_path = file_path.relative_to(project_root)
        # R2 key format: gallery/photos/xxx/yyy.jpg
        r2_key = f"gallery/{rel_path.as_posix()}"
        
        if r2_key not in existing_keys:
            upload_tasks.append((file_path, r2_key))

    if not upload_tasks:
        print("All local files are already synchronized with Cloudflare R2.")
        return

    print(f"Starting upload of {len(upload_tasks)} new/missing files...")

    uploaded_count = 0
    max_workers = 5
    
    # Upload files using a thread pool
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(upload_file, path, key): key for path, key in upload_tasks}
        for future in as_completed(futures):
            success, result = future.result()
            if success:
                uploaded_count += 1
                print(f"[{uploaded_count}/{len(upload_tasks)}] Successfully uploaded: {result}")
            else:
                print(f"Failed to upload {result}")

    print(f"\nSynchronization complete. Uploaded {uploaded_count} files.")

if __name__ == "__main__":
    main()
