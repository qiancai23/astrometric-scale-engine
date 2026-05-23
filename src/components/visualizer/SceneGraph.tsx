import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sphere, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useFlightStore, AstroObject } from '../../state/useFlightStore';
import systemicData from '../../../scripts/systemic.json';
import starsData from '../../../scripts/stars.json';

const PointCloud: React.FC<{ catalog: AstroObject[], scaleFactor: number }> = ({ catalog, scaleFactor }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (meshRef.current) {
      catalog.forEach((obj, i) => {
        dummy.position.set(
          obj.coords[0] * scaleFactor,
          obj.coords[1] * scaleFactor,
          obj.coords[2] * scaleFactor
        );
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [catalog, scaleFactor, dummy]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, catalog.length]}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshBasicMaterial color="#4488ff" transparent opacity={0.6} />
    </instancedMesh>
  );
};

const TrajectoryVectors: React.FC<{ scaleFactor: number }> = ({ scaleFactor }) => {
  const { origin, destination, driveCore, sublightResult } = useFlightStore();

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
  // Midpoint indicator
  const midpoint = new THREE.Vector3().lerpVectors(oPos, dPos, 0.5);

  let decelHorizon: THREE.Vector3 | null = null;
  if (driveCore === 'Sublight' && sublightResult && sublightResult.coastingPhaseSeconds > 0) {
    // If coasting, there are two points: end of accel, and start of decel
    // For simplicity, we can just show the flip horizon.
    const accelFraction = sublightResult.accelerationDistanceMeters / useFlightStore.getState().distanceMeters;
    decelHorizon = new THREE.Vector3().lerpVectors(oPos, dPos, 1 - accelFraction);
  }

  return (
    <group>
      {/* Origin */}
      <Sphere position={oPos} args={[0.2, 16, 16]}>
        <meshBasicMaterial color="#00ffcc" />
        <Html distanceFactor={10} position={[0, 0.3, 0]} center>
          <div style={{ color: '#00ffcc', fontSize: '12px', background: 'rgba(0,0,0,0.8)', padding: '2px 4px', border: '1px solid #00ffcc' }}>
            {origin.name}
          </div>
        </Html>
      </Sphere>

      {/* Destination */}
      <Sphere position={dPos} args={[0.2, 16, 16]}>
        <meshBasicMaterial color="#e841f4" />
        <Html distanceFactor={10} position={[0, 0.3, 0]} center>
          <div style={{ color: '#e841f4', fontSize: '12px', background: 'rgba(0,0,0,0.8)', padding: '2px 4px', border: '1px solid #e841f4' }}>
            {destination.name}
          </div>
        </Html>
      </Sphere>

      {/* Travel Vector */}
      <Line
        points={points}
        color={driveCore === 'Warp' ? "#ff00ff" : "#00ffcc"}
        lineWidth={2}
        dashed={driveCore === 'Warp'}
        dashSize={0.5}
        gapSize={0.2}
      />

      {/* Midpoint Flip Indicator (for sublight without coasting, it's just the midpoint) */}
      {driveCore === 'Sublight' && !decelHorizon && (
        <Sphere position={midpoint} args={[0.1, 8, 8]}>
          <meshBasicMaterial color="#ff0000" />
          <Html distanceFactor={10} position={[0, -0.3, 0]} center>
            <div style={{ color: '#ff0000', fontSize: '10px' }}>Flip Midpoint</div>
          </Html>
        </Sphere>
      )}

      {/* Decel Horizon Indicator (for sublight with coasting) */}
      {driveCore === 'Sublight' && decelHorizon && (
        <Sphere position={decelHorizon} args={[0.1, 8, 8]}>
          <meshBasicMaterial color="#ff0000" />
          <Html distanceFactor={10} position={[0, -0.3, 0]} center>
            <div style={{ color: '#ff0000', fontSize: '10px' }}>Decel Horizon</div>
          </Html>
        </Sphere>
      )}
    </group>
  );
};

export const SceneGraph: React.FC = () => {
  const regime = useFlightStore(state => state.regime);
  
  const catalog = useMemo(() => {
    return regime === 'Systemic' 
      ? systemicData as AstroObject[] 
      : starsData as AstroObject[];
  }, [regime]);

  // Scale interstellar (parsecs) differently from systemic (AU) to fit standard camera range
  const scaleFactor = regime === 'Systemic' ? 1 : 0.05;

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [0, 20, 40], fov: 60, far: 100000 }}>
        <color attach="background" args={['#05050a']} />
        <ambientLight intensity={0.5} />
        
        <PointCloud catalog={catalog} scaleFactor={scaleFactor} />
        <TrajectoryVectors scaleFactor={scaleFactor} />
        
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
        />
        
        {/* Simple Grid/Axes for reference */}
        <gridHelper args={[100, 100, '#222222', '#111111']} />
        <axesHelper args={[10]} />
      </Canvas>
    </div>
  );
};
