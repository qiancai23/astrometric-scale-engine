import json
import math
import os
import requests
import warnings
import urllib.request
import csv
import io
warnings.filterwarnings('ignore')
old_request = requests.Session.request
def new_request(*args, **kwargs):
    kwargs['verify'] = False
    return old_request(*args, **kwargs)
requests.Session.request = new_request

from astroquery.gaia import Gaia
from astroquery.jplhorizons import Horizons

def create_systemic_data():
    print("Fetching systemic data from JPL Horizons...")
    bodies = {
        '10': ('Sol', 'Star'),
        '199': ('Mercury', 'Planet'),
        '299': ('Venus', 'Planet'),
        '399': ('Earth', 'Planet'),
        '301': ('Moon', 'Moon'),
        '499': ('Mars', 'Planet'),
        '599': ('Jupiter', 'Planet'),
        '699': ('Saturn', 'Planet'),
        '799': ('Uranus', 'Planet'),
        '899': ('Neptune', 'Planet'),
        '999': ('Pluto', 'Dwarf Planet')
    }
    
    results = []
    for body_id, (name, btype) in bodies.items():
        if body_id == '10':
            results.append({
                "id": "10",
                "name": "Sol",
                "type": "Star",
                "coords": [0.0, 0.0, 0.0]
            })
            continue
            
        obj = Horizons(id=body_id, location='@sun', epochs=None)
        vec = obj.vectors()
        x = float(vec['x'][0])
        y = float(vec['y'][0])
        z = float(vec['z'][0])
        
        results.append({
            "id": body_id,
            "name": name,
            "type": btype,
            "coords": [x, y, z]
        })
        
    os.makedirs('scripts', exist_ok=True)
    with open('scripts/systemic.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    print("Created scripts/systemic.json")

def create_stars_data():
    print("Generating curated hybrid star data...")
    
    custom_targets = [
        # Deep-Sky Objects
        {'name': 'Andromeda Galaxy (M31)', 'origin': 'Messier Catalog', 'type': 'Galaxy', 'ra': 10.684, 'dec': 41.269, 'dist': 778000.0, 'constellation': 'Andromeda', 'mag': 3.44, 'narrative': 'The nearest major galaxy to the Milky Way, containing approximately one trillion stars.'},
        {'name': 'Orion Nebula (M42)', 'origin': 'Messier Catalog', 'type': 'Nebula', 'ra': 83.822, 'dec': -5.391, 'dist': 412.0, 'constellation': 'Orion', 'mag': 4.0, 'narrative': 'A massive star-forming region visible to the naked eye just south of Orion\'s Belt.'},
        {'name': 'Eagle Nebula (M16)', 'origin': 'Messier Catalog', 'type': 'Nebula', 'ra': 274.700, 'dec': -13.806, 'dist': 2146.0, 'constellation': 'Serpens', 'mag': 6.0, 'narrative': 'A diffuse emission nebula famously containing the Pillars of Creation.'},
        {'name': 'Lagoon Nebula (M8)', 'origin': 'Messier Catalog', 'type': 'Nebula', 'ra': 270.925, 'dec': -24.380, 'dist': 1250.0, 'constellation': 'Sagittarius', 'mag': 6.0, 'narrative': 'A giant interstellar cloud and stellar nursery.'},
        {'name': 'Ring Nebula (M57)', 'origin': 'Messier Catalog', 'type': 'Nebula', 'ra': 283.396, 'dec': 33.029, 'dist': 790.0, 'constellation': 'Lyra', 'mag': 8.8, 'narrative': 'A planetary nebula formed by the glowing shell of ionized gas expelled by a dying star.'},
        {'name': 'Crab Nebula (M1)', 'origin': 'Messier Catalog', 'type': 'Nebula', 'ra': 83.633, 'dec': 22.014, 'dist': 2000.0, 'constellation': 'Taurus', 'mag': 8.4, 'narrative': 'The expanding remnant of a historical supernova recorded in 1054 AD.'},
        
        # Exoplanets
        {'name': 'Gliese 12 b', 'origin': 'NASA Exoplanet Archive', 'type': 'Exoplanet', 'ra': 350.413, 'dec': 8.847, 'dist': 12.1, 'constellation': 'Pisces', 'mag': 12.6, 'narrative': 'A temperate Earth-sized exoplanet orbiting a cool red dwarf star.'},
        {'name': 'TRAPPIST-1 e', 'origin': 'NASA Exoplanet Archive', 'type': 'Exoplanet', 'ra': 349.112, 'dec': -5.043, 'dist': 12.1, 'constellation': 'Aquarius', 'mag': 18.8, 'narrative': 'A rocky, Earth-sized exoplanet orbiting within the habitable zone of an ultracool dwarf star.'},
        
        # Anomalies
        {'name': 'Sagittarius A*', 'origin': 'Static Astrometric Anchors', 'type': 'Black Hole', 'ra': 266.416, 'dec': -29.007, 'dist': 8178.0, 'constellation': 'Sagittarius', 'mag': 0.0, 'narrative': 'The supermassive black hole at the galactic center of the Milky Way.'},
        {'name': 'Voyager 1', 'origin': 'Static Astrometric Anchors', 'type': 'Spacecraft', 'ra': 258.21, 'dec': 12.35, 'dist': 0.00078, 'constellation': 'Ophiuchus', 'mag': 0.0, 'narrative': 'The most distant human-made object, currently coasting through interstellar space.'}
    ]

    results = []
    
    print("Downloading HYG Database (approx 30MB)...")
    url = 'https://raw.githubusercontent.com/astronexus/HYG-Database/3964fa862d1f08f05919a35306889fa4a0afa7d6/hyg/v3/hyg_v36_1.csv'
    response = urllib.request.urlopen(url)
    csv_content = response.read().decode('utf-8')
    reader = csv.DictReader(io.StringIO(csv_content))
    
    hyg_stars = []
    for row in reader:
        try:
            mag = float(row['mag'])
        except ValueError:
            continue
            
        proper = row.get('proper', '').strip()
        bayer = row.get('bayer', '').strip()
        flam = row.get('flam', '').strip()
        con = row.get('con', '').strip()
        
        name = proper
        if not name:
            if mag < 5.0 and (bayer or flam) and con:
                prefix = bayer if bayer else flam
                name = f"{prefix} {con}"
                
        if name or proper == 'Sol':
            if proper == 'Sol':
                name = 'Sol'
                
            try:
                x = float(row['x'])
                y = float(row['y'])
                z = float(row['z'])
                d = float(row['dist'])
            except ValueError:
                continue
                
            hyg_stars.append({
                "id": "hyg_" + row['id'],
                "name": name,
                "catalog_origin": 'HYG Database',
                "type": 'Star',
                "coords": [x, y, z],
                "display_metrics": {
                    "constellation": con if con else None,
                    "apparent_magnitude": mag,
                    "true_distance_ly": round(d * 3.26156, 2),
                    "scale_narrative": f"Spectral class: {row.get('spect', 'Unknown')}."
                }
            })
            
    print(f"Parsed {len(hyg_stars)} milky way objects from HYG.")
    results.extend(hyg_stars)

    for t in custom_targets:
        ra_rad = math.radians(t['ra'])
        dec_rad = math.radians(t['dec'])
        d = t['dist']
        x = d * math.cos(dec_rad) * math.cos(ra_rad)
        y = d * math.cos(dec_rad) * math.sin(ra_rad)
        z = d * math.sin(dec_rad)
        
        results.append({
            "id": "custom_" + t['name'].replace(' ', '_').replace('*', 'star').replace('(', '').replace(')', ''),
            "name": t['name'],
            "catalog_origin": t['origin'],
            "type": t['type'],
            "coords": [x, y, z],
            "display_metrics": {
                "constellation": t.get('constellation'),
                "apparent_magnitude": t.get('mag'),
                "true_distance_ly": round(d * 3.26156, 2),
                "scale_narrative": t.get('narrative')
            }
        })

    with open('scripts/stars.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    print("Created scripts/stars.json")

if __name__ == '__main__':
    create_systemic_data()
    create_stars_data()
