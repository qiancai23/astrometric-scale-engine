import { useFlightStore, AstroObject } from './useFlightStore';

describe('useFlightStore', () => {
  const origin: AstroObject = {
    id: "10",
    name: "Sol",
    type: "Star",
    coords: [0.0, 0.0, 0.0]
  };

  const destination: AstroObject = {
    id: "399",
    name: "Earth",
    type: "Planet",
    coords: [
      -0.4732197129518734,
      -0.8950841086910298,
      5.637597285885784e-05
    ]
  };

  it('calculates systemic sublight physics correctly', () => {
    const { setRegime, setOrigin, setDestination, setDriveCore } = useFlightStore.getState();
    
    setRegime('Systemic');
    setDriveCore('Sublight');
    setOrigin(origin);
    setDestination(destination);
    
    const state = useFlightStore.getState();
    
    expect(state.distanceMeters).toBeGreaterThan(0);
    expect(state.sublightResult).not.toBeNull();
    expect(state.warpResult).toBeNull();
  });
  
  it('resets origin and destination on regime change', () => {
    const { setRegime } = useFlightStore.getState();
    
    setRegime('Interstellar');
    
    const state = useFlightStore.getState();
    expect(state.origin).toBeNull();
    expect(state.destination).toBeNull();
    expect(state.distanceMeters).toBe(0);
    expect(state.sublightResult).toBeNull();
    expect(state.warpResult).toBeNull();
  });
});

