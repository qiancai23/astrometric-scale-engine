import { useFlightStore, specFromState } from './useFlightStore';
import { FAMOUS_FLIGHTS } from '../data/famousFlights';
import { dayFromIso, isoFromDay } from '../physics/ephemeris';
import { buildFlightQuery, parseFlightSpec } from '../lib/urlState';
import { getSublightEngine, dvToSlider, sliderToDv } from '../data/engines';

const store = () => useFlightStore.getState();
const DAY = 86400;
const day = (iso: string): number => dayFromIso(iso) as number;
const famous = (id: string) => FAMOUS_FLIGHTS.find((f) => f.id === id)!.spec;

describe('solar-system flights depend on the date and on orbits', () => {
  it('a chemical rocket to Mars takes months, not weeks', () => {
    store().loadFlight({ from: 'earth', to: 'mars', engine: 'chemical', date: '2026-11-16' });
    const s = store();
    expect(s.plan).not.toBeNull();
    expect(s.plan!.model).toBe('ballistic');
    expect(s.plan!.feasible).toBe(true);
    expect(s.deltaVKms).toBe(6);
    expect(s.profile!.totalTime / DAY).toBeGreaterThan(100);
    expect(s.profile!.totalTime / DAY).toBeLessThan(330);
    expect(s.plan!.dvNeededKms!).toBeLessThanOrEqual(6.0001);
    expect(s.profile!.trajectory!.kind).toBe('ballistic');
    expect(s.comparison).toHaveLength(5);
    // The engine card for the chemical rocket shows the same flight.
    expect(s.comparison[0].earthSeconds).toBeCloseTo(s.profile!.totalTime, 3);
  });

  it('the launch date changes the answer', () => {
    store().loadFlight({ from: 'earth', to: 'mars', engine: 'chemical', date: '2026-11-16' });
    const inWindow = store().plan!;
    store().setDepartureDay(day('2027-09-01')); // Mars on the far side of the Sun
    const offWindow = store().plan!;
    expect(store().departureDay).toBe(day('2027-09-01'));
    // Out of the window the ship waits, or flies a longer path.
    expect(offWindow.arrivalDay - day('2027-09-01')).toBeGreaterThan(inWindow.arrivalDay - day('2026-11-16') + 30);
    expect(offWindow.dvOnRequestedDayKms!).toBeGreaterThan(inWindow.dvOnRequestedDayKms!);
  });

  it('a smaller fuel budget never arrives sooner; too small is flagged', () => {
    store().loadFlight({ from: 'earth', to: 'mars', engine: 'chemical', date: '2026-11-16', dv: 12 });
    const fast = store().plan!.arrivalDay;
    store().setShipParams({ deltaVKms: 4.6 });
    expect(store().deltaVKms).toBe(4.6);
    expect(store().plan!.arrivalDay).toBeGreaterThanOrEqual(fast);
    store().setShipParams({ deltaVKms: 3 });
    expect(store().plan!.feasible).toBe(false);
    expect(store().plan!.dvNeededKms!).toBeGreaterThan(3);
    store().setShipParams({ deltaVKms: 500 });
    expect(store().deltaVKms).toBe(16); // clamped to the engine's range
  });

  it('flying past needs less fuel than entering orbit', () => {
    store().loadFlight({ from: 'earth', to: 'mars', engine: 'chemical', date: '2026-11-16', dv: 6 });
    const orbit = store().plan!.arrivalDay;
    store().setArrivalMode('flyby');
    expect(store().plan!.arrivalMode).toBe('flyby');
    expect(store().plan!.dvArriveKms).toBe(0);
    expect(store().plan!.arrivalDay).toBeLessThanOrEqual(orbit);
  });

  it('pins a flight picked on the launch-window chart, and unpins on a route or date change', () => {
    store().loadFlight({ from: 'earth', to: 'mars', engine: 'chemical', date: '2026-11-16' });
    store().pinFlight(day('2026-12-01'), 250);
    expect(store().pinnedTofDays).toBe(250);
    expect(store().plan!.pinned).toBe(true);
    expect(store().plan!.launchDay).toBe(day('2026-12-01'));
    expect(store().profile!.totalTime / DAY).toBeCloseTo(250, 6);
    store().setDepartureDay(day('2026-12-05'));
    expect(store().pinnedTofDays).toBeNull();
    store().pinFlight(day('2026-12-01'), 250);
    store().swapEndpoints();
    expect(store().pinnedTofDays).toBeNull();
    store().pinFlight(day('2026-12-01'), 250);
    store().clearPin();
    expect(store().plan!.pinned).toBe(false);
  });

  it('reproduces the real missions', () => {
    store().loadFlight(famous('mariner-7-mars'));
    expect(isoFromDay(store().plan!.launchDay)).toBe('1969-03-27');
    expect(isoFromDay(store().plan!.arrivalDay)).toBe('1969-08-05');
    expect(store().plan!.feasible).toBe(true);
    expect(store().plan!.dvNeededKms!).toBeGreaterThan(3.6);
    expect(store().plan!.dvNeededKms!).toBeLessThan(4.4);

    store().loadFlight(famous('perseverance-mars'));
    expect(isoFromDay(store().plan!.arrivalDay)).toBe('2021-02-18');
    expect(store().plan!.feasible).toBe(true);

    store().loadFlight(famous('new-horizons-pluto'));
    expect(isoFromDay(store().plan!.arrivalDay)).toBe('2015-07-14');
    expect(store().plan!.feasible).toBe(true);

    store().loadFlight(famous('apollo-moon'));
    expect(store().plan!.model).toBe('lunar');
    expect(store().profile!.totalTime / DAY).toBeCloseTo(3.16, 2);
    expect(store().plan!.feasible).toBe(true);
  });

  it('fast engines fly straight at where the destination will be, in days', () => {
    store().loadFlight({ from: 'earth', to: 'mars', engine: 'fusion', a: 1, v: 0.2, date: '2026-11-16' });
    const s = store();
    expect(s.plan!.model).toBe('direct');
    expect(s.profile!.trajectory!.kind).toBe('direct');
    expect(s.profile!.totalTime / DAY).toBeGreaterThan(1);
    expect(s.profile!.totalTime / DAY).toBeLessThan(6);
    expect(s.sublightResult).not.toBeNull();
    store().setEngine('warp');
    expect(store().plan!.model).toBe('direct');
    expect(store().warpResult).not.toBeNull();
    expect(store().deltaVKms).toBe(0);
  });

  it('the ion drive is a realistic low-thrust engine: years to Mars', () => {
    const ion = getSublightEngine('ion');
    expect(ion.defaultG).toBeLessThan(0.0001);
    store().loadFlight({ from: 'earth', to: 'mars', engine: 'ion', date: '2026-11-16' });
    const s = store();
    expect(s.plan!.model).toBe('spiral');
    expect(s.profile!.totalTime / (365.25 * DAY)).toBeGreaterThan(1.2);
    expect(s.profile!.totalTime / (365.25 * DAY)).toBeLessThan(3);
    expect(s.plan!.feasible).toBe(true);
    const before = s.profile!.totalTime;
    store().setShipParams({ accelerationG: 0.00002 });
    expect(store().profile!.totalTime).toBeCloseTo(before / 2, -3);
  });

  it('flights to and from the Sun use the straight-line model', () => {
    store().loadFlight({ from: 'earth', to: 'sol', engine: 'chemical', date: '2026-11-16' });
    expect(store().plan!.model).toBe('direct');
    expect(store().profile).not.toBeNull();
  });

  it('the star map is unaffected', () => {
    store().loadFlight({ from: 'sol', to: 'sirius', engine: 'antimatter', a: 1, v: 0.999 });
    expect(store().plan).toBeNull();
    expect(store().profile!.trajectory).toBeUndefined();
  });
});

