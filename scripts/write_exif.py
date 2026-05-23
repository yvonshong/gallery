#!/usr/bin/env python3
import sys
import re
import json
import urllib.request
import subprocess

def fetch_locations():
    url = "https://yvonshong.github.io/map/data/locations.js"
    # 添加 User-Agent 防止被屏蔽
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            data = response.read().decode('utf-8')
    except Exception as e:
        print(f"Error fetching locations.js: {e}")
        sys.exit(1)
        
    # 提取 const myPlaces = [...]; 中的 JSON 部分
    match = re.search(r'const\s+myPlaces\s*=\s*(\[\s*\{.*?\}\s*\]);', data, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON: {e}")
            sys.exit(1)
    else:
        print("Error: Could not find 'myPlaces' array in locations.js")
        sys.exit(1)

def main():
    force = False
    while "--force" in sys.argv:
        force = True
        sys.argv.remove("--force")
    while "-f" in sys.argv:
        force = True
        sys.argv.remove("-f")

    if len(sys.argv) < 3:
        print("Usage: python3 scripts/write_exif.py [--force] <CityName> <file1> [file2 ...]")
        print("Example: python3 scripts/write_exif.py --force \"Tokyo\" photos/2026.03-Tokyo/*.heic")
        sys.exit(1)

    target_city = sys.argv[1].lower()
    files = sys.argv[2:]

    # Preprocess files to support BMP: convert BMP to JPG on disk and write EXIF to the JPG
    import os
    processed_files = []
    for f in files:
        base, ext = os.path.splitext(f)
        if ext.lower() == '.bmp':
            jpg_path = base + '.jpg'
            if not os.path.exists(jpg_path):
                print(f"Converting BMP to JPG: {f} -> {jpg_path}")
                try:
                    subprocess.run(["convert", f, "-quality", "88", jpg_path], check=True)
                except Exception as e:
                    print(f"Error converting BMP to JPG: {e}")
            processed_files.append(jpg_path)
        else:
            processed_files.append(f)
    files = processed_files

    # Filter files that already have EXIF GPS data to avoid overwriting them, unless force is True
    filtered_files = []
    for f in files:
        if force:
            filtered_files.append(f)
            continue

        cmd = ["exiftool", "-m", "-GPSLatitude", "-GPSLongitude", f]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if "GPS Latitude" in res.stdout or "GPS Longitude" in res.stdout:
                print(f"  [skip] {f} already has EXIF GPS data (use --force or -f to overwrite)")
                continue
        except Exception:
            pass
        filtered_files.append(f)
    
    files = filtered_files

    if not files:
        print("\n✅ All files already have EXIF GPS data. No updates needed!")
        sys.exit(0)

    print("Fetching locations data...")
    places = fetch_locations()

    # 模糊匹配城市
    matched_place = None
    for p in places:
        if target_city in p.get('city', '').lower():
            matched_place = p
            break

    if not matched_place:
        print(f"Error: City containing '{sys.argv[1]}' not found in locations.js!")
        sys.exit(1)

    city_name = matched_place['city']
    lat = float(matched_place['lat'])
    lon = float(matched_place['lon'])

    print(f"\nFound City: {city_name}")
    print(f"Coordinates: Lat {lat}, Lon {lon}")

    lat_ref = 'N' if lat >= 0 else 'S'
    lon_ref = 'E' if lon >= 0 else 'W'

    # 构造 exiftool 参数
    cmd = [
        "exiftool",
        "-m",  # 忽略 minor errors，如 Bad IFD1 directory
        f"-GPSLatitude={abs(lat)}",
        f"-GPSLatitudeRef={lat_ref}",
        f"-GPSLongitude={abs(lon)}",
        f"-GPSLongitudeRef={lon_ref}",
        f"-City={city_name}",
        f"-Location={city_name}",
        f"-UserComment={city_name}",
        "-overwrite_original"
    ] + files

    print(f"\nWriting EXIF data to {len(files)} files...")
    try:
        subprocess.run(cmd, check=True)
        print("\n✅ Successfully updated EXIF data!")
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Error running exiftool. Exited with code {e.returncode}")
        sys.exit(1)
    except FileNotFoundError:
        print("\n❌ Error: 'exiftool' command not found. Please install it (e.g., sudo apt install libimage-exiftool-perl)")
        sys.exit(1)

if __name__ == "__main__":
    main()
