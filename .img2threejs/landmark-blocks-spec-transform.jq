def recipe($a; $b; $class): {
  dominantAlbedo: $a,
  secondaryAlbedo: $b,
  materialClass: $class,
  materialClassConfidence: 0.82
};

def action($collider): {
  animationRole: "static-architecture",
  pivot: { mode: "parcel-center", localPosition: [0,0,0], axis: [0,1,0], confidence: 1 },
  transformChannels: { translate: false, rotate: false, scale: false, bend: false, twist: false, detach: false, visibility: true, materialState: true },
  sockets: [],
  collider: { type: $collider, offset: [0,0,0], scale: [1,1,1], isTrigger: false, notes: "One coarse parcel proxy; decorative children have no colliders." },
  constraints: [],
  destruction: { breakable: false, fractureGroup: "architecture", seamRefs: [], detachableFragments: [], breakImpulse: 0, debrisMaterial: "masonry" }
};

def component($id; $name; $level; $role; $parent; $material; $feature; $color1; $color2; $class): {
  id: $id,
  name: $name,
  level: $level,
  role: $role,
  importance: (if $level == "macro" then 1 else if $level == "meso" then 0.82 else 0.58 end end),
  confidence: 0.78,
  primitive: "box",
  topologyClass: "assembled-solid",
  topologyRationale: "Static overlapping boxes, low-segment roofs, and instanced facade parts reproduce the visible architectural hierarchy.",
  geometryDescriptor: {
    topologyIntent: "merged static shell with instanced repeated detail",
    edgeTreatment: { type: "small-bevel-or-layered-cornice", bevelRadius: 0.02, segments: 1 },
    deformationStack: [],
    uvStrategy: "world-scale procedural facade coordinates",
    normalStrategy: "generated face normals"
  },
  parent: $parent,
  attachment: null,
  dimensions: { width: 1, height: 1, depth: 1, units: "parcel-relative", confidence: 0.78 },
  transform: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] },
  actionProfile: action("box"),
  material: $material,
  materialLayers: [$material],
  colorMaterialRecipe: recipe($color1; $color2; $class),
  deformations: [], joints: [], seams: [],
  localFeatures: [{ id: $feature, description: $name, evidenceRefs: ["full-object"] }],
  surfaceDetail: {
    macroRoughness: 0.84, microRoughness: 0.12, bumpAmplitude: 0.012,
    normalPattern: "project facade texture or small-scale masonry breakup",
    displacementPattern: "none",
    occlusionPattern: "cornice and window recess contacts",
    edgeWearPattern: "restrained sill and base discoloration",
    notes: "Relief affecting silhouette is geometry; texture relief stays subtle."
  },
  evidenceRefs: ["full-object"], details: [], fidelityTier: "gameplay-landmark"
};

def material($id; $name; $color; $secondary; $roughness; $metalness; $override): {
  id: $id,
  name: $name,
  type: "standard",
  shaderModel: "MeshStandardMaterial",
  baseColor: $color,
  color: $color,
  albedo: { dominant: $color, secondary: [$secondary], samplingNotes: "Period-reference palette interpreted through the existing game lighting." },
  colorVariation: { palette: [$color,$secondary], pattern: "parcel-and-instance tint", amplitude: 0.08, heightCorrelation: 0.15 },
  textureResolution: 1024,
  textureProjection: { mode: "world-space", repeat: [4,4], anisotropy: 4, texelDensityIntent: "Stable masonry scale across differently sized shells." },
  surfaceFrequencyBands: [
    { id: "macro", frequency: 1.5, amplitude: 0.12, role: "parcel color variation" },
    { id: "meso", frequency: 10, amplitude: 0.08, role: "masonry courses and slate strips" },
    { id: "micro", frequency: 48, amplitude: 0.02, role: "grazing-light breakup" }
  ],
  roughness: { base: $roughness, variation: 0.08, map: "independent project roughness or scalar instance variation", localResponse: "darker cavities are slightly rougher" },
  metalness: { base: $metalness, variation: 0.05 },
  normal: { pattern: "independent project normal or geometry normals", strength: 0.16, scale: 24, space: "tangent" },
  bump: { pattern: "independent fine masonry field", amplitude: 0.012, scale: 1 },
  displacement: { pattern: "none", amplitude: 0, scale: 1, silhouetteAffects: false },
  ambientOcclusion: { cavityStrength: 0.18, contactShadowBias: 0.22, notes: "Applied at window, belt-course, and roof contacts." },
  wear: { edgeWear: 0.025, scratches: [], chips: [] },
  dirt: { amount: 0.035, cavityBias: 0.5, color: "#342d26" },
  localOverrides: [{ id: $override, region: "base-and-sill contacts", roughness: ($roughness + 0.04), albedoShift: "slightly darker and less saturated", evidenceRefs: ["full-object"] }],
  shaderNotes: ["Share the material across the landmark kit; vary color per instance."],
  notes: "Performance-balanced period facade finish."
};

