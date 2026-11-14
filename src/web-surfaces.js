import * as THREE from 'three';

const LEATHER_CACHE_KEY = 'rsr-pebbled-leather-v1';

function tuneOpticalSurface(material) {
  const name = material.name || '';
  const surface = material.userData?.web_surface;
  const cabinGlass = /neutral clear laminated glass|light smoke rear glass/i.test(name);
  const instrumentGlass = /instrument anti-glare lens/i.test(name);
  if (cabinGlass || instrumentGlass) {
    // Transmission supplies the view through the pane. Combining it with alpha
    // blending mixes in the reflected surface again and makes the cabin foggy.
    const smoke = /light smoke rear glass/i.test(name);
    material.color.setRGB(...(smoke ? [.965,.965,.965] : [.99,.99,.99]));
    material.transmission = 1;
    material.opacity = 1;
    material.transparent = false;
    material.metalness = 0;
    material.roughness = smoke ? .024 : .018;
    material.ior = 1.46;
    material.thickness = instrumentGlass ? .0002 : .0005;
    material.attenuationColor?.setRGB(1,1,1);
    material.attenuationDistance = Infinity;
    material.clearcoat = 0;
    material.depthWrite = true;
    material.polygonOffset = false;
  } else if (surface === 'glass' || /LD_\d+_Trans_/i.test(name)) {
    // Keep the source colour and every image slot, especially the red lenses.
    material.transmission = Math.max(.96,material.transmission || 0);
    material.opacity = 1;
    material.transparent = false;
    material.metalness = 0;
    material.roughness = Math.min(.12,material.roughness);
    material.ior = 1.49;
    material.thickness = .0008;
    material.depthWrite = true;
    material.polygonOffset = false;
  } else if (/\bLD_015_White\b/i.test(name)) {
    // These are linear reflectances; leave room for the ABS specular highlight.
    material.color.setRGB(.75,.735,.71);
    material.metalness = 0;
    material.roughness = .27;
    material.clearcoat = .24;
    material.clearcoatRoughness = .19;
  } else return null;
  material.needsUpdate = true;
  return cabinGlass ? 'cabinGlass' : instrumentGlass ? 'instrumentGlass'
    : surface === 'glass' || /LD_\d+_Trans_/i.test(name) ? 'lenses' : 'whiteABS';
}

/** Tune portable PBR surfaces and add leather relief in local metres. */
export async function prepareWebSurfaces(parts, renderer, {
  assetBase = './assets/',
  tileMetres = .0064,
  bumpMetres = .000010,
} = {}) {
  const leatherMaterials = new Set();
  const seenMaterials = new Set();
  const optical = {cabinGlass:0,instrumentGlass:0,lenses:0,whiteABS:0};
  let meshCount = 0;
  for (const part of parts) for (const mesh of part.meshes || []) {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (list.some(m => m?.userData?.web_surface === 'leather'
      || /\bleather\b/i.test(m?.name || ''))) meshCount++;
    for (const material of list) {
      if (material && !seenMaterials.has(material)) {
        seenMaterials.add(material);
        const category = tuneOpticalSurface(material);
        if (category) optical[category]++;
      }
      if (material?.userData?.web_surface === 'leather'
        || /\bleather\b/i.test(material?.name || '')) leatherMaterials.add(material);
    }
  }
  if (!leatherMaterials.size) return { materials:0, meshes:0, textured:false, optical };
  const loader = new THREE.TextureLoader();
  const height = await loader.loadAsync(`${assetBase}leather-height.png`).catch(error => {
    throw new Error('皮革表面纹理加载失败，请刷新页面重试。', {cause:error});
  });
  height.wrapS = height.wrapT = THREE.RepeatWrapping;
  height.colorSpace = THREE.NoColorSpace;
  height.minFilter = THREE.LinearMipmapLinearFilter;
  height.magFilter = THREE.LinearFilter;
  height.anisotropy = Math.min(renderer?.capabilities?.getMaxAnisotropy?.() || 4,8);
  for (const material of leatherMaterials) {
    if (material.userData.leatherReliefApplied) continue;
    const oldCompile = material.onBeforeCompile.bind(material);
    material.roughness = Math.max(.42,Math.min(.52,material.roughness));
    if ('sheen' in material) material.sheen = .12;
    if ('sheenRoughness' in material) material.sheenRoughness = .7;
    material.onBeforeCompile = shader => {
      oldCompile(shader);
      shader.uniforms.rsrLeatherHeight = {value:height};
      shader.uniforms.rsrLeatherTile = {value:tileMetres};
      shader.uniforms.rsrLeatherBump = {value:bumpMetres};
      shader.vertexShader = shader.vertexShader.replace('#include <common>',`
        #include <common>
        varying vec3 rsrLeatherPosition;
        varying vec3 rsrLeatherNormal;
      `).replace('#include <begin_vertex>',`
        #include <begin_vertex>
        rsrLeatherPosition = position;
        rsrLeatherNormal = normal;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>',`
        #include <common>
        varying vec3 rsrLeatherPosition;
        varying vec3 rsrLeatherNormal;
        uniform sampler2D rsrLeatherHeight;
        uniform float rsrLeatherTile;
        uniform float rsrLeatherBump;
        float rsrLeatherRelief() {
          vec3 weights = pow(abs(normalize(rsrLeatherNormal)), vec3(6.0));
          weights /= max(dot(weights,vec3(1.0)),0.00001);
          vec3 p = rsrLeatherPosition / rsrLeatherTile;
          return texture2D(rsrLeatherHeight,p.yz).r*weights.x
            + texture2D(rsrLeatherHeight,p.xz).r*weights.y
            + texture2D(rsrLeatherHeight,p.xy).r*weights.z;
        }
      `).replace('#include <normal_fragment_maps>',`
        #include <normal_fragment_maps>
        float rsrRelief = rsrLeatherRelief() * rsrLeatherBump;
        vec3 rsrSurface = -vViewPosition;
        vec3 rsrSigmaX = dFdx(rsrSurface);
        vec3 rsrSigmaY = dFdy(rsrSurface);
        vec3 rsrR1 = cross(rsrSigmaY,normal);
        vec3 rsrR2 = cross(normal,rsrSigmaX);
        float rsrDet = dot(rsrSigmaX,rsrR1);
        vec3 rsrGradient = sign(rsrDet)
          * (dFdx(rsrRelief)*rsrR1 + dFdy(rsrRelief)*rsrR2);
        normal = normalize(abs(rsrDet)*normal-rsrGradient);
      `);
    };
    material.customProgramCacheKey = () => LEATHER_CACHE_KEY;
    material.userData.leatherReliefApplied = true;
    material.userData.leatherTileMetres = tileMetres;
    material.userData.leatherBumpMetres = bumpMetres;
    material.needsUpdate = true;
  }
  return {
    materials:leatherMaterials.size, meshes:meshCount, textured:true,
    heightMap:height, tileMetres,bumpMetres, optical,
  };
}
