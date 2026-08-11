/** Shared social and household tables for the clinic sample, not the city at large. */

export const CLINIC_CLASSES = [
  { id: 'elite', label: 'society and substantial wealth', weight: 12, payer: [['private account', 9], ['family account', 3]] },
  { id: 'affluent', label: 'affluent professional or mercantile household', weight: 34, payer: [['private account', 6], ['family account', 4], ['physician referral', 1]] },
  { id: 'comfortable', label: 'comfortable or striving household', weight: 36, payer: [['family account', 4], ['private account', 3], ['physician referral', 3], ['employer assistance', 1]] },
  { id: 'sponsored', label: 'limited means, seen by referral or patronage', weight: 18, payer: [['charitable referral', 5], ['employer assistance', 2], ['church patronage', 2], ['family sacrifice', 2]] },
];

export const OCCUPATIONS = [
  { id: 'student', label: 'student', weight: 10, classes: ['elite', 'affluent', 'comfortable'], minAge: 16, maxAge: 24 },
  { id: 'household', label: 'no separate paid occupation', weight: 30, classes: ['elite', 'affluent', 'comfortable'], minAge: 16, sexes: ['female'] },
  { id: 'society-hostess', label: 'society hostess', weight: 9, classes: ['elite'], minAge: 25, sexes: ['female'] },
  { id: 'philanthropic-organizer', label: 'charitable organizer', weight: 8, classes: ['elite', 'affluent'], minAge: 24 },
  { id: 'teacher', label: 'schoolteacher', weight: 12, classes: ['affluent', 'comfortable'], minAge: 19 },
  { id: 'governess', label: 'governess', weight: 9, classes: ['comfortable', 'sponsored'], minAge: 19, sexes: ['female'] },
  { id: 'stenographer', label: 'stenographer', weight: 10, classes: ['comfortable', 'sponsored'], minAge: 18, maxAge: 45 },
  { id: 'telephone-operator', label: 'telephone operator', weight: 6, classes: ['comfortable', 'sponsored'], minAge: 18, maxAge: 40 },
  { id: 'dressmaker', label: 'dressmaker', weight: 12, classes: ['comfortable', 'sponsored'], minAge: 18, sexes: ['female'] },
  { id: 'seamstress', label: 'seamstress', weight: 11, classes: ['sponsored'], minAge: 16, sexes: ['female'] },
  { id: 'domestic-servant', label: 'domestic servant', weight: 13, classes: ['sponsored'], minAge: 16 },
  { id: 'laundress', label: 'laundress', weight: 7, classes: ['sponsored'], minAge: 18, sexes: ['female'] },
  { id: 'nurse', label: 'trained nurse', weight: 7, classes: ['affluent', 'comfortable'], minAge: 22, sexes: ['female'] },
  { id: 'boardinghouse', label: 'boarding-house keeper', weight: 6, classes: ['comfortable', 'sponsored'], minAge: 30 },
  { id: 'shopkeeper', label: 'shopkeeper', weight: 8, classes: ['affluent', 'comfortable'], minAge: 24 },
  { id: 'writer-artist', label: 'writer or artist', weight: 5, classes: ['elite', 'affluent', 'comfortable'], minAge: 21 },
  { id: 'factory-worker', label: 'factory worker', weight: 7, classes: ['sponsored'], minAge: 16, maxAge: 55 },
  { id: 'attorney', label: 'attorney', weight: 8, classes: ['elite', 'affluent'], minAge: 25, sexes: ['male'] },
  { id: 'bookkeeper', label: 'bookkeeper', weight: 11, classes: ['affluent', 'comfortable'], minAge: 19, sexes: ['male'] },
  { id: 'clerk', label: 'commercial clerk', weight: 14, classes: ['affluent', 'comfortable'], minAge: 18, sexes: ['male'] },
  { id: 'physician', label: 'physician', weight: 6, classes: ['elite', 'affluent'], minAge: 27, sexes: ['male'] },
  { id: 'printer', label: 'printer', weight: 9, classes: ['comfortable', 'sponsored'], minAge: 18, sexes: ['male'] },
  { id: 'railroad-worker', label: 'railroad employee', weight: 9, classes: ['comfortable', 'sponsored'], minAge: 18, sexes: ['male'] },
  { id: 'skilled-tradesman', label: 'skilled tradesman', weight: 13, classes: ['comfortable', 'sponsored'], minAge: 18, sexes: ['male'] },
  { id: 'laborer', label: 'laborer', weight: 13, classes: ['sponsored'], minAge: 16, maxAge: 65, sexes: ['male'] },
  { id: 'porter', label: 'porter', weight: 8, classes: ['comfortable', 'sponsored'], minAge: 18, sexes: ['male'] },
];

export const SPOUSE_OCCUPATIONS = {
  elite: ['banker', 'industrialist', 'attorney', 'senior physician', 'railroad director', 'real-estate proprietor'],
  affluent: ['merchant', 'physician', 'attorney', 'broker', 'manufacturer', 'newspaper editor', 'architect'],
  comfortable: ['bookkeeper', 'shopkeeper', 'clerk', 'teacher', 'salesman', 'printer', 'skilled tradesman'],
  sponsored: ['laborer', 'porter', 'carter', 'factory hand', 'dock worker', 'building custodian'],
};

export const REFERRAL_SOURCES = {
  'private account': ['the family physician', 'a society acquaintance', 'a previous private patient'],
  'family account': ['her husband', 'her mother', 'an elder sister', 'a prosperous cousin'],
  'physician referral': ['a neighborhood physician', 'a hospital physician', 'an obstetrician'],
  'employer assistance': ['her employer', 'the household employing her', 'a workplace supervisor'],
  'charitable referral': ['a settlement worker', 'a dispensary physician', 'a visiting nurse'],
  'church patronage': ['her pastor', 'a parish visitor', 'a women’s relief society'],
  'family sacrifice': ['her extended family', 'a married sibling', 'her adult children'],
};

export function maritalWeightsForAge(age) {
  if (age < 21) return [['single', 9], ['married', 1]];
  if (age < 30) return [['single', 4], ['married', 8], ['widowed', 1], ['separated', 0.4]];
  if (age < 45) return [['single', 2], ['married', 9], ['widowed', 2], ['separated', 0.5]];
  if (age < 60) return [['single', 2], ['married', 7], ['widowed', 5], ['separated', 0.5]];
  return [['single', 2], ['married', 4], ['widowed', 8], ['separated', 0.3]];
}
