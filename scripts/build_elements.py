"""Fetch orbital elements for the dwarf planets and asteroids of the solar-system map.

Writes scripts/elements.json, which src/physics/ephemeris.ts imports. The eight planets and the
Moon are not here: their elements are built into ephemeris.ts.

Source: NASA JPL Small-Body Database API (heliocentric, ecliptic J2000, osculating elements).
Needs network access; uses only the Python standard library.

    python scripts/build_elements.py
"""
import json
import os
import urllib.parse
import time
import urllib.error
import urllib.request

# Catalog name -> Small-Body Database search string.
BODIES = {
    'Pluto': '134340', 'Ceres': '1', 'Eris': '136199', 'Haumea': '136108', 'Makemake': '136472',
    'Sedna': '90377', 'Quaoar': '50000', 'Orcus': '90482', 'Gonggong': '225088',
    'Vesta': '4', 'Pallas': '2', 'Juno': '3', 'Hygiea': '10', 'Psyche': '16', 'Eros': '433',
    'Bennu': '101955', 'Ryugu': '162173',
}


def fetch(sstr):
    url = 'https://ssd-api.jpl.nasa.gov/sbdb.api?' + urllib.parse.urlencode({'sstr': sstr, 'full-prec': 'true'})
    for attempt in range(6):  # the service answers "502 Bad Gateway" now and then
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                data = json.load(resp)
            break
        except urllib.error.URLError:
            if attempt == 5:
                raise
            time.sleep(2 + 2 * attempt)
    orbit = data['orbit']
    el = {e['name']: float(e['value']) for e in orbit['elements'] if e['value'] is not None}
    return {
        'a': el['a'],            # semi-major axis, AU
        'e': el['e'],            # eccentricity
        'i': el['i'],            # inclination, degrees
        'node': el['om'],        # longitude of the ascending node, degrees
        'peri': el['w'],         # argument of perihelion, degrees
        'M': el['ma'],           # mean anomaly at the epoch, degrees
        'epochJD': float(orbit['epoch']),
    }


def main():
    out = {}
    for name, sstr in BODIES.items():
        out[name] = fetch(sstr)
        print(name, out[name])
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'elements.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)
    print('Wrote', path)


if __name__ == '__main__':
    main()
