const DIAGNOSIS_STAGES = new Set(['decision', 'case-note', 'result']);

function factMapFor(patient) {
  return new Map(patient.facts.map((fact) => [fact.id, fact]));
}

// The notebook is a projection of consultation history. The opening complaint
// is not copied in automatically: the page grows only when the player acts.
export function buildCaseNotebook(patient, state) {
  const facts = factMapFor(patient);
  const observations = [];
  const clues = [];

  state.history.forEach((event, eventIndex) => {
    if (event.kind === 'interpretation') {
      observations.push({
        id: `interpretation-${event.id}-${eventIndex}`,
        kind: 'Private impression',
        text: event.text,
      });
    }

    if (event.kind === 'examination') {
      observations.push({
        id: `examination-${event.id}-${eventIndex}`,
        kind: event.label,
        text: event.reply,
      });
    }

    if (event.kind === 'speech') {
      (event.disclosedNow || []).forEach((factId) => {
        const fact = facts.get(factId);
        if (!fact) return;
        clues.push({
          id: `clue-${fact.id}-${eventIndex}`,
          label: fact.label,
          text: fact.value,
        });
      });
    }
  });

  const diagnosesAvailable = DIAGNOSIS_STAGES.has(state.stage);
  return {
    patient: {
      name: patient.label,
      age: patient.profile.identity.age,
      residence: patient.profile.social.residence,
    },
    observations,
    clues,
    diagnosesAvailable,
    diagnoses: diagnosesAvailable
      ? patient.diagnoses.map((diagnosis) => ({
        id: diagnosis.id,
        label: diagnosis.label,
        selected: diagnosis.id === state.diagnosisId,
      }))
      : [],
  };
}
