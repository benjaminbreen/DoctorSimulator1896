/**
 * Shared period-facing clinical presentations.
 *
 * `periodCategory` is language a physician might place on an 1896 case sheet.
 * `theme` is a neutral internal description for game logic and must not be
 * presented as a retrospective diagnosis of a fictional patient.
 */

export const PRESENTATIONS = [
  {
    id: 'neurasthenic-exhaustion', weight: 18, ageRange: [20, 62],
    periodCategory: 'neurasthenic exhaustion', theme: 'fatigue, overload, and poor sleep',
    complaints: ['an exhaustion that sleep does not relieve', 'weakness, headaches, and an inability to concentrate', 'a collapse of energy after prolonged strain'],
    symptoms: ['fatigue', 'headache', 'poor concentration', 'unrefreshing sleep'], affects: [['weary', 5], ['guarded', 2], ['anxious', 2]],
    performance: { posture: -0.25, breathing: 0.82, breathingRate: 11, fidget: 0.55, gazeDrift: 1.35, weightShift: 0.55, tremor: 0.15, handTension: 0.3, gestureSpeed: 0.8 },
  },
  {
    id: 'melancholic-withdrawal', weight: 14, ageRange: [18, 75],
    periodCategory: 'melancholia', theme: 'persistent low mood and withdrawal',
    complaints: ['a heaviness of spirit and loss of interest in ordinary life', 'weeks of silence, tears, and refusal of company', 'a conviction that she has failed those dependent upon her'],
    symptoms: ['low mood', 'withdrawal', 'guilt', 'poor appetite'], affects: [['sad', 5], ['guarded', 2], ['weary', 2]],
    performance: { posture: -0.42, breathing: 0.75, breathingRate: 10, fidget: 0.35, gazeDrift: 1.55, weightShift: 0.45, tremor: 0.08, handTension: 0.25, gestureSpeed: 0.72 },
  },
  {
    id: 'anxious-palpitations', weight: 15, ageRange: [16, 68],
    periodCategory: 'nervous palpitation', theme: 'panic and somatic anxiety',
    complaints: ['sudden attacks of breathlessness and pounding at the heart', 'a sense of impending calamity accompanied by trembling', 'spells of terror in crowded rooms and railway cars'],
    symptoms: ['palpitations', 'breathlessness', 'fear', 'trembling'], affects: [['anxious', 6], ['guarded', 2], ['concerned', 2]],
    performance: { posture: 0.08, breathing: 1.55, breathingRate: 19, fidget: 1.65, gazeDrift: 1.45, weightShift: 1.45, tremor: 0.65, handTension: 0.78, gestureSpeed: 1.25 },
  },
  {
    id: 'persistent-insomnia', weight: 12, ageRange: [18, 75],
    periodCategory: 'nervous insomnia', theme: 'chronic sleeplessness and rumination',
    complaints: ['an inability to sleep before dawn despite profound weariness', 'waking at every small sound and lying awake in dread', 'racing thoughts that continue through the night'],
    symptoms: ['insomnia', 'irritability', 'fatigue', 'rumination'], affects: [['weary', 5], ['irritable', 2], ['guarded', 2]],
    performance: { posture: -0.18, breathing: 0.9, breathingRate: 12, fidget: 1.1, gazeDrift: 1.65, weightShift: 0.8, tremor: 0.28, handTension: 0.52, gestureSpeed: 0.88 },
  },
  {
    id: 'bereavement-visions', weight: 8, ageRange: [24, 78],
    periodCategory: 'morbid grief with auditory impressions', theme: 'bereavement with sensory experiences',
    complaints: ['hearing the voice of a dead relation at dusk', 'seeing a lost loved one at the edge of the room', 'a grief that has taken on the clarity of waking visions'],
    symptoms: ['bereavement', 'auditory impressions', 'disturbed sleep', 'fear of madness'], affects: [['sad', 4], ['guarded', 3], ['concerned', 2]],
    flags: ['mourning'], performance: { posture: -0.12, breathing: 0.95, breathingRate: 12, fidget: 0.65, gazeDrift: 1.8, weightShift: 0.55, tremor: 0.2, handTension: 0.4, gestureSpeed: 0.82 },
  },
  {
    id: 'compulsive-fears', weight: 9, ageRange: [16, 62],
    periodCategory: 'fixed nervous apprehension', theme: 'intrusive thoughts and compulsive behavior',
    complaints: ['repeated checking of doors, lamps, and correspondence', 'an overpowering fear of contamination from ordinary objects', 'thoughts she regards as wicked and cannot dismiss'],
    symptoms: ['intrusive thoughts', 'checking', 'avoidance', 'shame'], affects: [['guarded', 5], ['anxious', 4]],
    performance: { posture: 0.12, breathing: 1.08, breathingRate: 15, fidget: 1.5, gazeDrift: 1.1, weightShift: 1.15, tremor: 0.22, handTension: 0.8, gestureSpeed: 1.12 },
  },
  {
    id: 'functional-tremor', weight: 8, ageRange: [16, 68],
    periodCategory: 'hysterical tremor', theme: 'functional neurological symptoms',
    complaints: ['a shaking of the hands that worsens under observation', 'periods when one arm becomes weak without injury', 'fits of trembling following emotional excitement'],
    symptoms: ['tremor', 'episodic weakness', 'distress'], affects: [['concerned', 4], ['guarded', 3], ['anxious', 2]],
    performance: { posture: -0.05, breathing: 1.25, breathingRate: 16, fidget: 1.25, gazeDrift: 1.15, weightShift: 0.9, tremor: 1.45, handTension: 0.68, gestureSpeed: 0.95 },
  },
  {
    id: 'traumatic-fright', weight: 8, ageRange: [18, 70],
    periodCategory: 'nervous shock', theme: 'post-traumatic distress',
    complaints: ['nightmares and startle since a frightening accident', 'a recurring memory that arrives with the sounds of the street', 'terror and bodily rigidity when reminded of a past assault'],
    symptoms: ['nightmares', 'startle', 'avoidance', 'intrusive memory'], affects: [['guarded', 5], ['anxious', 3], ['determined', 1]],
    performance: { posture: 0.16, breathing: 1.25, breathingRate: 16, fidget: 0.85, gazeDrift: 1.6, weightShift: 1.05, tremor: 0.42, handTension: 0.9, gestureSpeed: 1.05 },
  },
  {
    id: 'morphine-habit', weight: 5, ageRange: [24, 70],
    periodCategory: 'morphine habit', theme: 'medication dependence',
    complaints: ['an increasing dependence on morphine first prescribed for pain', 'sleeplessness and agitation when her medicine is withheld', 'secret use of an anodyne she can no longer do without'],
    symptoms: ['dependence', 'sleep disturbance', 'agitation', 'concealment'], affects: [['guarded', 5], ['weary', 3], ['irritable', 1]],
    performance: { posture: -0.2, breathing: 0.85, breathingRate: 11, fidget: 1.25, gazeDrift: 1.45, weightShift: 0.7, tremor: 0.85, handTension: 0.58, gestureSpeed: 0.84 },
  },
  {
    id: 'postpartum-disturbance', weight: 5, ageRange: [19, 43], requires: ({ maritalStatus, sex }) => sex === 'female' && (maritalStatus === 'married' || maritalStatus === 'widowed'),
    periodCategory: 'puerperal mental disturbance', theme: 'postpartum mood or psychotic symptoms',
    complaints: ['terror, sleeplessness, and confusion since childbirth', 'a conviction that she is unfit to care for her infant', 'alternations of agitation and profound withdrawal following confinement'],
    symptoms: ['sleep loss', 'fear', 'confusion', 'withdrawal'], affects: [['weary', 3], ['anxious', 3], ['sad', 2], ['guarded', 1]],
    performance: { posture: -0.3, breathing: 1.15, breathingRate: 15, fidget: 1.15, gazeDrift: 1.55, weightShift: 0.75, tremor: 0.38, handTension: 0.62, gestureSpeed: 0.82 },
  },
];

export const DURATION_BANDS = [
  { label: 'several weeks', weight: 3 }, { label: 'two to six months', weight: 5 },
  { label: 'about a year', weight: 3 }, { label: 'several years, intermittently', weight: 2 },
];