describe('shareable links carry the date and fuel settings', () => {
  it('round-trips a pinned fly-past', () => {
    store().loadFlight(famous('mariner-7-mars'));
    const spec = specFromState(store())!;
    expect(spec.date).toBe('1969-03-27');
    expect(spec.tof).toBe(131);
    expect(spec.arr).toBe('flyby');
    expect(spec.dv).toBe(6);
    const query = buildFlightQuery(spec);
    expect(query).toContain('date=1969-03-27');
    expect(query).toContain('arr=flyby');
    const back = parseFlightSpec(query)!;
    expect(back.date).toBe('1969-03-27');
    expect(back.tof).toBe(131);
    expect(back.arr).toBe('flyby');
    expect(back.dv).toBe(6);
  });

  it('ignores a malformed date', () => {
    expect(parseFlightSpec('?from=earth&to=mars&date=tomorrow')!.date).toBeUndefined();
  });

  it('star-map links have no date', () => {
    store().loadFlight({ from: 'sol', to: 'sirius', engine: 'warp', w: 10 });
    expect(specFromState(store())!.date).toBeUndefined();
  });
});

describe('fuel-budget slider mapping', () => {
  it('round-trips and stays inside the range', () => {
    const chemical = getSublightEngine('chemical');
    for (const p of [0, 0.25, 0.5, 1]) expect(dvToSlider(chemical, sliderToDv(chemical, p))).toBeCloseTo(p, 9);
    expect(sliderToDv(chemical, 0)).toBe(3);
    expect(sliderToDv(chemical, 1)).toBeCloseTo(16, 9);
    expect(dvToSlider(getSublightEngine('fusion'), 5)).toBe(0);
  });
});
