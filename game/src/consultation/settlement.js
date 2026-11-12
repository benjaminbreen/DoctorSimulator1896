// How the doctor settles a fee, for the daybook outcome screen (variant B).
// Cash is safe. An account bets the full fee on the treatment working, since
// the patient pays only if the month goes well. Waiving buys goodwill now.
// DRAFT CONTENT: billing practice and the standing effects need Ben's
// verification before they are settled (docs/decisions.md).

export function patientMeans(patient) {
  const full = patient?.outcomeModel?.fee?.full ?? 200;
  if (full >= 500) return 'wealthy';
  if (full <= 100) return 'modest';
  return 'comfortable';
}

export function settlementOptions(patient, result) {
  const offered = Number(result?.immediate?.paymentCents) || 0;
  const full = patient?.outcomeModel?.fee?.full ?? offered;
  const means = patientMeans(patient);
  return [
    {
      id: 'cash',
      label: 'Take it',
      cents: offered,
      standing: 0,
      hint: 'Paid now, whatever follows.',
    },
    {
      id: 'account',
      label: 'Put it on account',
      cents: 0,
      billed: full,
      standing: 0,
      hint: 'A bill for the full fee goes out next month. Patients pay for advice that worked.',
    },
    {
      id: 'waive',
      label: 'Waive the fee',
      cents: 0,
      standing: { modest: 3, comfortable: 1, wealthy: 0 }[means],
      hint: means === 'wealthy' ? 'A rich patient may not thank you for charity.' : 'Word gets about.',
    },
  ];
}

// The account comes due a month on. Payment follows how the patient
// actually fared, not how they felt leaving the room.
export function collectAccount(patient, result) {
  const full = patient?.outcomeModel?.fee?.full ?? (Number(result?.immediate?.paymentCents) || 0);
  const modest = patientMeans(patient) === 'modest';
  const left = result?.immediate?.band;
  switch (result?.oneMonth?.band) {
    case 'improved':
      return modest
        ? { cents: Math.round(full / 2), standing: 2, line: 'Paid in part, a little at a time. The family speaks well of you.' }
        : { cents: full, standing: 1, line: 'Paid in full, with a note of thanks.' };
    case 'little-change':
      return left === 'low'
        ? { cents: 0, standing: 0, line: 'The bill goes unanswered.' }
        : { cents: modest ? Math.round(full / 2) : full, standing: 0, line: 'Paid late, and without comment.' };
    case 'worse':
      return { cents: 0, standing: -1, line: 'The bill comes back with a short note: the patient is worse, and will not pay.' };
    case 'harmed':
      return { cents: 0, standing: -3, line: 'The bill is refused, and the reason is repeated to others.' };
    default:
      return { cents: 0, standing: 0, line: 'The account is still open.' };
  }
}
