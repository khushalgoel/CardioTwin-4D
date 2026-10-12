/**
 * CARDIOTWIN-4D: INTERACTIVE 3D HEART VISUALIZATION
 * 
 * Medical-Grade Features:
 * - Multilayer Translucent Coronary Arteries (Endothelium + Flowing Arterial Blood Core)
 * - Translucent Living Epicardium/Myocardium with Subsurface Light Scattering & Clearcoat Wet Sheen
 * - Internal Ventricular Cavity Blood Pool & Intracardiac 4D Flow Vortex Streamlines
 * - Procedural Muscle Fiber Striations & Microvascular Capillary Bed Bump Maps
 * - Anatomical Epicardial Adipose Tissue (Fat Pads) in Coronary Sulci
 * - 450 Glowing Poiseuille-Bernoulli Erythrocyte Micro-Particles with Stenotic Jet Acceleration
 * - Dynamic Two-Phase Cardiac Cycle (Systole & Diastole) Synced to Patient PR, EF-TTE & RWMA
 * - Trans-Illumination Subsurface Backlighting & Internal Ventricular Systolic Glow
 * - Expandable Platinum Wireframe Stents & AHA 17-Segment Ischemic Cyanosis Patches
 */

class CardioTwinHeart3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container #${containerId} not found`);
      return;
    }

    // Clinical telemetry state
    this.bpm = 75;
    this.ef = 55; // Ejection Fraction %
    this.rwma = 0; // Regional Wall Motion Abnormality score 0-4
    this.vesselRisks = { LAD: 0.15, LCX: 0.12, RCA: 0.10 };
    this.vesselVffr = { LAD: 0.94, LCX: 0.96, RCA: 0.97 };
    this.vesselLumen = { LAD: 0.92, LCX: 0.95, RCA: 0.96 };
    this.stented = { LAD: false, LCX: false, RCA: false };
    
    this.activeVessel = "LAD";
    this.isXRayMode = false;
    this.showParticles = true;
    this.showIschemia = true;
    this.autoOrbit = false;

    // Three.js primitives
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Scene groups
    this.heartGroup = new THREE.Group();
    this.chambers = {};
    this.vessels = {};
    this.innerBloodColumns = {};
    this.plaques = {};
    this.stents = {};
    this.perfusionPatches = {};
    this.particleSystems = {};
    this.floatingPins = {};
    this.fatPads = [];
    this.externalMesh = null;

    // Animation clocks & lights
    this.clock = new THREE.Clock();
    this.cardiacPhase = 0;
    this.cavityLight = null;

    this.init();
  }

  init() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // 1. Scene & Camera setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02050c);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    this.camera.position.set(0, 1.1, 7.0);

    // 2. WebGL renderer with ACES tone mapping
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      precision: "highp"
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 3. Orbit Controls
    if (typeof THREE.OrbitControls !== "undefined") {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.minDistance = 3.2;
      this.controls.maxDistance = 14.0;
      this.controls.maxPolarAngle = Math.PI * 0.88;
      this.controls.target.set(0, -0.2, 0);
    }

    // 4. Procedural textures and scene lighting
    this.generateProceduralTextures();
    this.setupCinematicLighting();

    // 5. Construct Anatomical Geometry & Multi-Layer Vascular Tree
    this.buildHeartChambers();
    this.buildIntracardiacBloodPool();
    this.buildEpicardialFatPads();
    this.buildCoronaryArteryTree();
    this.buildPerfusionTerritories();
    this.buildPoiseuilleParticles();
    this.buildIntracardiacVortexStreamlines();
    this.buildFloatingPins();

    // Natural Left Anterior Oblique (LAO) Anatomical Tilt
    this.heartGroup.rotation.y = 0.28;
    this.heartGroup.rotation.z = -0.14;
    this.heartGroup.rotation.x = 0.12;
    this.scene.add(this.heartGroup);

    // 6. Event listeners
    window.addEventListener("resize", () => this.onResize());
    this.renderer.domElement.addEventListener("click", (e) => this.onCanvasClick(e));

    // 7. Start the render loop
    this.animate();
  }

  /* ==============================================================================
     PROCEDURAL MUSCLE FIBER AND PARTICLE TEXTURES
     ============================================================================== */
  generateProceduralTextures() {
    // 1. Myocardial Myofiber Striations & Micro-bump Map
    const bumpCanvas = document.createElement("canvas");
    bumpCanvas.width = 512;
    bumpCanvas.height = 512;
    const bCtx = bumpCanvas.getContext("2d");

    // Base neutral height
    bCtx.fillStyle = "#808080";
    bCtx.fillRect(0, 0, 512, 512);

    // Draw spiraling circumferential myofiber striations
    bCtx.lineWidth = 1.5;
    for (let i = 0; i < 512; i += 4) {
      const alpha = 0.18 + 0.12 * Math.sin(i * 0.1);
      bCtx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      bCtx.beginPath();
      bCtx.moveTo(0, i + Math.sin(i * 0.05) * 8);
      for (let x = 0; x <= 512; x += 32) {
        bCtx.lineTo(x, i + Math.sin((x + i) * 0.03) * 6);
      }
      bCtx.stroke();

      bCtx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.9})`;
      bCtx.beginPath();
      bCtx.moveTo(0, i + 2 + Math.sin(i * 0.05) * 8);
      for (let x = 0; x <= 512; x += 32) {
        bCtx.lineTo(x, i + 2 + Math.sin((x + i) * 0.03) * 6);
      }
      bCtx.stroke();
    }

    // Fine organic noise
    const imgData = bCtx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let j = 0; j < data.length; j += 4) {
      const n = (Math.random() - 0.5) * 22;
      data[j] = Math.min(255, Math.max(0, data[j] + n));
      data[j+1] = Math.min(255, Math.max(0, data[j+1] + n));
      data[j+2] = Math.min(255, Math.max(0, data[j+2] + n));
    }
    bCtx.putImageData(imgData, 0, 0);

    this.myoBumpTexture = new THREE.CanvasTexture(bumpCanvas);
    this.myoBumpTexture.wrapS = THREE.RepeatWrapping;
    this.myoBumpTexture.wrapT = THREE.RepeatWrapping;
    this.myoBumpTexture.repeat.set(4, 4);

    // 2. High-Resolution Glowing Erythrocyte Texture
    const pCanvas = document.createElement("canvas");
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pCtx = pCanvas.getContext("2d");
    const pGrad = pCtx.createRadialGradient(32, 32, 2, 32, 32, 32);
    pGrad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    pGrad.addColorStop(0.25, "rgba(255, 75, 90, 0.95)");
    pGrad.addColorStop(0.65, "rgba(225, 29, 72, 0.55)");
    pGrad.addColorStop(1, "rgba(159, 18, 57, 0)");
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 64, 64);
    this.particleTexture = new THREE.CanvasTexture(pCanvas);
  }

  /* ==============================================================================
     CINEMATIC 5-POINT LIGHTING WITH TRANSLUCENT SUBSURFACE BACKLIGHTING
     ============================================================================== */
  setupCinematicLighting() {
    // 1. Ambient twilight
    const ambientLight = new THREE.AmbientLight(0x0a1428, 1.3);
    this.scene.add(ambientLight);

    // 2. Trans-illumination Backlight (penetrates translucent myocardium & blood)
    const backSubsurfaceLight = new THREE.DirectionalLight(0xff2a40, 3.8);
    backSubsurfaceLight.position.set(-2, 2.5, -7.5);
    this.scene.add(backSubsurfaceLight);

    // 3. Crisp Medical Key Light (electric cyan rim)
    const keyLight = new THREE.DirectionalLight(0x38bdf8, 2.4);
    keyLight.position.set(6, 8, 7);
    this.scene.add(keyLight);

    // 4. Lateral Fill Light (arterial rose sheen)
    const fillLight = new THREE.DirectionalLight(0xf43f5e, 1.8);
    fillLight.position.set(-7, -4, 4);
    this.scene.add(fillLight);

    // 5. Specular Wet Reflection Spot
    const topHighlight = new THREE.PointLight(0xffffff, 1.6, 25);
    topHighlight.position.set(0, 6.5, 3.5);
    this.scene.add(topHighlight);

    // 6. Dynamic Internal Ventricular Systolic Pulsar Light
    this.cavityLight = new THREE.PointLight(0xff1133, 2.2, 5.5, 2.0);
    this.cavityLight.position.set(-0.35, -0.4, 0.1);
    this.heartGroup.add(this.cavityLight);
  }

  /* ==============================================================================
     ANATOMICAL CHAMBERS & TRANSLUCENT LIVING MYOCARDIUM
     ============================================================================== */
  buildHeartChambers() {
    // Ultra-realistic translucent living myocardium with clearcoat wet sheen
    this.myoMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8a1224,
      emissive: 0x30040b,
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0.92,
      clearcoatRoughness: 0.12,
      transmission: 0.46, // Translucent living muscle
      ior: 1.38,
      transparent: true,
      opacity: 0.94,
      bumpMap: this.myoBumpTexture,
      bumpScale: 0.035
    });

    // Ascending Aorta & Arch (translucent arterial conduit with clearcoat)
    this.aortaMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xc81e2b,
      emissive: 0x500a12,
      emissiveIntensity: 0.35,
      roughness: 0.20,
      metalness: 0.12,
      clearcoat: 0.95,
      clearcoatRoughness: 0.1,
      transmission: 0.55,
      ior: 1.36,
      transparent: true,
      opacity: 0.92
    });

    // Pulmonary Artery (deoxygenated venous cyan-blue translucent conduit)
    this.pulmonaryMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1d4ed8,
      emissive: 0x0f172a,
      emissiveIntensity: 0.35,
      roughness: 0.24,
      metalness: 0.1,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
      transmission: 0.52,
      ior: 1.35,
      transparent: true,
      opacity: 0.92
    });

    // 1. Left Ventricle (LV) - muscular apical cone
    const lvGeo = new THREE.SphereGeometry(1.3, 40, 40);
    const lvPos = lvGeo.attributes.position;
    for (let i = 0; i < lvPos.count; i++) {
      let x = lvPos.getX(i);
      let y = lvPos.getY(i);
      let z = lvPos.getZ(i);
      if (y < 0) {
        const taper = 1.0 + y * 0.45;
        x *= taper;
        z *= taper;
        y *= 1.48;
      }
      lvPos.setXYZ(i, x * 1.15, y * 1.36, z * 0.95);
    }
    lvGeo.computeVertexNormals();
    this.chambers.LV = new THREE.Mesh(lvGeo, this.myoMaterial);
    this.chambers.LV.position.set(-0.35, -0.4, 0.1);
    this.heartGroup.add(this.chambers.LV);

    // 2. Right Ventricle (RV) - crescentic anterior-lateral wrap
    const rvGeo = new THREE.SphereGeometry(1.15, 36, 36);
    const rvPos = rvGeo.attributes.position;
    for (let i = 0; i < rvPos.count; i++) {
      let x = rvPos.getX(i);
      let y = rvPos.getY(i);
      let z = rvPos.getZ(i);
      if (y < 0) {
        const taper = 1.0 + y * 0.35;
        x *= taper;
        z *= taper;
        y *= 1.25;
      }
      rvPos.setXYZ(i, x * 0.95, y * 1.1, z * 0.85);
    }
    rvGeo.computeVertexNormals();
    this.chambers.RV = new THREE.Mesh(rvGeo, this.myoMaterial);
    this.chambers.RV.position.set(0.75, -0.25, 0.45);
    this.chambers.RV.rotation.z = -0.15;
    this.heartGroup.add(this.chambers.RV);

    // 3. Left Atrium (LA) - posterior superior dome
    const laGeo = new THREE.SphereGeometry(0.85, 32, 32);
    this.chambers.LA = new THREE.Mesh(laGeo, this.myoMaterial);
    this.chambers.LA.position.set(-0.55, 0.95, -0.45);
    this.chambers.LA.scale.set(1.1, 0.9, 0.9);
    this.heartGroup.add(this.chambers.LA);

    // 4. Right Atrium (RA) - superior right chamber
    const raGeo = new THREE.SphereGeometry(0.88, 32, 32);
    this.chambers.RA = new THREE.Mesh(raGeo, this.myoMaterial);
    this.chambers.RA.position.set(0.95, 0.75, 0.15);
    this.chambers.RA.scale.set(1.0, 1.05, 0.95);
    this.heartGroup.add(this.chambers.RA);

    // 5. Ascending Aorta & Arch with 3 Brachiocephalic branches
    const aortaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.05, 0.7, 0.1),
      new THREE.Vector3(-0.05, 1.5, 0.05),
      new THREE.Vector3(-0.3, 2.2, -0.15),
      new THREE.Vector3(-0.7, 2.1, -0.45),
      new THREE.Vector3(-0.85, 1.2, -0.7)
    ]);
    const aortaGeo = new THREE.TubeGeometry(aortaCurve, 48, 0.38, 28, false);
    this.chambers.Aorta = new THREE.Mesh(aortaGeo, this.aortaMaterial);
    this.heartGroup.add(this.chambers.Aorta);

    // 3 Brachiocephalic Arch Branches
    const branchPositions = [
      { start: new THREE.Vector3(-0.15, 1.95, -0.05), end: new THREE.Vector3(-0.05, 2.7, 0.0) }, // Brachiocephalic
      { start: new THREE.Vector3(-0.38, 2.18, -0.22), end: new THREE.Vector3(-0.35, 2.8, -0.15) }, // Left Carotid
      { start: new THREE.Vector3(-0.58, 2.15, -0.38), end: new THREE.Vector3(-0.65, 2.75, -0.3) }  // Subclavian
    ];
    branchPositions.forEach(bp => {
      const bCurve = new THREE.CatmullRomCurve3([bp.start, bp.end]);
      const bGeo = new THREE.TubeGeometry(bCurve, 16, 0.082, 16, false);
      const bMesh = new THREE.Mesh(bGeo, this.aortaMaterial);
      this.heartGroup.add(bMesh);
    });

    // 6. Pulmonary Trunk (anterior to aorta)
    const paCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.35, 0.5, 0.45),
      new THREE.Vector3(0.2, 1.3, 0.35),
      new THREE.Vector3(-0.1, 1.7, 0.1)
    ]);
    const paGeo = new THREE.TubeGeometry(paCurve, 28, 0.34, 24, false);
    this.chambers.Pulmonary = new THREE.Mesh(paGeo, this.pulmonaryMaterial);
    this.heartGroup.add(this.chambers.Pulmonary);

    // 7. Vena Cava (SVC)
    const svcCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.1, 0.8, -0.1),
      new THREE.Vector3(1.15, 2.1, -0.15)
    ]);
    const svcGeo = new THREE.TubeGeometry(svcCurve, 18, 0.22, 18, false);
    const svcMesh = new THREE.Mesh(svcGeo, this.pulmonaryMaterial);
    this.heartGroup.add(svcMesh);
  }

  /* ==============================================================================
     INTERNAL TRANSLUCENT BLOOD POOL (GLOWING INTRACARDIAC BLOOD VOLUME)
     ============================================================================== */
  buildIntracardiacBloodPool() {
    // Glowing internal ventricular blood pool visible through translucent myocardium
    const bloodMat = new THREE.MeshPhysicalMaterial({
      color: 0xef233c,
      emissive: 0x800f1c,
      emissiveIntensity: 0.75,
      roughness: 0.18,
      metalness: 0.05,
      transmission: 0.65, // Translucent blood core
      ior: 1.34,
      transparent: true,
      opacity: 0.88
    });

    // LV Internal Blood Mesh
    const lvBloodGeo = new THREE.SphereGeometry(1.05, 32, 32);
    const lvPos = lvBloodGeo.attributes.position;
    for (let i = 0; i < lvPos.count; i++) {
      let x = lvPos.getX(i);
      let y = lvPos.getY(i);
      let z = lvPos.getZ(i);
      if (y < 0) {
        const taper = 1.0 + y * 0.42;
        x *= taper;
        z *= taper;
        y *= 1.45;
      }
      lvPos.setXYZ(i, x * 1.1, y * 1.3, z * 0.9);
    }
    lvBloodGeo.computeVertexNormals();

    this.lvBloodPool = new THREE.Mesh(lvBloodGeo, bloodMat);
    this.lvBloodPool.position.set(-0.35, -0.4, 0.1);
    this.heartGroup.add(this.lvBloodPool);
  }

  /* ==============================================================================
     EPICARDIAL ADIPOSE TISSUE (ANATOMICAL SULCUS FAT PADS)
     ============================================================================== */
  buildEpicardialFatPads() {
    // Authentic yellowish-ivory biological fat cushioning coronary sulci
    const fatMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd4a373,
      emissive: 0x78350f,
      emissiveIntensity: 0.25,
      roughness: 0.62,
      metalness: 0.05,
      transmission: 0.28,
      ior: 1.42,
      transparent: true,
      opacity: 0.78
    });

    // 1. Anterior Interventricular Sulcus Fat Cushion (under LAD)
    const ladFatCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.08, 0.70, 0.48),
      new THREE.Vector3(-0.04, 0.32, 0.84),
      new THREE.Vector3(-0.14, -0.16, 1.04),
      new THREE.Vector3(-0.34, -0.84, 0.98),
      new THREE.Vector3(-0.52, -1.50, 0.72)
    ]);
    const ladFatGeo = new THREE.TubeGeometry(ladFatCurve, 32, 0.12, 14, false);
    const ladFatMesh = new THREE.Mesh(ladFatGeo, fatMaterial);
    this.heartGroup.add(ladFatMesh);
    this.fatPads.push(ladFatMesh);

    // 2. Right Atrioventricular Groove Fat Cushion (under RCA)
    const rcaFatCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.35, 0.68, 0.32),
      new THREE.Vector3(0.82, 0.42, 0.56),
      new THREE.Vector3(1.12, -0.20, 0.61),
      new THREE.Vector3(0.92, -0.92, 0.37)
    ]);
    const rcaFatGeo = new THREE.TubeGeometry(rcaFatCurve, 28, 0.11, 14, false);
    const rcaFatMesh = new THREE.Mesh(rcaFatGeo, fatMaterial);
    this.heartGroup.add(rcaFatMesh);
    this.fatPads.push(rcaFatMesh);
  }

  /* ==============================================================================
     CORONARY ARTERY TREES (TRANSLUCENT WALL + INNER BLOOD COLUMN)
     ============================================================================== */
  buildCoronaryArteryTree() {
    this.arteryCurves = {
      LAD: new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.1, 0.75, 0.5),    // LM bifurcation
        new THREE.Vector3(-0.05, 0.35, 0.88),  // Proximal LAD (focal stenosis zone)
        new THREE.Vector3(-0.15, -0.15, 1.08), // Mid LAD
        new THREE.Vector3(-0.35, -0.85, 1.02), // Distal LAD
        new THREE.Vector3(-0.55, -1.55, 0.75), // Apical LAD wrap
        new THREE.Vector3(-0.65, -1.9, 0.45)   // Apex tip
      ]),
      LCX: new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.1, 0.75, 0.5),    // LM bifurcation
        new THREE.Vector3(-0.6, 0.65, 0.35),   // Circumflex bend in AV groove
        new THREE.Vector3(-1.05, 0.35, 0.05),  // Mid LCX (focal stenosis zone)
        new THREE.Vector3(-1.3, -0.25, -0.3),  // Posterolateral obtuse marginal (OM)
        new THREE.Vector3(-1.15, -0.9, -0.55)  // Distal posterior wall
      ]),
      RCA: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.35, 0.72, 0.35),   // Right aortic sinus ostium
        new THREE.Vector3(0.85, 0.45, 0.6),    // Proximal RCA right AV groove
        new THREE.Vector3(1.15, -0.2, 0.65),   // Mid RCA acute margin (focal stenosis zone)
        new THREE.Vector3(0.95, -0.95, 0.4),   // Distal RCA inferior border
        new THREE.Vector3(0.45, -1.4, -0.15),  // PDA (posterior descending artery)
        new THREE.Vector3(0.05, -1.65, -0.45)  // Inferior crux
      ])
    };

    // Anatomical diagonal & marginal branches (D1/D2 for LAD, OM1 for LCX)
    this.branchCurves = [
      // D1 Diagonal branch off LAD
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.05, 0.35, 0.88),
        new THREE.Vector3(-0.45, 0.05, 0.85),
        new THREE.Vector3(-0.75, -0.35, 0.7)
      ]),
      // D2 Secondary diagonal off LAD
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.18, -0.20, 1.06),
        new THREE.Vector3(-0.52, -0.55, 0.95),
        new THREE.Vector3(-0.70, -0.95, 0.75)
      ]),
      // OM1 Marginal branch off LCX
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.05, 0.35, 0.05),
        new THREE.Vector3(-1.25, -0.1, 0.25),
        new THREE.Vector3(-1.35, -0.65, 0.2)
      ])
    ];

    this.vesselMaterials = {};
    this.bloodColumnMaterials = {};

    for (const [name, curve] of Object.entries(this.arteryCurves)) {
      // 1. Outer Translucent Vessel Wall (Tunica Adventitia/Media)
      this.vesselMaterials[name] = new THREE.MeshPhysicalMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.4,
        roughness: 0.12,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        transmission: 0.82, // Highly translucent vessel endothelium!
        ior: 1.36,
        transparent: true,
        opacity: 0.72
      });

      const outerTubeGeo = new THREE.TubeGeometry(curve, 72, 0.086, 20, false);
      const outerTubeMesh = new THREE.Mesh(outerTubeGeo, this.vesselMaterials[name]);
      outerTubeMesh.name = name;
      outerTubeMesh.userData = { vesselName: name };
      this.vessels[name] = outerTubeMesh;
      this.heartGroup.add(outerTubeMesh);

      // 2. Inner Pulsing Arterial Blood Core (visible inside translucent wall)
      this.bloodColumnMaterials[name] = new THREE.MeshPhysicalMaterial({
        color: 0xef233c,
        emissive: 0x991b1b,
        emissiveIntensity: 0.75,
        roughness: 0.15,
        transmission: 0.35,
        ior: 1.34,
        transparent: true,
        opacity: 0.88
      });

      const innerTubeGeo = new THREE.TubeGeometry(curve, 72, 0.060, 16, false);
      const innerTubeMesh = new THREE.Mesh(innerTubeGeo, this.bloodColumnMaterials[name]);
      this.innerBloodColumns[name] = innerTubeMesh;
      this.heartGroup.add(innerTubeMesh);

      // 3. Atherosclerotic Plaque Collar Ring at focal stenosis locus (t=0.35)
      const focalPt = curve.getPointAt(0.35);
      const tangent = curve.getTangentAt(0.35);

      const plaqueGeo = new THREE.TorusGeometry(0.075, 0.048, 18, 28);
      const plaqueMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xb45309,
        emissiveIntensity: 0.45,
        roughness: 0.55,
        metalness: 0.25
      });
      const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
      plaqueMesh.position.copy(focalPt);

      // Align plaque ring orientation with vessel tangent vector
      const axis = new THREE.Vector3(0, 0, 1).cross(tangent).normalize();
      const angle = Math.acos(new THREE.Vector3(0, 0, 1).dot(tangent));
      plaqueMesh.quaternion.setFromAxisAngle(axis, angle);
      plaqueMesh.scale.set(0.2, 0.2, 0.2);
      this.plaques[name] = plaqueMesh;
      this.heartGroup.add(plaqueMesh);

      // 4. Expandable Diamond-Strut Platinum Virtual Stent
      const stentGeo = new THREE.CylinderGeometry(0.088, 0.088, 0.44, 18, 14, true);
      const stentMat = new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        emissive: 0x94a3b8,
        emissiveIntensity: 0.8,
        wireframe: true,
        metalness: 0.98,
        roughness: 0.12
      });
      const stentMesh = new THREE.Mesh(stentGeo, stentMat);
      stentMesh.position.copy(focalPt);
      stentMesh.quaternion.setFromAxisAngle(axis, angle);
      stentMesh.visible = false;
      stentMesh.scale.set(0.1, 1.0, 0.1);
      this.stents[name] = stentMesh;
      this.heartGroup.add(stentMesh);
    }

    // Add diagonal branches with translucent materials
    this.branchCurves.forEach(bCurve => {
      const bGeo = new THREE.TubeGeometry(bCurve, 24, 0.048, 14, false);
      const bMesh = new THREE.Mesh(bGeo, this.vesselMaterials["LAD"]);
      this.heartGroup.add(bMesh);

      const bInnerGeo = new THREE.TubeGeometry(bCurve, 24, 0.034, 10, false);
      const bInnerMesh = new THREE.Mesh(bInnerGeo, this.bloodColumnMaterials["LAD"]);
      this.heartGroup.add(bInnerMesh);
    });
  }

  /* ==============================================================================
     AHA 17-SEGMENT MYOCARDIAL ISCHEMIA PERFUSION TERRITORIES
     ============================================================================== */
  buildPerfusionTerritories() {
    // 1. Anterior / Septal Myocardium (Supplied by LAD)
    const ladPatchGeo = new THREE.SphereGeometry(1.29, 28, 28, 0, Math.PI * 0.5, 0.2, Math.PI * 0.6);
    this.perfusionPatches.LAD = new THREE.Mesh(
      ladPatchGeo,
      new THREE.MeshStandardMaterial({
        color: 0x801020,
        emissive: 0x000000,
        roughness: 0.4,
        transparent: true,
        opacity: 0.85
      })
    );
    this.perfusionPatches.LAD.position.set(-0.35, -0.4, 0.14);
    this.heartGroup.add(this.perfusionPatches.LAD);

    // 2. Lateral Ventricular Myocardium (Supplied by LCX)
    const lcxPatchGeo = new THREE.SphereGeometry(1.29, 28, 28, Math.PI * 0.5, Math.PI * 0.5, 0.3, Math.PI * 0.6);
    this.perfusionPatches.LCX = new THREE.Mesh(
      lcxPatchGeo,
      new THREE.MeshStandardMaterial({
        color: 0x801020,
        emissive: 0x000000,
        roughness: 0.4,
        transparent: true,
        opacity: 0.85
      })
    );
    this.perfusionPatches.LCX.position.set(-0.38, -0.4, 0.08);
    this.heartGroup.add(this.perfusionPatches.LCX);

    // 3. Inferior / RV Wall Myocardium (Supplied by RCA)
    const rcaPatchGeo = new THREE.SphereGeometry(1.13, 28, 28, 0, Math.PI * 0.6, 0.4, Math.PI * 0.5);
    this.perfusionPatches.RCA = new THREE.Mesh(
      rcaPatchGeo,
      new THREE.MeshStandardMaterial({
        color: 0x801020,
        emissive: 0x000000,
        roughness: 0.4,
        transparent: true,
        opacity: 0.85
      })
    );
    this.perfusionPatches.RCA.position.set(0.72, -0.28, 0.42);
    this.heartGroup.add(this.perfusionPatches.RCA);
  }

  /* ==============================================================================
     1D POISEUILLE-BERNOULLI ERYTHROCYTE PARTICLE SIMULATION (450 PARTICLES)
     ============================================================================== */
  buildPoiseuilleParticles() {
    const particleCountPerVessel = 150;

    ["LAD", "LCX", "RCA"].forEach(vessel => {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCountPerVessel * 3);
      const uProgress = new Float32Array(particleCountPerVessel);

      for (let i = 0; i < particleCountPerVessel; i++) {
        const u = Math.random();
        uProgress[i] = u;
        const pt = this.arteryCurves[vessel].getPointAt(u);
        positions[i * 3] = pt.x + (Math.random() - 0.5) * 0.02;
        positions[i * 3 + 1] = pt.y + (Math.random() - 0.5) * 0.02;
        positions[i * 3 + 2] = pt.z + (Math.random() - 0.5) * 0.02;
      }

      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.userData = { uProgress, vessel };

      const mat = new THREE.PointsMaterial({
        size: 0.13,
        map: this.particleTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const pSystem = new THREE.Points(geo, mat);
      this.particleSystems[vessel] = pSystem;
      this.heartGroup.add(pSystem);
    });
  }

  /* ==============================================================================
     INTRACARDIAC 4D FLOW HELICAL VORTEX STREAMLINES (120 PARTICLES IN LV)
     ============================================================================== */
  buildIntracardiacVortexStreamlines() {
    const vortexCount = 120;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(vortexCount * 3);
    const vAngles = new Float32Array(vortexCount);
    const vRadii = new Float32Array(vortexCount);
    const vHeights = new Float32Array(vortexCount);

    for (let i = 0; i < vortexCount; i++) {
      vAngles[i] = Math.random() * Math.PI * 2;
      vRadii[i] = 0.15 + Math.random() * 0.55;
      vHeights[i] = -0.9 + Math.random() * 1.1;

      const x = -0.35 + Math.cos(vAngles[i]) * vRadii[i];
      const y = -0.4 + vHeights[i];
      const z = 0.1 + Math.sin(vAngles[i]) * vRadii[i];

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.userData = { vAngles, vRadii, vHeights };

    const mat = new THREE.PointsMaterial({
      size: 0.09,
      map: this.particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.75
    });

    this.lvVortexSystem = new THREE.Points(geo, mat);
    this.heartGroup.add(this.lvVortexSystem);
  }

  /* ==============================================================================
     3D-TRACKED FLOATING HUD PINS
     ============================================================================== */
  buildFloatingPins() {
    ["LAD", "LCX", "RCA"].forEach(vessel => {
      const pinEl = document.createElement("div");
      pinEl.className = "floating-vessel-pin mono";
      pinEl.id = `pin-${vessel}`;
      pinEl.innerHTML = `<span>${vessel}</span> <span id="pin-val-${vessel}" style="color: var(--emerald-bio)">15%</span>`;
      this.container.appendChild(pinEl);
      this.floatingPins[vessel] = pinEl;
    });
  }

  updateFloatingPins() {
    const pinCoords = {
      LAD: this.arteryCurves.LAD.getPointAt(0.35),
      LCX: this.arteryCurves.LCX.getPointAt(0.35),
      RCA: this.arteryCurves.RCA.getPointAt(0.35)
    };

    const widthHalf = this.container.clientWidth / 2;
    const heightHalf = this.container.clientHeight / 2;

    for (const [vessel, pinEl] of Object.entries(this.floatingPins)) {
      const worldPos = pinCoords[vessel].clone().applyMatrix4(this.heartGroup.matrixWorld);
      const screenPos = worldPos.project(this.camera);

      if (screenPos.z < 1.0) {
        const x = (screenPos.x * widthHalf) + widthHalf;
        const y = -(screenPos.y * heightHalf) + heightHalf;
        pinEl.style.left = `${x}px`;
        pinEl.style.top = `${y}px`;
        pinEl.style.opacity = "1";
      } else {
        pinEl.style.opacity = "0";
      }
    }
  }

  /* ==============================================================================
     DYNAMIC STATE UPDATES FROM API
     ============================================================================== */
  updateState(predictions, patientVitals = {}) {
    if (patientVitals.PR) this.bpm = patientVitals.PR;
    if (patientVitals["EF-TTE"]) this.ef = patientVitals["EF-TTE"];
    if (patientVitals["Region with RWMA"] !== undefined) this.rwma = patientVitals["Region with RWMA"];

    for (const vessel of ["LAD", "LCX", "RCA"]) {
      if (predictions[vessel]) {
        const p = predictions[vessel].probability;
        this.vesselRisks[vessel] = p;
        this.vesselVffr[vessel] = predictions[vessel].vffr;
        this.vesselLumen[vessel] = predictions[vessel].lumen_diameter_ratio;
        this.stented[vessel] = predictions[vessel].stented || false;

        // 1. Vessel wall risk colors & emissive glow
        let colorHex, emissiveHex;
        if (p < 0.35) {
          colorHex = 0x10b981; // Emerald Green
          emissiveHex = 0x059669;
        } else if (p < 0.65) {
          colorHex = 0xf59e0b; // Amber Warning
          emissiveHex = 0xb45309;
        } else {
          colorHex = 0xef4444; // Pulsing Critical Crimson
          emissiveHex = 0x991b1b;
        }
        this.vesselMaterials[vessel].color.setHex(colorHex);
        this.vesselMaterials[vessel].emissive.setHex(emissiveHex);

        // 2. Plaque Collar Ring Scale
        const plaque = this.plaques[vessel];
        if (plaque) {
          const plaqueScale = Math.max(0.2, p * 1.5);
          plaque.scale.set(plaqueScale, plaqueScale, plaqueScale);
          plaque.visible = p > 0.25;
        }

        // 3. Downstream Myocardial Perfusion Patch Color
        const patch = this.perfusionPatches[vessel];
        if (patch && this.showIschemia) {
          if (p >= 0.50) {
            patch.material.color.setHex(0x2e1065); // Ischemic cyanotic purple-blue
            patch.material.emissive.setHex(0x1e1b4b);
            patch.material.emissiveIntensity = 0.55;
          } else {
            patch.material.color.setHex(0x801020); // Healthy perfused myocardium
            patch.material.emissive.setHex(0x000000);
            patch.material.emissiveIntensity = 0.0;
          }
        }

        // 4. Update Floating Pin Text
        const pinValEl = document.getElementById(`pin-val-${vessel}`);
        if (pinValEl) {
          pinValEl.textContent = `${Math.round(p * 100)}% (FFR ${predictions[vessel].vffr})`;
          pinValEl.style.color = p < 0.35 ? "var(--emerald-bio)" : (p < 0.65 ? "var(--amber-warn)" : "var(--crimson-crit)");
        }
      }
    }
  }

  /* ==============================================================================
     VIRTUAL STENT 3D DEPLOYMENT ANIMATION
     ============================================================================== */
  deployStent(vessel = "LAD") {
    const stent = this.stents[vessel];
    if (!stent) return;

    this.stented[vessel] = true;
    stent.visible = true;
    stent.scale.set(0.1, 1.0, 0.1);

    let progress = 0;
    const expandAnim = () => {
      progress += 0.05;
      const s = 0.1 + 0.9 * Math.sin((progress * Math.PI) / 2);
      stent.scale.set(s, 1.0, s);
      if (progress < 1.0) {
        requestAnimationFrame(expandAnim);
      } else {
        stent.scale.set(1.0, 1.0, 1.0);
        if (this.plaques[vessel]) {
          this.plaques[vessel].scale.set(0.3, 0.3, 0.3);
        }
      }
    };
    expandAnim();
  }

  /* ==============================================================================
     INTERACTIVE CAMERA PRESETS & RAYCASTING
     ============================================================================== */
  setCameraPreset(presetName) {
    const targets = {
      lad: { pos: new THREE.Vector3(-0.2, 0.8, 5.6), target: new THREE.Vector3(-0.2, -0.4, 0.6) },
      lcx: { pos: new THREE.Vector3(-4.8, 1.2, 2.2), target: new THREE.Vector3(-0.8, 0.0, 0.0) },
      rca: { pos: new THREE.Vector3(4.8, 0.6, 2.8), target: new THREE.Vector3(0.6, -0.3, 0.3) },
      aorta: { pos: new THREE.Vector3(0.0, 6.2, 2.5), target: new THREE.Vector3(0.0, 1.0, 0.0) },
      reset: { pos: new THREE.Vector3(0, 1.1, 7.0), target: new THREE.Vector3(0, -0.2, 0) }
    };

    const targetPreset = targets[presetName.toLowerCase()] || targets.reset;
    this.flyCameraTo(targetPreset.pos, targetPreset.target);
  }

  flyCameraTo(targetPos, targetLookAt) {
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    let t = 0;

    const step = () => {
      t += 0.04;
      const ease = 0.5 - 0.5 * Math.cos(Math.min(t, 1.0) * Math.PI);
      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.controls.target.lerpVectors(startTarget, targetLookAt, ease);
      this.controls.update();

      if (t < 1.0) {
        requestAnimationFrame(step);
      }
    };
    step();
  }

  onCanvasClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const vesselMeshes = Object.values(this.vessels);
    const intersects = this.raycaster.intersectObjects(vesselMeshes);

    if (intersects.length > 0) {
      const hitVessel = intersects[0].object.userData.vesselName;
      if (hitVessel && window.selectActiveVessel) {
        window.selectActiveVessel(hitVessel);
        this.setCameraPreset(hitVessel);
      }
    }
  }

  toggleXRay(enabled) {
    this.isXRayMode = enabled;
    this.myoMaterial.wireframe = enabled;
    this.aortaMaterial.wireframe = enabled;
    this.pulmonaryMaterial.wireframe = enabled;
  }

  toggleLayer(layerName, enabled) {
    if (layerName === "particles") {
      this.showParticles = enabled;
      Object.values(this.particleSystems).forEach(p => p.visible = enabled);
      if (this.lvVortexSystem) this.lvVortexSystem.visible = enabled;
    } else if (layerName === "ischemia") {
      this.showIschemia = enabled;
      Object.values(this.perfusionPatches).forEach(patch => patch.visible = enabled);
    } else if (layerName === "orbit") {
      this.autoOrbit = enabled;
    }
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /* ==============================================================================
     60FPS CARDIAC CYCLE & FLUID DYNAMICS ANIMATION LOOP
     ============================================================================== */
  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // 1. Two-Phase Cardiac Cycle Synced to PR (BPM) & EF-TTE
    const heartRateHz = this.bpm / 60.0;
    this.cardiacPhase = (this.cardiacPhase + delta * heartRateHz) % 1.0;
    const cp = this.cardiacPhase;

    let systolicCurve = 0;
    if (cp < 0.35) {
      systolicCurve = Math.sin((cp / 0.35) * Math.PI);
    } else if (cp > 0.75) {
      systolicCurve = Math.sin(((cp - 0.75) / 0.25) * Math.PI) * 0.25;
    }

    const efFactor = (this.ef / 60.0) * 0.088;
    const squeezeScale = 1.0 - systolicCurve * efFactor;

    // Apply systolic contraction with RWMA territorial akinesis
    if (this.chambers.LV) {
      const isLADHk = this.vesselRisks.LAD > 0.70 || this.rwma === 1 || this.rwma === 4;
      const lvEffort = isLADHk ? 0.35 : 1.0;
      this.chambers.LV.scale.set(
        1.15 * (1.0 - (1.0 - squeezeScale) * lvEffort),
        1.36 * (1.0 - (1.0 - squeezeScale) * lvEffort * 1.2),
        0.95 * (1.0 - (1.0 - squeezeScale) * lvEffort)
      );

      // Synced LV Blood Pool contraction
      if (this.lvBloodPool) {
        this.lvBloodPool.scale.set(
          1.1 * (1.0 - (1.0 - squeezeScale) * lvEffort * 1.15),
          1.3 * (1.0 - (1.0 - squeezeScale) * lvEffort * 1.3),
          0.9 * (1.0 - (1.0 - squeezeScale) * lvEffort * 1.15)
        );
      }
    }

    if (this.chambers.RV) {
      const isRCAHk = this.vesselRisks.RCA > 0.70 || this.rwma === 2 || this.rwma === 4;
      const rvEffort = isRCAHk ? 0.35 : 1.0;
      this.chambers.RV.scale.set(
        0.95 * (1.0 - (1.0 - squeezeScale) * rvEffort),
        1.1 * (1.0 - (1.0 - squeezeScale) * rvEffort),
        0.85 * (1.0 - (1.0 - squeezeScale) * rvEffort)
      );
    }

    // 2. Trans-illumination Ventricular Systolic Glow Pulsar
    if (this.cavityLight) {
      this.cavityLight.intensity = 1.5 + systolicCurve * 2.8;
    }

    // 3. High-Frequency Alarm Pulse for Critical Stenosis
    for (const [vessel, p] of Object.entries(this.vesselRisks)) {
      if (p >= 0.65 && !this.stented[vessel]) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 8.0);
        this.vesselMaterials[vessel].emissiveIntensity = 0.4 + 0.5 * pulse;
      } else {
        this.vesselMaterials[vessel].emissiveIntensity = 0.4;
      }
    }

    // 4. Poiseuille Particle Simulation along 3D Artery Curves
    if (this.showParticles) {
      for (const [vessel, pSystem] of Object.entries(this.particleSystems)) {
        const curve = this.arteryCurves[vessel];
        const geo = pSystem.geometry;
        const posAttr = geo.attributes.position;
        const uProg = geo.userData.uProgress;
        const pRisk = this.vesselRisks[vessel];
        const isStented = this.stented[vessel];

        for (let i = 0; i < uProg.length; i++) {
          let u = uProg[i];

          let speed = 0.34;
          if (pRisk > 0.40 && !isStented) {
            if (u < 0.30) {
              speed = 0.18; // Pre-stenotic bunching
            } else if (u >= 0.30 && u <= 0.42) {
              speed = 0.78 * (1.0 + pRisk); // High-speed stenotic jet (Bernoulli)
            } else {
              speed = 0.12 * Math.max(0.2, 1.0 - pRisk); // Post-stenotic trickle
            }
          }

          u = (u + delta * speed) % 1.0;
          uProg[i] = u;

          const pt = curve.getPointAt(u);
          const r = Math.max(0.012, (1.0 - pRisk * 0.7) * 0.035);
          posAttr.setXYZ(
            i,
            pt.x + (Math.sin(i * 13 + time * 3.5) * r),
            pt.y + (Math.cos(i * 17 + time * 3.5) * r),
            pt.z + (Math.sin(i * 19 + time * 3.5) * r)
          );
        }
        posAttr.needsUpdate = true;
      }

      // Intracardiac 4D Flow Vortex swirling inside LV
      if (this.lvVortexSystem) {
        const vGeo = this.lvVortexSystem.geometry;
        const vPosAttr = vGeo.attributes.position;
        const { vAngles, vRadii, vHeights } = vGeo.userData;

        for (let i = 0; i < vAngles.length; i++) {
          vAngles[i] += delta * 1.8; // Helical spin rate
          vHeights[i] -= delta * 0.25;
          if (vHeights[i] < -0.9) vHeights[i] = 0.2;

          const x = -0.35 + Math.cos(vAngles[i]) * vRadii[i];
          const y = -0.4 + vHeights[i];
          const z = 0.1 + Math.sin(vAngles[i]) * vRadii[i];

          vPosAttr.setXYZ(i, x, y, z);
        }
        vPosAttr.needsUpdate = true;
      }
    }

    // 5. Auto-Orbit
    if (this.autoOrbit && this.controls) {
      this.heartGroup.rotation.y += delta * 0.3;
    }

    if (this.controls) {
      this.controls.update();
    }

    // 6. Update Screen-Space Floating Pin Positions
    this.updateFloatingPins();

    // 7. Render the current frame
    this.renderer.render(this.scene, this.camera);
  }

  /* ==============================================================================
     EXTERNAL ANATOMICAL MESH LOADER (BodyParts3D OBJ & Open-Source GLTF/GLB)
     ============================================================================== */
  loadExternalMesh(url, type = "gltf", options = {}, callback = null) {
    const scale = options.scale || 1.0;
    const hideProceduralChambers = options.hideProceduralChambers !== false;

    const onMeshLoaded = (object) => {
      if (this.externalMesh) {
        this.heartGroup.remove(this.externalMesh);
      }

      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);
      object.scale.set(scale, scale, scale);

      object.traverse((child) => {
        if (child.isMesh) {
          child.material = this.myoMaterial;
          child.castShadow = true;
        }
      });

      this.externalMesh = object;
      this.heartGroup.add(this.externalMesh);

      if (hideProceduralChambers) {
        Object.values(this.chambers).forEach(m => { if (m) m.visible = false; });
      }

      console.log(`[CardioTwin-4D] Successfully loaded external anatomical mesh: ${url}`);
      if (callback) callback(object);
    };

    if (type.toLowerCase() === "obj" && typeof THREE.OBJLoader !== "undefined") {
      const loader = new THREE.OBJLoader();
      loader.load(url, onMeshLoaded, undefined, (err) => console.error("OBJ Load Error:", err));
    } else if (typeof THREE.GLTFLoader !== "undefined") {
      const loader = new THREE.GLTFLoader();
      loader.load(url, (gltf) => onMeshLoaded(gltf.scene || gltf.scenes[0]), undefined, (err) => console.error("GLTF Load Error:", err));
    } else {
      console.warn("[CardioTwin-4D] Neither OBJLoader nor GLTFLoader available for external mesh.");
    }
  }

  toggleProceduralMyocardium(visible) {
    Object.values(this.chambers).forEach(m => { if (m) m.visible = visible; });
    if (this.externalMesh) {
      this.externalMesh.visible = !visible;
    }
  }
}

// Export instance creator
window.createHeart3D = function(containerId) {
  return new CardioTwinHeart3D(containerId);
};
