import * as THREE from '../vendor/three.module.js';
import { skyPresetLighting } from './time-of-day.js';
import { terrainAsset } from '../load-manifest.js';
import { unpackGeometry } from '../engine/geometry.js';

export const TERRAIN_RADII = [20];
const MILE = 1609.344;

export function buildTerrainGeometry(metadata, heights, radiusMiles) {
  if (!TERRAIN_RADII.includes(radiusMiles) || !radiusMiles)
    throw new Error('Unsupported terrain radius');
  const grid = metadata.grid;
  if (grid.columns !== grid.rows || heights.length !== grid.columns * grid.rows)
    throw new Error('Incomplete elevation grid');
  const middle = (grid.columns - 1) / 2,
    half = Math.floor((radiusMiles * MILE) / grid.spacing_metres);
  const stride = Math.max(1, Math.ceil(half / 256)),
    side = (2 * half) / stride + 1;
  if (!Number.isInteger(side)) throw new Error('Misaligned elevation grid');
  const positions = [],
    indices = [],
    lookup = new Int32Array(side * side).fill(-1);
  const radius = radiusMiles * MILE,
    clear = metadata.render.local_clear_radius_metres;
  let minimum = Infinity,
    maximum = -Infinity;
  for (let row = 0; row < side; row++)
    for (let column = 0; column < side; column++) {
      const sourceRow = middle - half + row * stride,
        sourceColumn = middle - half + column * stride;
      const x = grid.west_offset_metres + sourceColumn * grid.spacing_metres;
      const y = grid.north_offset_metres - sourceRow * grid.spacing_metres;
      const distance = Math.hypot(x, y);
      if (distance < clear || distance > radius) continue;
      const elevation =
        heights[sourceRow * grid.columns + sourceColumn] - grid.origin_elevation_metres;
      if (!Number.isFinite(elevation)) throw new Error('Invalid terrain sample');
      const curvature = (distance * distance) / (2 * metadata.render.earth_radius_metres);
      lookup[row * side + column] = positions.length / 3;
      positions.push(x, y, elevation - curvature - 0.05);
      minimum = Math.min(minimum, elevation);
      maximum = Math.max(maximum, elevation);
    }
  const triangle = (a, b, c) => {
    if (a >= 0 && b >= 0 && c >= 0) indices.push(a, b, c);
  };
  for (let row = 0; row < side - 1; row++)
    for (let column = 0; column < side - 1; column++) {
      const p = row * side + column,
        a = lookup[p],
        b = lookup[p + 1],
        c = lookup[p + side],
        d = lookup[p + side + 1];
      triangle(a, c, b);
      triangle(b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    radiusMiles,
    radiusMetres: radius,
    triangles: indices.length / 3,
    vertexCount: positions.length / 3,
    sampleSpacingMetres: stride * grid.spacing_metres,
    elevationRangeMetres: [minimum, maximum],
    verticalExaggeration: 1,
    earthCurvature: true,
    localClearRadiusMetres: clear,
  };
  return geometry;
}

export function createTopography(scene, center, assets = {}) {
  const root = new THREE.Group();
  root.name = 'TOPOGRAPHY / USGS Black Rock mountains';
  root.position.set(center.x, center.y, 0);
  scene.add(root);
  // Display shading belongs to the distant terrain only. Its night appearance
  // and flat-basin cutoff remain intact; daylight reveals neutral earth tones.
  const uniforms = {
    twilight: { value: 1 },
    haze: { value: 1 },
    daylight: { value: 0 },
    sunset: { value: 1 },
    photoDusk: { value: 0 },
    mountainHaze: { value: 1 },
    ridgeDetail: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: `attribute vec2 ridgeField;varying vec2 terrainRidge;
      varying vec3 terrainPosition;varying vec3 terrainNormal;
      void main(){vec4 world=modelMatrix*vec4(position,1.);terrainPosition=world.xyz;terrainNormal=normalize(mat3(modelMatrix)*normal);terrainRidge=ridgeField;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float twilight;uniform float haze;uniform float daylight;
      uniform float sunset;uniform float photoDusk;uniform float mountainHaze;uniform float ridgeDetail;
      varying vec2 terrainRidge;
      varying vec3 terrainPosition;varying vec3 terrainNormal;
      vec3 linearColor(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
      // Integrate exponential air density along the camera-to-terrain segment.
      // Symmetric endpoints avoid overflow when looking down from a high camera;
      // the series supplies the continuous horizontal-ray limit.
      float airColumn(vec3 eye,vec3 point){
        float rayLength=length(point-eye);
        float start=min(1500.,rayLength);
        float low=max(0.,mix(eye.z,point.z,start/max(rayLength,1.)));
        float high=max(0.,point.z);
        float delta=abs(high-low)/300.;
        float average=delta<.01?1.-delta*.5+delta*delta/6.:(1.-exp(-delta))/max(delta,.00001);
        return max(0.,rayLength-start)*exp(-min(low,high)/300.)*average;
      }
      vec3 mountainAtmosphere(float relief,float slope){
        vec3 ray=terrainPosition-cameraPosition;
        float rayLength=length(ray);
        vec2 direction=ray.xy/max(length(ray.xy),.001);
        // Same world-space glow direction and angular falloff as the sky.
        float glow=pow(max(0.,dot(direction,normalize(vec2(-.7,.7))))*.5+.5,3.);
        vec3 sunriseHaze=mix(vec3(.19,.23,.28),vec3(.235,.245,.27),glow);
        vec3 sunsetHaze=mix(vec3(.21,.155,.16),vec3(.30,.19,.135),glow);
        vec3 tint=mix(vec3(.060,.077,.112),mix(sunriseHaze,sunsetHaze,sunset),twilight);
        vec3 nearTint=mix(vec3(.006,.010,.017),mix(vec3(.027,.035,.049),vec3(.041,.026,.034),sunset),twilight);
        vec3 detail=mix(vec3(.001,.002,.003),mix(vec3(.010,.012,.016),vec3(.016,.010,.008),sunset),twilight)*pow(slope,1.5);
        float duskGlow=pow(.5+.5*dot(direction,normalize(vec2(-.13,.99))),3.);
        tint=mix(tint,mix(vec3(.37,.39,.47),vec3(.49,.43,.43),duskGlow),photoDusk);
        nearTint=mix(nearTint,vec3(.075,.13,.205),photoDusk);
        detail=mix(detail,vec3(.009,.012,.020)*pow(slope,1.5),photoDusk);
        float strength=.60+.40*clamp(haze,.1,2.);
        float column=airColumn(cameraPosition,terrainPosition);
        float opticalDepth=(max(0.,rayLength-1500.)*.000012+column*.000042)*strength;
        float veil=min(.66,1.-exp(-opticalDepth));
        // A terrain-derived crest mask clears haze from the top of each range.
        // The brighter low slopes behind it retain the exact, unblurred outline.
        float grazing=1.-abs(dot(normalize(terrainNormal),normalize(-ray)));
        float crest=terrainRidge.x*(.55+.45*grazing*grazing);
        float variation=terrainRidge.y;
        float refinedDepth=(max(0.,rayLength-1500.)*.000026+column*.000051*(1.+.12*variation))*strength;
        float belt=exp(-pow((terrainPosition.z-110.-22.*variation)/200.,2.))*(1.-exp(-rayLength/13000.));
        float refinedVeil=.91*(1.-exp(-refinedDepth))*(1.-.34*crest);
        refinedVeil+=.10*belt*(1.-.7*terrainRidge.x);
        veil=mix(veil,refinedVeil,ridgeDetail);
        vec3 surface=linearColor(nearTint+detail)*(1.-.16*crest*ridgeDetail);
        vec3 mountain=mix(surface,linearColor(tint),veil)*relief;
        // Only the new photograph-inspired scene has a visible dusk basin.
        return mountain+photoDusk*linearColor(vec3(.135,.18,.235))*(1.-relief);
      }
      void main(){
        float height=terrainPosition.z;
        // The analytic playa owns the flat floor. A low DEM basin must not
        // paint over it, especially when the dolly near plane slices the basin.
        // Retain terrain above the eye's horizon so distant ridges stay joined
        // to their base; discarding all low terrain would open a strip of sky.
        // Keep pixels whose footprint straddles the eye-height horizon.
        // Mesh interpolation and the analytic sky ray can disagree at the
        // center of that pixel, leaving a one-pixel strip of bright sky.
        float horizonFootprint=max(.00001,.5*fwidth(terrainPosition.z));
        if(height<12. && height<cameraPosition.z-horizonFootprint)discard;
        float relief=smoothstep(12.,90.,height);
        float distance=length(terrainPosition.xy-cameraPosition.xy);
        float depth=1.-exp(-distance*(.7+.3*haze)/14000.);
        float valley=(1.-smoothstep(75.,450.,height))*depth;
        float facing=max(0.,dot(normalize(terrainNormal),normalize(vec3(-.7,.7,.18))));
        vec3 near=mix(vec3(.009,.013,.022),vec3(.045,.033,.055),twilight);
        vec3 far=mix(vec3(.034,.049,.078),vec3(.14,.115,.17),twilight);
        vec3 color=mix(near,far,depth*.72);
        color+=mix(vec3(.006,.010,.018),vec3(.025,.022,.038),twilight)*valley*(.55+.2*haze);
        color+=mix(vec3(.001,.002,.004),vec3(.022,.018,.030),twilight)*pow(facing,1.5);
        vec3 nightRadiance=linearColor(color)*relief;
        vec3 dayNear=mix(vec3(.37,.35,.32),vec3(.56,.54,.49),pow(facing,.7));
        vec3 dayFar=vec3(.61,.68,.73);
        vec3 dayColor=mix(dayNear,dayFar,depth*.85);
        dayColor+=vec3(.025,.028,.032)*valley;
        vec3 original=mix(nightRadiance,linearColor(dayColor),daylight);
        vec3 atmosphere=mountainAtmosphere(relief,facing);
        // Keep the exact original treatment available for this local A/B demo.
        gl_FragColor=vec4(mix(original,atmosphere,mountainHaze),1.);
        #include <colorspace_fragment>
      }`,
  });
  let metadata,
    preparedGeometry,
    loading = false,
    error = null,
    current = null;
  async function load() {
    loading = true;
    try {
      let compressed;
      if (assets.loadJSON) {
        [metadata, compressed] = await Promise.all([
          assets.loadJSON('assets/burning-man/topography.json'),
          assets.loadBytes(terrainAsset.path),
        ]);
      } else {
        const [info, data] = await Promise.all([
          fetch('assets/burning-man/topography.json'),
          fetch(terrainAsset.path),
        ]);
        if (!info.ok || !data.ok) throw new Error('Terrain files unavailable');
        metadata = await info.json();
        compressed = await data.arrayBuffer();
      }
      const bytes = await unpackGeometry(compressed, terrainAsset);
      preparedGeometry = new THREE.BufferGeometry();
      for (const [name, spec] of Object.entries(terrainAsset.attributes))
        preparedGeometry.setAttribute(
          name,
          new THREE.BufferAttribute(
            new Float32Array(bytes, spec.offset, spec.count),
            spec.itemSize,
          ),
        );
      const spec = terrainAsset.index;
      preparedGeometry.setIndex(
        new THREE.BufferAttribute(new Uint32Array(bytes, spec.offset, spec.count), 1),
      );
      preparedGeometry.addGroup(0, spec.count, 0);
      preparedGeometry.computeBoundingBox();
      preparedGeometry.computeBoundingSphere();
      preparedGeometry.userData = { ...terrainAsset.userData };
    } catch (reason) {
      error = reason.message;
      throw reason;
    } finally {
      loading = false;
    }
  }
  function update(state) {
    uniforms.twilight.value = ['night', 'stars'].includes(state?.atmosphere)
      ? 0
      : Math.pow(Math.max(0, Math.min(1, state?.sky ?? 1)), 1.5);
    uniforms.haze.value = state?.haze ?? 1;
    uniforms.daylight.value = skyPresetLighting(state?.atmosphere).daylight;
    uniforms.sunset.value = state?.atmosphere === 'sunset' ? 1 : 0;
    uniforms.photoDusk.value = skyPresetLighting(state?.atmosphere).photoDusk;
    uniforms.mountainHaze.value = Number.isFinite(state?.mountainHaze)
      ? Math.max(0, Math.min(1, state.mountainHaze))
      : 1;
    uniforms.ridgeDetail.value = Number.isFinite(state?.ridgeDetail)
      ? Math.max(0, Math.min(1, state.ridgeDetail))
      : 1;
    if (!metadata && !loading && !error)
      void load().catch((reason) => console.warn('Mountain terrain:', reason));
    if (!preparedGeometry || current) return;
    current = new THREE.Mesh(preparedGeometry, material);
    current.name = 'TOPOGRAPHY / 20 mile radius';
    root.add(current);
  }
  function stats() {
    return {
      enabled: true,
      radiusMiles: 20,
      status: error
        ? 'unavailable'
        : loading
          ? 'loading'
          : preparedGeometry
            ? 'ready'
            : 'not-loaded',
      error,
      source: 'USGS 3DEP',
      origin: metadata?.origin ?? null,
      addedLights: 0,
      daylight: uniforms.daylight.value,
      appearance: uniforms.photoDusk.value
        ? 'Peach dusk has blue-gray ranges, low dust and a faint dusk basin.'
        : 'Analytic distance and height haze follows each sky preset; the flat basin remains black.',
      atmosphereMethod: 'analytic-height-fog',
      heightScaleMetres: 300,
      startDistanceMetres: 1500,
      mountainHaze: uniforms.mountainHaze.value,
      ridgeDetail: uniforms.ridgeDetail.value,
      ridgeField: 'local-elevation-relief',
      hazeDetail: 'stationary-low-dust-bands',
      hazePalette: uniforms.photoDusk.value
        ? 'peach-dusk-slate'
        : uniforms.twilight.value === 0
          ? 'night-blue'
          : uniforms.sunset.value === 1
            ? 'sunset-rose-amber'
            : 'sunrise-steel-blue',
      layeredHills: true,
      terrainOnlyAtmosphere: true,
      flatBasinCutoffMetres: 12,
      flatBasinCutoffAppliesAtNight: true,
      ...(current?.geometry.userData || {}),
    };
  }
  return { load, update, stats };
}

