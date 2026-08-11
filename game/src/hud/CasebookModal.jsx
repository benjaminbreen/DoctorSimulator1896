// The casebook: the practice's patient records. Left page lists active
// cases; right page is the selected patient's record sheet — particulars,
// complaint and treatment sections, and the visit history table.
//
// Only UI — patients come from patientRecords' placeholder fixtures, the
// portraits are the cameo silhouettes until painted portraits exist, and
// the verbs raise notices until the record system arrives. The journal
// store (casebookState) stays for the coming note-taking flow behind
// Add Note.

import { useEffect, useState } from 'react';
import { demoPatients } from './patientRecords.js';
import { notice } from '../world/notices.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import {
  Cameo, EyebrowArrow, EnvelopeIcon, BottleIcon, CoinIcon,
  BookIcon, NotebookIcon, ReturnIcon,
} from './chrome.jsx';

const SECTIONS = [
  { key: 'complaint', label: 'Present Complaint' },
  { key: 'symptoms', label: 'Symptoms & Observations' },
  { key: 'treatment', label: 'Treatment Prescribed' },
  { key: 'progress', label: 'Progress Notes' },
];

const MATERIALS = [
  { id: 'letters', label: 'Letters', Icon: EnvelopeIcon },
  { id: 'prescriptions', label: 'Prescriptions', Icon: BottleIcon },
  { id: 'invoices', label: 'Invoices', Icon: CoinIcon },
];

function materialsPlaceholder() {
  notice('The papers associated with this case will collect here.', { key: 'materials' });
}

function fullRecordPlaceholder() {
  notice('The full record will open here when the record system exists.', { key: 'record' });
}

function addNotePlaceholder() {
  notice('The note page will open here; your casebook draft is kept.', { key: 'notes' });
}

function FieldRow({ label, value }) {
  return (
    <div className="ghud-pt-field">
      <span className="ghud-pt-field-label">{label}:</span>
      <span className="ghud-pt-field-value">{value}</span>
    </div>
  );
}