.preSpecAssessment.objectClass = {
  primaryType: "compressed urban landmark ensemble",
  primaryDomain: "object",
  formLanguage: ["French chateau", "Romanesque hotel", "Italian Renaissance hotel", "attached marble row", "French Renaissance mansion"],
  structureKind: ["static merged shells", "instanced facade systems", "low-segment roof silhouettes"],
  motionPotential: ["static architecture", "click identification only"],
  materialFamilies: ["limestone and marble", "Roman brick", "slate", "aged copper", "painted iron and sash"],
  notes: "Game-scale ensemble preserving the current playable grid and landmark hierarchy."
} |
.preSpecAssessment.complexity.scores = {
  silhouetteComplexity: 3, componentCount: 3, hierarchyDepth: 2, repetitionDensity: 3,
  materialLayerCount: 2, localDetailDensity: 2, occlusionRisk: 1, actionReadinessNeed: 1
} |
.preSpecAssessment.complexity.estimatedCounts = {
  macroComponents: 4, mesoComponents: 8, microFeatureGroups: 5, materialLayers: 5, repetitionSystems: 3
} |
.preSpecAssessment.complexity.reasoning = [
  "Seven compressed landmarks share materials and repetition systems but require distinct skyline silhouettes.",
  "Street-facing hierarchy matters more than hidden elevations or exact ornament."
] |
.preSpecAssessment.unknownsToResolveBeforeImplementation = [] |
.preSpecAssessment.detailInventory = {
  scanMethod: "landmark identity zones",
  targetMinDetails: 10,
  details: [
    { id:"vanderbilt-turrets", kind:"contour", description:"Conical and square corner towers", mapsTo:{type:"component.localFeatures",ref:"vanderbilt-silhouette"}, evidenceRef:"full-object", confidence:0.9 },
    { id:"vanderbilt-dormers", kind:"ridge", description:"Gabled dormer rhythm", mapsTo:{type:"component.localFeatures",ref:"dormer-rhythm"}, evidenceRef:"full-object", confidence:0.85 },
    { id:"netherland-arches", kind:"contour", description:"Romanesque base arches", mapsTo:{type:"component.localFeatures",ref:"hotel-arch-bases"}, evidenceRef:"full-object", confidence:0.8 },
    { id:"netherland-crown", kind:"contour", description:"Tall turreted hotel crown", mapsTo:{type:"component.localFeatures",ref:"hotel-crowns"}, evidenceRef:"full-object", confidence:0.82 },
    { id:"savoy-cornice", kind:"ridge", description:"Strong Italianate cornice bands", mapsTo:{type:"component.localFeatures",ref:"cornice-bands"}, evidenceRef:"full-object", confidence:0.8 },
    { id:"marble-stoops", kind:"contour", description:"Repeated row-house stoops", mapsTo:{type:"component.localFeatures",ref:"entrance-portals"}, evidenceRef:"full-object", confidence:0.86 },
    { id:"row-party-walls", kind:"seam", description:"Attached-house party-wall rhythm", mapsTo:{type:"component.localFeatures",ref:"rowhouse-party-rhythm"}, evidenceRef:"full-object", confidence:0.9 },
    { id:"gerry-gable", kind:"contour", description:"Dominant French gable", mapsTo:{type:"component.localFeatures",ref:"mansion-rooflines"}, evidenceRef:"full-object", confidence:0.9 },
    { id:"iron-areaways", kind:"linework", description:"Low iron areaway and gate fields", mapsTo:{type:"component.localFeatures",ref:"iron-areaways"}, evidenceRef:"full-object", confidence:0.75 },
    { id:"base-weathering", kind:"stain", description:"Restrained base and sill weathering", mapsTo:{type:"material.localOverrides",ref:"masonry/base-weathering"}, evidenceRef:"full-object", confidence:0.7 }
  ]
} |
.featureReviewTargets = [
  { id:"vanderbilt-chateau-silhouette", name:"Vanderbilt chateau towers and roofline", tier:"critical", passIds:["blockout","structural-pass"], minimumScore:0.8, mustPass:true, componentRefs:["vanderbilt"], evidenceRefs:["full-object"] },
  { id:"hotel-height-hierarchy", name:"New Netherland and Savoy/Bolkenhayn height hierarchy", tier:"critical", passIds:["blockout","structural-pass"], minimumScore:0.8, mustPass:true, componentRefs:["hotel-ensemble"], evidenceRefs:["full-object"] },
  { id:"mansion-edge-rhythm", name:"Marble Row, Huntington, and Gerry street-edge rhythm", tier:"critical", passIds:["structural-pass","form-refinement"], minimumScore:0.78, mustPass:true, componentRefs:["edge-ensemble"], evidenceRefs:["full-object"] },
  { id:"shared-facade-language", name:"Shared windows, cornices, dormers, and entrances", tier:"important", passIds:["form-refinement","material-pass"], minimumScore:0.68, mustPass:false, componentRefs:["window-bays","roof-systems","entrance-systems"], evidenceRefs:["full-object"] },
  { id:"runtime-budget", name:"Merged shells and low-cost repeated detail", tier:"critical", passIds:["optimization-pass"], minimumScore:0.8, mustPass:true, componentRefs:["district-root"], evidenceRefs:["full-object"] }
] |
.lookDevTargets.qualityPriority = "performance-balanced" |
.lookDevTargets.materialPass.referencePbrExtraction.requiredWhenSourceImagePresent = false |
.qualityTargets.fpsTarget = 30 |
.qualityTargets.mustMatch = ["landmark silhouette and relative height", "street-wall continuity", "period material families", "recognizable roof and entrance systems"] |
.componentTree = [
  component("district-root";"Landmark district root";"macro";"static district";null;"masonry";"district-envelope";"rgba(128,104,82,1)";"rgba(202,194,174,1)";"stone"),
  component("vanderbilt";"Cornelius Vanderbilt II mansion ensemble";"macro";"mansion ensemble";"district-root";"limestone";"vanderbilt-silhouette";"rgba(202,194,174,1)";"rgba(85,77,71,1)";"stone"),
  component("hotel-ensemble";"Fifth Avenue hotel ensemble";"macro";"hotel ensemble";"district-root";"brick";"hotel-height-hierarchy";"rgba(112,76,62,1)";"rgba(177,144,105,1)";"stone"),
  component("edge-ensemble";"Marble Row and edge mansion ensemble";"macro";"mansion row ensemble";"district-root";"limestone";"edge-streetwall";"rgba(214,207,190,1)";"rgba(126,92,71,1)";"stone"),
  component("vanderbilt-body";"Vanderbilt asymmetrical chateau body";"meso";"mansion mass";"vanderbilt";"limestone";"vanderbilt-massing";"rgba(202,194,174,1)";"rgba(150,142,128,1)";"stone"),
  component("new-netherland";"New Netherland tower";"meso";"hotel tower";"hotel-ensemble";"brick";"hotel-arch-bases";"rgba(104,69,58,1)";"rgba(154,105,78,1)";"stone"),
  component("savoy";"Hotel Savoy mass";"meso";"hotel mass";"hotel-ensemble";"brick";"cornice-bands";"rgba(139,93,70,1)";"rgba(194,151,106,1)";"stone"),
  component("bolkenhayn";"Bolkenhayn apartment mass";"meso";"apartment mass";"hotel-ensemble";"brick";"bolkenhayn-height";"rgba(132,84,67,1)";"rgba(188,144,103,1)";"stone"),
  component("marble-row";"Surviving Marble Row houses";"meso";"attached row houses";"edge-ensemble";"limestone";"rowhouse-party-rhythm";"rgba(222,216,201,1)";"rgba(177,169,153,1)";"stone"),
  component("huntington";"Collis P. Huntington mansion";"meso";"corner mansion";"edge-ensemble";"brick";"huntington-corner";"rgba(131,84,66,1)";"rgba(204,193,172,1)";"stone"),
  component("gerry";"Elbridge T. Gerry mansion";"meso";"corner mansion";"edge-ensemble";"limestone";"gerry-gable";"rgba(197,188,169,1)";"rgba(108,82,70,1)";"stone"),
  component("roof-systems";"Slate mansards, gables, turrets, and chimneys";"meso";"roof systems";"district-root";"slate";"mansion-rooflines";"rgba(50,55,56,1)";"rgba(67,77,72,1)";"stone"),
  component("window-bays";"Instanced sash and window bay system";"micro";"facade bay system";"district-root";"glass";"window-grid";"rgba(42,54,60,1)";"rgba(102,113,111,1)";"glass"),
  component("cornice-system";"Instanced belt course and cornice system";"micro";"cornice system";"district-root";"limestone";"cornice-bands";"rgba(216,208,190,1)";"rgba(153,143,126,1)";"stone"),
  component("dormer-system";"Instanced dormer and gable system";"micro";"dormer system";"roof-systems";"slate";"dormer-rhythm";"rgba(54,59,60,1)";"rgba(183,176,160,1)";"stone"),
  component("entrance-systems";"Arched portals, stoops, and canopies";"micro";"entrance systems";"district-root";"limestone";"entrance-portals";"rgba(208,199,180,1)";"rgba(66,55,46,1)";"stone"),
  component("ironwork-system";"Areaways, gates, and roof rails";"micro";"ironwork system";"district-root";"iron";"iron-areaways";"rgba(37,41,40,1)";"rgba(78,83,77,1)";"metal")
] |
.materials = [
  material("masonry";"Shared muted masonry";"#806852";"#9a8268";0.88;0;"base-weathering"),
  material("limestone";"Pale limestone and marble";"#d4cdbb";"#b9b09d";0.9;0;"sill-weathering"),
  material("brick";"Warm Roman brick";"#7f5142";"#9a6952";0.91;0;"soot-streaks"),
  material("slate";"Dark slate and aged roof metal";"#343b3c";"#465049";0.73;0.08;"roof-patina"),
  material("glass";"Opaque period-window depth";"#35444a";"#66716f";0.38;0;"curtain-variation"),
  material("iron";"Painted architectural iron";"#292d2c";"#4a4f4a";0.5;0.72;"paint-wear")
] |
.repetitionSystems = [
  { id:"facade-window-grid", componentRef:"window-bays", distribution:"Per-landmark bay grids with shared box geometry", geometry:"thin recessed panes and sash bars", instances:180, buildsGeometry:true, realization:"instanced-geometry" },
  { id:"cornice-and-course-bands", componentRef:"cornice-system", distribution:"Floor lines and crowns", geometry:"shared thin box courses", instances:64, buildsGeometry:true, realization:"instanced-geometry" },
  { id:"dormer-and-chimney-rhythm", componentRef:"dormer-system", distribution:"Roof-facing dormer rows and sparse chimneys", geometry:"shared low-segment boxes and pyramids", instances:42, buildsGeometry:true, realization:"instanced-geometry" }
] |
.performanceBudget = { qualityPriority:"performance-balanced", targetTriangles:55000, maxDrawCalls:24, textureSize:1024, fpsTarget:30, optimizationPolicy:"Share shell materials, instance repeated details, disable decorative shadows, and keep one coarse collider per parcel." } |
.lightingFromPhoto = [
  "Use the game's sun as the key light; landmark materials do not add lights.",
  "Use the world sky/environment as fill and rim light with existing exposure and ACES tone mapping.",
  "Only macro roofs may cast; contact shadow/AO comes from the existing world renderer and decorative batches do not cast."
] |
.assumptions = ["Hidden elevations continue the visible facade grammar.","Exact lot dimensions are compressed to the existing street grid.","Period photographs establish identity but do not imply measured reconstruction."] |
.risks = ["Tall hotel mass can dominate the compressed skyline.","Excess window detail can exceed draw-call budget if not instanced.","Roof shadows can hurt frame rate if enabled on every batch."]