describe('useFlightStore — redesign behaviour', () => {
  const { FAMOUS_FLIGHTS, DEFAULT_FLIGHT } = require('../data/famousFlights');
  const { findBySlug, getEntry } = require('../data/catalog');
  const { specFromState } = require('./useFlightStore');
  const store = () => useFlightStore.getState();

  it('loads every famous flight with a real route and result', () => {
    for (const flight of FAMOUS_FLIGHTS) {
      expect(store().loadFlight(flight.spec)).toBe(true);
      const s = store();
      expect(s.origin).not.toBeNull();
      expect(s.destination).not.toBeNull();
      expect(s.distanceMeters).toBeGreaterThan(0);
      expect(s.profile).not.toBeNull();
      expect(s.profile!.totalTime).toBeGreaterThan(0);
      expect(s.engineId).toBe(flight.spec.engine);
      expect(s.comparison).toHaveLength(5);
    }
  });

  it('gives plausible times for the historical flights', () => {
    const day = 86400;
    const year = 31557600;
    store().loadFlight(FAMOUS_FLIGHTS.find((f: { id: string }) => f.id === 'apollo-moon').spec);
    expect(store().profile!.totalTime).toBeGreaterThan(2 * day);
    expect(store().profile!.totalTime).toBeLessThan(5 * day);
    store().loadFlight(FAMOUS_FLIGHTS.find((f: { id: string }) => f.id === 'sol-proxima').spec);
    expect(store().profile!.totalTime / year).toBeGreaterThan(5.5);
    expect(store().profile!.totalTime / year).toBeLessThan(6.2);
    expect(store().profile!.totalProperTime / year).toBeGreaterThan(3.3);
    expect(store().profile!.totalProperTime / year).toBeLessThan(3.8);
  });

  it('rejects a flight whose places cannot be found or do not share a map', () => {
    expect(store().loadFlight({ from: 'nowhere', to: 'mars', engine: 'fusion' })).toBe(false);
    expect(store().loadFlight({ from: 'earth', to: 'sirius', engine: 'fusion' })).toBe(false);
    expect(store().loadFlight({ from: 'mars', to: 'mars', engine: 'fusion' })).toBe(false);
  });

  it('round-trips the current flight through its shareable description', () => {
    store().loadFlight({ from: 'sol', to: 'sirius', engine: 'antimatter', a: 2, v: 0.99, m: 500 });
    const spec = specFromState(store());
    expect(spec).toEqual({ from: 'sol', to: 'sirius', engine: 'antimatter', a: 2, v: 0.99, m: 500 });
    store().loadFlight(DEFAULT_FLIGHT);
    expect(store().loadFlight(spec)).toBe(true);
    expect(store().accelerationG).toBe(2);
    expect(store().speedCapC).toBe(0.99);
    expect(store().mass).toBe(500_000);
  });

  it('remembers each engine\'s tuning and never leaves a new engine at the bottom of its range', () => {
    store().loadFlight(DEFAULT_FLIGHT);
    store().setEngine('chemical');
    expect(store().speedCapC).toBe(0.0001);
    store().setEngine('antimatter');
    expect(store().driveCore).toBe('Sublight');
    expect(store().speedCapC).toBe(0.999);
    store().setShipParams({ speedCapC: 0.5, accelerationG: 2 });
    store().setEngine('warp');
    expect(store().driveCore).toBe('Warp');
    expect(store().warpResult).not.toBeNull();
    expect(store().sublightResult).toBeNull();
    store().setEngine('antimatter');
    expect(store().speedCapC).toBe(0.5);
    expect(store().accelerationG).toBe(2);
  });

  it('clamps ship parameters to the selected engine', () => {
    store().loadFlight(DEFAULT_FLIGHT);
    store().setEngine('antimatter');
    store().setShipParams({ speedCapC: 5, accelerationG: 99, mass: 1 });
    expect(store().speedCapC).toBe(0.999);
    expect(store().accelerationG).toBe(3);
    expect(store().mass).toBe(25_000);
    store().setShipParams({ warpFactor: 1000 });
    expect(store().warpFactor).toBe(50);
  });

  it('switches map when an object from the other map is chosen', () => {
    store().loadFlight(DEFAULT_FLIGHT); // Earth to Mars
    expect(store().regime).toBe('Systemic');
    const sirius = findBySlug('sirius', 'Interstellar');
    store().setEndpoint('destination', sirius.id);
    expect(store().regime).toBe('Interstellar');
    expect(store().destination!.id).toBe(sirius.id);
    expect(getEntry(store().origin!.id).slug).toBe('sol');
    expect(store().toast).not.toBeNull();
    expect(store().distanceMeters).toBeGreaterThan(0);

    // And back: choosing Mars as the origin returns to the solar system.
    const mars = findBySlug('mars', 'Systemic');
    store().setEndpoint('origin', mars.id);
    expect(store().regime).toBe('Systemic');
    expect(store().origin!.id).toBe(mars.id);
    expect(store().destination).not.toBeNull();
    expect(store().destination!.id).not.toBe(mars.id);
  });

  it('keeps Sol when switching between maps', () => {
    store().loadFlight({ from: 'sol', to: 'mars', engine: 'fusion' });
    const vega = findBySlug('vega', 'Interstellar');
    store().setEndpoint('destination', vega.id);
    expect(store().regime).toBe('Interstellar');
    expect(store().origin!.id).toBe('hyg_0');
  });

  it('swaps instead of creating a zero-length flight', () => {
    store().loadFlight(DEFAULT_FLIGHT);
    const originId = store().origin!.id;
    const destinationId = store().destination!.id;
    store().setEndpoint('destination', originId);
    expect(store().origin!.id).toBe(destinationId);
    expect(store().destination!.id).toBe(originId);
    store().swapEndpoints();
    expect(store().origin!.id).toBe(originId);
  });

  it('switchRegime loads that map\'s default route', () => {
    store().switchRegime('Interstellar');
    expect(getEntry(store().origin!.id).slug).toBe('sol');
    expect(getEntry(store().destination!.id).slug).toBe('proxima-centauri');
    store().switchRegime('Systemic');
    expect(getEntry(store().origin!.id).slug).toBe('earth');
  });

  it('plays, advances, arrives and rewinds', () => {
    store().loadFlight(DEFAULT_FLIGHT);
    const arrivals = store().arrivalCount;
    store().play();
    expect(store().playing).toBe(true);
    expect(store().hasFlown).toBe(true);
    store().advance(0.4);
    expect(store().progress).toBeCloseTo(0.4);
    store().advance(0.7);
    expect(store().progress).toBe(1);
    expect(store().playing).toBe(false);
    expect(store().arrivalCount).toBe(arrivals + 1);
    store().play(); // replay from the start
    expect(store().progress).toBe(0);
    store().seek(0.5);
    const revision = store().flightRevision;
    store().setShipParams({ accelerationG: 0.5 }); // any change to the flight stops and rewinds
    expect(store().playing).toBe(false);
    expect(store().progress).toBe(0);
    expect(store().flightRevision).toBe(revision + 1);
  });

  it('counts route changes separately from tuning changes', () => {
    store().loadFlight(DEFAULT_FLIGHT);
    const route = store().routeRevision;
    store().setShipParams({ mass: 2_000_000 });
    expect(store().routeRevision).toBe(route);
    store().swapEndpoints();
    expect(store().routeRevision).toBe(route + 1);
  });
});
