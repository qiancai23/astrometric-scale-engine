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