// One-time terrain analysis: no elevation, topology or normal is changed.
// Each vertex stores local crest prominence plus broad, world-fixed dust detail.
export function addRidgeField(geometry, metadata, heights) {
  const started = performance.now(),
    grid = metadata.grid,
    positions = geometry.getAttribute('position');
  const values = new Float32Array(positions.count * 2);
  const sample = (row, col) =>
    heights[
      Math.max(0, Math.min(grid.rows - 1, row)) * grid.columns +
        Math.max(0, Math.min(grid.columns - 1, col))
    ];
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i);
    const col = Math.round((x - grid.west_offset_metres) / grid.spacing_metres),
      row = Math.round((grid.north_offset_metres - y) / grid.spacing_metres);
    const elevation = sample(row, col);
    let low = elevation,
      high = elevation;
    for (const radius of [6, 18])
      for (const [dx, dy] of directions) {
        const h = sample(row + dy * radius, col + dx * radius);
        low = Math.min(low, h);
        high = Math.max(high, h);
      }
    values[i * 2] =
      smooth(0.25, 0.9, (elevation - low) / Math.max(25, high - low)) * smooth(15, 90, high - low);
    values[i * 2 + 1] =
      0.55 * Math.sin(x * 0.0006 + y * 0.0002) +
      0.3 * Math.sin(y * 0.0013 - x * 0.0003) +
      0.15 * Math.sin((x + y) * 0.0025);
  }
  geometry.setAttribute('ridgeField', new THREE.Float32BufferAttribute(values, 2));
  geometry.userData.ridgePreparationMs = performance.now() - started;
  return geometry;
}
