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

import datetime
import urllib.parse

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
        '999': ('Pluto', 'Dwarf Planet'),
        '1;': ('Ceres', 'Dwarf Planet'),
        '136199;': ('Eris', 'Dwarf Planet'),
        '136108;': ('Haumea', 'Dwarf Planet'),
        '136472;': ('Makemake', 'Dwarf Planet'),
        '90377;': ('Sedna', 'Dwarf Planet'),
        '50000;': ('Quaoar', 'Dwarf Planet'),
        '90482;': ('Orcus', 'Dwarf Planet'),
        '225088;': ('Gonggong', 'Dwarf Planet'),
        '4;': ('Vesta', 'Asteroid'),
        '2;': ('Pallas', 'Asteroid'),
        '3;': ('Juno', 'Asteroid'),
        '10;': ('Hygiea', 'Asteroid'),
        '16;': ('Psyche', 'Asteroid'),
        '433;': ('Eros', 'Asteroid'),
        '101955;': ('Bennu', 'Asteroid'),
        '162173;': ('Ryugu', 'Asteroid')
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

        periods = {
            '199': 0.24, '299': 0.615, '399': 1.0, '301': 0.074, 
            '499': 1.88, '599': 11.86, '699': 29.46, '799': 84.01, 
            '899': 164.8, '999': 248.0, '1;': 4.6, '136199;': 558.0, 
            '136108;': 284.0, '136472;': 306.0, '90377;': 11400.0, 
            '50000;': 288.0, '90482;': 247.0, '225088;': 554.0, 
            '4;': 3.63, '2;': 4.62, '3;': 4.36, '10;': 5.56, 
            '16;': 4.99, '433;': 1.76, '101955;': 1.19, '162173;': 1.30
        }
            
        period = periods.get(body_id, 1.0)
        
        half_period = period / 2.0
        start_year = max(1900, 2024 - half_period)
        end_year = min(2190, 2024 + half_period)
        
        start_date = datetime.date(int(start_year), 1, 1)
        end_date = datetime.date(int(end_year), 1, 1)
        
        epochs_dict = {
            'start': start_date.strftime('%Y-%m-%d'),
            'stop': end_date.strftime('%Y-%m-%d'),
            'step': '100'
        }

        obj = Horizons(id=body_id, location='@sun', epochs=epochs_dict)
        vec = obj.vectors()
        x = float(vec['x'][0])
        y = float(vec['y'][0])
        z = float(vec['z'][0])
        
        orbit_path = []
        for i in range(len(vec)):
            orbit_path.append([float(vec['x'][i]), float(vec['y'][i]), float(vec['z'][i])])

        results.append({
            "id": body_id,
            "name": name,
            "type": btype,
            "coords": [x, y, z],
            "orbit_path": orbit_path
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
        {'name': 'Voyager 1', 'origin': 'Static Astrometric Anchors', 'type': 'Spacecraft', 'ra': 258.21, 'dec': 12.35, 'dist': 0.00078, 'constellation': 'Ophiuchus', 'mag': 0.0, 'narrative': 'The most distant human-made object, currently coasting through interstellar space.'},
        {'name': 'Voyager 2', 'origin': 'Static Astrometric Anchors', 'type': 'Spacecraft', 'ra': 304.29, 'dec': -59.5, 'dist': 0.00069, 'constellation': 'Pavo', 'mag': 0.0, 'narrative': 'The only spacecraft to have visited Uranus and Neptune.'},
        {'name': 'New Horizons', 'origin': 'Static Astrometric Anchors', 'type': 'Spacecraft', 'ra': 290.75, 'dec': -20.03, 'dist': 0.00031, 'constellation': 'Sagittarius', 'mag': 0.0, 'narrative': 'The first spacecraft to explore Pluto and the Kuiper belt.'},
        {'name': 'Pioneer 10', 'origin': 'Static Astrometric Anchors', 'type': 'Spacecraft', 'ra': 79.35, 'dec': 26.05, 'dist': 0.00069, 'constellation': 'Taurus', 'mag': 0.0, 'narrative': 'The first spacecraft to travel through the asteroid belt and visit Jupiter.'},
        {'name': 'Pioneer 11', 'origin': 'Static Astrometric Anchors', 'type': 'Spacecraft', 'ra': 285.0, 'dec': -8.68, 'dist': 0.00056, 'constellation': 'Aquila', 'mag': 0.0, 'narrative': 'The first probe to encounter Saturn.'}
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

    print("Downloading Exoplanets from NASA Archive...")
    query = "select pl_name, ra, dec, sy_dist, pl_bmasse from pscomppars where sy_dist < 100 and sy_dist IS NOT NULL"
    url = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=" + urllib.parse.quote(query) + "&format=json"
    
    try:
        response = urllib.request.urlopen(url)
        data = json.loads(response.read().decode('utf-8'))
        
        exoplanets = []
        for idx, row in enumerate(data):
            name = row.get('pl_name', f'Exoplanet {idx}')
            # Avoid duplicating ones already manually defined
            if name in ['Gliese 12 b', 'TRAPPIST-1 e']: continue
            
            ra = row.get('ra', 0.0)
            dec = row.get('dec', 0.0)
            d = row.get('sy_dist', 10.0)
            
            ra_rad = math.radians(ra)
            dec_rad = math.radians(dec)
            
            x = d * math.cos(dec_rad) * math.cos(ra_rad)
            y = d * math.cos(dec_rad) * math.sin(ra_rad)
            z = d * math.sin(dec_rad)
            
            mass = row.get('pl_bmasse')
            mass_str = f"{mass:.1f} Earth masses" if mass else "Unknown mass"
            
            exoplanets.append({
                "id": f"nasa_exo_{idx}",
                "name": name,
                "catalog_origin": "NASA Exoplanet Archive",
                "type": "Exoplanet",
                "coords": [x, y, z],
                "display_metrics": {
                    "constellation": None,
                    "apparent_magnitude": None,
                    "true_distance_ly": round(d * 3.26156, 2),
                    "scale_narrative": mass_str
                }
            })
        print(f"Parsed {len(exoplanets)} exoplanets from NASA TAP.")
        results.extend(exoplanets)
    except Exception as e:
        print("Failed to download exoplanets:", e)

    with open('scripts/stars.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    print("Created scripts/stars.json")

if __name__ == '__main__':
    create_systemic_data()
    create_stars_data()
