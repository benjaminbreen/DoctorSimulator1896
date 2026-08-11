export function patientProfileRows(patient) {
  const identity = patient.identity;
  const household = patient.social.household;
  const work = patient.social.occupation || patient.social.householdPosition;
  const background = identity.migration
    ? `${identity.origin.label}; arrived from ${identity.migration.birthplace} in ${identity.migration.arrivalYear}, aged ${identity.migration.arrivalAge}`
    : `${identity.origin.label}; ${identity.origin.generationLabel}`;
  return [
    { label: 'Age', value: String(identity.age) },
    { label: 'Marital status', value: household.maritalStatus },
    { label: 'Occupation or household', value: work },
    { label: 'Residence', value: patient.social.residence },
    { label: 'Background', value: background },
    { label: 'Referral', value: patient.social.referralSource },
  ];
}

export function patientProfileSummary(patient) {
  const rows = patientProfileRows(patient);
  const value = (label) => rows.find((row) => row.label === label)?.value;
  return `${patient.identity.fullName}, aged ${value('Age')}; ${value('Occupation or household')}; ${value('Residence')}. ${value('Background')}.`;
}

