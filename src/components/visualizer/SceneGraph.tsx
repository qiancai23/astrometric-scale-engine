import React, { useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Sphere, Line, Html, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useFlightStore, AstroObject } from '../../state/useFlightStore';
import systemicData from '../../../scripts/systemic.json';
import starsData from '../../../scripts/stars.json';

const PointCloud: React.FC<{ catalog: AstroObject[], scaleFactor: number, onNodeSelect: (pos: THREE.Vector3) => void }> = ({ catalog, scaleFactor, onNodeSelect }) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(catalog.length * 3);
    catalog.forEach((obj, i) => {
      pos[i * 3] = obj.coords[0] * scaleFactor;
      pos[i * 3 + 1] = obj.coords[1] * scaleFactor;
      pos[i * 3 + 2] = obj.coords[2] * scaleFactor;
    });
    return pos;
  }, [catalog, scaleFactor]);

  const handleDoubleClick = (e: any) => {
    e.stopPropagation();
    if (e.index !== undefined) {
      setSelectedIdx(e.index);
      const obj = catalog[e.index];
      const worldPos = new THREE.Vector3(obj.coords[0] * scaleFactor, obj.coords[1] * scaleFactor, obj.coords[2] * scaleFactor);
      onNodeSelect(worldPos);
    }
  };

  const handlePointerMissed = () => {
    setSelectedIdx(null);
  };

  return (
    <group>
      <points onDoubleClick={handleDoubleClick} onPointerMissed={handlePointerMissed}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={catalog.length}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial color="#4488ff" size={2} sizeAttenuation={false} transparent opacity={0.6} />
      </points>
      {selectedIdx !== null && catalog[selectedIdx] && (
        <Html
          position={[
            catalog[selectedIdx].coords[0] * scaleFactor,
            catalog[selectedIdx].coords[1] * scaleFactor,
            catalog[selectedIdx].coords[2] * scaleFactor
          ]}
          center
        >
          <div style={{ color: '#fff', fontSize: '10px', background: 'rgba(0,0,0,0.8)', padding: '2px 4px', border: '1px solid #4488ff', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            {catalog[selectedIdx].name}
          </div>
        </Html>
      )}
    </group>
  );
};

const TrajectoryVectors: React.FC<{ scaleFactor: number }> = ({ scaleFactor }) => {
  const { origin, destination, driveCore, sublightResult, regime } = useFlightStore();

  if (!origin || !destination) return null;

  const oPos = new THREE.Vector3(
    origin.coords[0] * scaleFactor,
    origin.coords[1] * scaleFactor,
    origin.coords[2] * scaleFactor
  );
  
  const dPos = new THREE.Vector3(
    destination.coords[0] * scaleFactor,
    destination.coords[1] * scaleFactor,
    destination.coords[2] * scaleFactor
  );

  const points = [oPos, dPos];
  const midpoint = new THREE.Vector3().lerpVectors(oPos, dPos, 0.5);

  let decelHorizon: THREE.Vector3 | null = null;
  if (driveCore === 'Sublight' && sublightResult && sublightResult.coastingPhaseSeconds > 0) {
    const accelFraction = sublightResult.accelerationDistanceMeters / useFlightStore.getState().distanceMeters;
    decelHorizon = new THREE.Vector3().lerpVectors(oPos, dPos, 1 - accelFraction);
  }

  const distance = oPos.distanceTo(dPos);
  
  // Scale the markers depending on if we are systemic (AU) or interstellar (PC)
  const indicatorRadius = regime === 'Systemic' 
    ? Math.min(0.05, Math.max(0.005, distance * 0.02))
    : Math.min(0.001, Math.max(0.0001, distance * 0.01));

  return (
    <group>
      {/* Origin Marker & Label */}
      <group position={oPos}>
        <Sphere args={[indicatorRadius * 1.2, 16, 16]}>
          <meshBasicMaterial color="#00ffcc" />
        </Sphere>
        <Html position={[0, 0, 0]} center>
          <div style={{ transform: 'translateY(-24px)', color: '#00ffcc', fontSize: '12px', background: 'rgba(0,0,0,0.8)', padding: '2px 4px', border: '1px solid #00ffcc', whiteSpace: 'nowrap' }}>
            {origin.name}
          </div>
        </Html>
      </group>

      {/* Destination Marker & Label */}
      <group position={dPos}>
        <Sphere args={[indicatorRadius * 1.2, 16, 16]}>
          <meshBasicMaterial color="#e841f4" />
        </Sphere>
        <Html position={[0, 0, 0]} center>
          <div style={{ transform: 'translateY(-24px)', color: '#e841f4', fontSize: '12px', background: 'rgba(0,0,0,0.8)', padding: '2px 4px', border: '1px solid #e841f4', whiteSpace: 'nowrap' }}>
            {destination.name}
          </div>
        </Html>
      </group>

      <Line
        points={points}
        color={driveCore === 'Warp' ? "#ff00ff" : "#00ffcc"}
        lineWidth={2}
        dashed={driveCore === 'Warp'}
        dashSize={0.5}
        gapSize={0.2}
      />

      {driveCore === 'Sublight' && !decelHorizon && (
        <Sphere position={midpoint} args={[indicatorRadius, 8, 8]}>
          <meshBasicMaterial color="#ff0000" />
          <Html position={[0, 0, 0]} center>
            <div style={{ transform: 'translateY(16px)', color: '#ff0000', fontSize: '10px', whiteSpace: 'nowrap' }}>Flip Midpoint</div>
          </Html>
        </Sphere>
      )}

      {driveCore === 'Sublight' && decelHorizon && (
        <Sphere position={decelHorizon} args={[indicatorRadius, 8, 8]}>
          <meshBasicMaterial color="#ff0000" />
          <Html position={[0, 0, 0]} center>
            <div style={{ transform: 'translateY(16px)', color: '#ff0000', fontSize: '10px', whiteSpace: 'nowrap' }}>Decel Horizon</div>
          </Html>
        </Sphere>
      )}
    </group>
  );
};

const CameraController: React.FC<{ scaleFactor: number, focusedNode: THREE.Vector3 | null, resetTrigger: number }> = ({ scaleFactor, focusedNode, resetTrigger }) => {
  const { camera, controls } = useThree();
  const { origin, destination } = useFlightStore();

  useEffect(() => {
    if (controls) {
      const orbitControls = controls as any;
      if (focusedNode) {
        // Smoothly panning to focused node is harder, so we just snap target.
        // But for reset, we need to move the camera back.
        orbitControls.target.copy(focusedNode);
        orbitControls.update();
      } else if (origin && destination) {
        const oPos = new THREE.Vector3(origin.coords[0] * scaleFactor, origin.coords[1] * scaleFactor, origin.coords[2] * scaleFactor);
        const dPos = new THREE.Vector3(destination.coords[0] * scaleFactor, destination.coords[1] * scaleFactor, destination.coords[2] * scaleFactor);
        const distance = oPos.distanceTo(dPos);
        
        // Pivot around the Origin instead of the midpoint so rotation feels anchored
        orbitControls.target.copy(oPos);
        
        // Reset camera position relative to the Origin, pulled back to see the destination
        camera.position.copy(oPos);
        camera.position.z += distance === 0 ? 5 : distance * 1.5;
        camera.position.y += distance === 0 ? 5 : distance * 0.8;
        
        orbitControls.zoomSpeed = Math.max(0.1, distance * 0.1);
        orbitControls.update();
      }
    }
  }, [origin, destination, focusedNode, scaleFactor, controls, resetTrigger]);

  return null;
};

const MajorBodies: React.FC<{ catalog: AstroObject[], scaleFactor: number, onNodeSelect: (pos: THREE.Vector3) => void }> = ({ catalog, scaleFactor, onNodeSelect }) => {
  return (
    <group>
      {catalog.map((obj) => {
        const pos = new THREE.Vector3(
          obj.coords[0] * scaleFactor,
          obj.coords[1] * scaleFactor,
          obj.coords[2] * scaleFactor
        );

        let color = '';
        let size = Math.min(0.15, Math.max(0.015, 0.035 * scaleFactor));
        let ringData: { inner: number, outer: number, color: string, rotation: [number, number, number], opacity: number } | null = null;

        switch (obj.name) {
          case 'Sol': color = '#ffcc00'; size *= 3.0; break;
          case 'Mercury': color = '#a9a9a9'; size *= 0.4; break;
          case 'Venus': color = '#c18f59'; size *= 0.8; break;
          case 'Earth': color = '#3b5ba5'; size *= 0.9; break;
          case 'Mars': color = '#c1440e'; size *= 0.6; break;
          case 'Jupiter': color = '#c99b75'; size *= 2.0; break;
          case 'Saturn': 
            color = '#e2bf7d'; 
            size *= 1.7; 
            ringData = { inner: size * 1.2, outer: size * 2.2, color: '#c5ab6e', rotation: [Math.PI / 2.5, 0, 0], opacity: 0.6 };
            break;
          case 'Uranus': 
            color = '#82b3d1'; 
            size *= 1.2; 
            // Uranus has a very thin ring tilted almost 90 degrees
            ringData = { inner: size * 1.4, outer: size * 1.45, color: '#ffffff', rotation: [0, Math.PI / 2.2, 0], opacity: 0.3 };
            break;
          case 'Neptune': color = '#2d68c4'; size *= 1.2; break;
          case 'Moon': color = '#bbbbbb'; size *= 0.25; break;
          default: return null;
        }

        if (scaleFactor < 1 && obj.name !== 'Sol') return null;

        return (
          <group 
            key={obj.id} 
            position={pos}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onNodeSelect(pos);
            }}
          >
            <Sphere args={[size, 24, 24]}>
              <meshBasicMaterial color={color} />
            </Sphere>
            {ringData && (
              <mesh rotation={ringData.rotation}>
                <ringGeometry args={[ringData.inner, ringData.outer, 64]} />
                <meshBasicMaterial color={ringData.color} side={THREE.DoubleSide} transparent opacity={ringData.opacity} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
};

const OrbitLines: React.FC<{ catalog: AstroObject[], scaleFactor: number }> = ({ catalog, scaleFactor }) => {
  const origin = useFlightStore(state => state.origin);
  const destination = useFlightStore(state => state.destination);

  return (
    <group>
      {catalog.map(obj => {
        if (!obj.orbit_path || obj.orbit_path.length < 2 || (scaleFactor < 1 && obj.name !== 'Sol')) return null;
        const points = obj.orbit_path.map((p: number[]) => new THREE.Vector3(p[0] * scaleFactor, p[1] * scaleFactor, p[2] * scaleFactor));
        
        const isSelected = origin?.id === obj.id || destination?.id === obj.id;
        const opacity = isSelected ? 0.8 : 0.35;
        const lineWidth = isSelected ? 1.5 : 0.5;
        
        return <Line key={`orbit-${obj.id}`} points={points} color="#ffffff" opacity={opacity} transparent lineWidth={lineWidth} />;
      })}
    </group>
  );
};

const Skydome: React.FC<{ regime: string }> = ({ regime }) => {
  const texture = useTexture('/assets/textures/milky_way.jpg');
  const { scene } = useThree();

  useEffect(() => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    
    // Astrometric Alignment: Rotate the background so the visual Milky Way matches coordinate data
    scene.backgroundRotation.set(0, Math.PI / 2, 0); 
    
    return () => {
      scene.background = null;
    };
  }, [texture, scene]);

  useEffect(() => {
    // Dim the background exposure in Systemic to make planets pop
    scene.backgroundIntensity = regime === 'Systemic' ? 0.3 : 1.0;
  }, [regime, scene]);

  return null;
};

export const SceneGraph: React.FC = () => {
  const regime = useFlightStore(state => state.regime);
  const [focusedNode, setFocusedNode] = useState<THREE.Vector3 | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  
  const handleReset = () => {
    setFocusedNode(null);
    setResetTrigger(prev => prev + 1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const catalog = useMemo(() => {
    return regime === 'Systemic' 
      ? systemicData as AstroObject[] 
      : starsData as AstroObject[];
  }, [regime]);

  const scaleFactor = regime === 'Systemic' ? 1 : 0.05;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas 
        camera={{ position: [0, 5, 10], fov: 45, near: 0.0001, far: 100000 }}
        onPointerMissed={handleReset}
      >
        <color attach="background" args={['#05050a']} />
        <Suspense fallback={null}>
          <Skydome regime={regime} />
        </Suspense>
        <ambientLight intensity={0.5} />
        
        <PointCloud catalog={catalog} scaleFactor={scaleFactor} onNodeSelect={setFocusedNode} />
        {regime === 'Systemic' && <MajorBodies catalog={catalog} scaleFactor={scaleFactor} onNodeSelect={setFocusedNode} />}
        <OrbitLines catalog={catalog} scaleFactor={scaleFactor} />
        <TrajectoryVectors scaleFactor={scaleFactor} />
        <CameraController scaleFactor={scaleFactor} focusedNode={focusedNode} resetTrigger={resetTrigger} />
        
        <OrbitControls 
          makeDefault
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
        />
        
        {/* Simple Grid/Axes for reference */}
        <gridHelper args={[100, 100, '#222222', '#111111']} />
        <axesHelper args={[10]} />
      </Canvas>
      
      <div style={{ position: 'absolute', top: '10px', left: '10px', pointerEvents: 'none', color: 'var(--color-text)', fontSize: '14px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', padding: '4px 8px', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
        3D Astrometric Map ({regime} Regime)
      </div>
    </div>
  );
};