export default function CasebookModal({ open, onClose }) {
  const [selectedId, setSelectedId] = useState(demoPatients[0]?.id);
  const containerRef = useDismissableOverlay(open, onClose);

  // Arrows move through the case list; the hook owns Escape and Tab.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSelectedId((current) => {
        const index = demoPatients.findIndex((entry) => entry.id === current);
        const next = Math.min(demoPatients.length - 1, Math.max(0, index + step));
        return demoPatients[next].id;
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open) return null;

  const patient = demoPatients.find((entry) => entry.id === selectedId) ?? demoPatients[0];

  return (
    <div className="ghud-scrim" onPointerDown={onClose}>
      <section
        ref={containerRef}
        className="ghud-letters"
        role="dialog"
        aria-modal="true"
        aria-label="Casebook"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="ghud-letters-head">
          <BookIcon size={24} />
          <h2 className="ghud-letters-title">Casebook</h2>
          <button type="button" className="ghud-letters-close" onClick={onClose} aria-label="Close casebook">
            ×
          </button>
        </header>

        <div className="ghud-letters-body">
          <div className="ghud-letters-page">
            <div className="ghud-eyebrow">
              <EyebrowArrow />
              <span>Patients</span>
              <EyebrowArrow flip />
            </div>

            <ul className="ghud-letters-list">
              {demoPatients.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={[
                      'ghud-letter-item',
                      'ghud-pt-card',
                      entry.id === patient.id ? 'ghud-letter-item--open' : '',
                    ].join(' ')}
                    onClick={() => setSelectedId(entry.id)}
                    aria-current={entry.id === patient.id}
                  >
                    <span className="ghud-pt-card-portrait">
                      <Cameo variant={entry.silhouette} size={52} />
                    </span>
                    <span className="ghud-letter-item-text">
                      <span className="ghud-letter-sender">{entry.name}</span>
                      <span className="ghud-letter-meta">{`Age ${entry.age} • ${entry.sex}`}</span>
                      <span className="ghud-letter-meta">{entry.listDate}</span>
                      <span className="ghud-letter-subject">{entry.diagnosis}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="ghud-letters-foot">
              <span>{`${demoPatients.length} Active Cases`}</span>
            </div>
          </div>

          <div className="ghud-col-rule" aria-hidden="true" />

          <article className="ghud-letter-page">
            <div className="ghud-pt-sheet" key={patient.id}>
              {['tl', 'tr', 'bl', 'br'].map((pos) => (
                <img
                  key={pos}
                  className={`ghud-pt-corner ghud-pt-corner--${pos}`}
                  src="/ui/corner-line.png"
                  alt=""
                  draggable={false}
                />
              ))}
              <div className="ghud-pt-scroll">
              <header className="ghud-pt-head">
                <span className="ghud-pt-ring">
                  <Cameo variant={patient.silhouette} size={92} />
                  <img src="/ui/ring-portrait.png" alt="" draggable={false} />
                </span>
                <div className="ghud-pt-head-main">
                  <h3 className="ghud-pt-name">{patient.name}</h3>
                  <img className="ghud-pt-name-rule" src="/ui/rule-fine.png" alt="" draggable={false} />
                  <div className="ghud-pt-fields">
                    <div className="ghud-pt-field-col">
                      <FieldRow label="Age" value={patient.age} />
                      <FieldRow label="Sex" value={patient.sex} />
                      <FieldRow label="Address" value={patient.address} />
                      <FieldRow label="Occupation" value={patient.occupation} />
                    </div>
                    <div className="ghud-pt-field-col">
                      <FieldRow label="Marital Status" value={patient.maritalStatus} />
                      <FieldRow label="First Visit" value={patient.firstVisit} />
                      <FieldRow label="Referred By" value={patient.referredBy} />
                    </div>
                  </div>
                </div>
              </header>

              <div className="ghud-pt-body">
                <div className="ghud-pt-sections">
                  {SECTIONS.map(({ key, label }) => (
                    <section key={key} className="ghud-pt-section">
                      <h4 className="ghud-pt-section-title">{label}</h4>
                      <p className="ghud-pt-section-text">{patient[key]}</p>
                    </section>
                  ))}
                  <section className="ghud-pt-section">
                    <h4 className="ghud-pt-section-title">Associated Materials</h4>
                    <div className="ghud-pt-chips">
                      {MATERIALS.map(({ id, label, Icon }) => (
                        <button key={id} type="button" className="ghud-pt-chip" onClick={materialsPlaceholder}>
                          <Icon />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>

                <div className="ghud-pt-visits">
                  <div className="ghud-eyebrow ghud-pt-visits-eyebrow">
                    <EyebrowArrow size={22} />
                    <span>Visit History</span>
                    <EyebrowArrow flip size={22} />
                  </div>
                  <div className="ghud-pt-table" role="table" aria-label="Visit history">
                    <div className="ghud-pt-tr ghud-pt-tr--head" role="row">
                      <span aria-hidden="true" />
                      <span role="columnheader">Date</span>
                      <span role="columnheader">Visit</span>
                      <span role="columnheader">Notes</span>
                    </div>
                    {patient.visits.map((visit) => (
                      <div key={`${visit.date}-${visit.kind}`} className="ghud-pt-tr" role="row">
                        <i className="ghud-pt-dot" aria-hidden="true" />
                        <span role="cell" className="ghud-pt-td-date">{visit.date}</span>
                        <span role="cell" className="ghud-pt-td-kind">{visit.kind}</span>
                        <span role="cell" className="ghud-pt-td-notes">{visit.notes}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </div>

            <footer className="ghud-letter-verbs">
              <button type="button" className="ghud-letter-verb ghud-letter-verb--learn" onClick={fullRecordPlaceholder}>
                <BookIcon />
                <span>Open Full Record</span>
              </button>
              <button type="button" className="ghud-letter-verb" onClick={addNotePlaceholder}>
                <NotebookIcon size={16} />
                <span>Add Note</span>
              </button>
              <button type="button" className="ghud-letter-verb" onClick={onClose}>
                <ReturnIcon />
                <span>Back</span>
              </button>
            </footer>
          </article>
        </div>
      </section>
    </div>
  );
}
