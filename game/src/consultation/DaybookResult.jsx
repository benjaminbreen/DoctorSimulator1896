// Variant B of the outcome screen: the visit as an entry in the doctor's day
// book, with one decision — how to settle the fee. The month page shows what
// that decision cost or earned once the patient's real course is known.

import { useEffect, useRef, useState } from 'react';
import { getPurseCents, subscribePurse } from '../world/purse.js';
import { patientMeans, settlementOptions } from './settlement.js';
import './daybook.css';

function money(cents) {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

function ledgerFigure(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function pronouns(patient) {
  const sex = patient?.profile?.identity?.sex;
  if (sex === 'female') return { He: 'She', his: 'her' };
  if (sex === 'male') return { He: 'He', his: 'his' };
  return { He: 'They', his: 'their' };
}

// DRAFT CONTENT: how each kind of patient hands over a fee.
function offerLine(patient, offered, full) {
  const { He, his } = pronouns(patient);
  if (offered < full) return `${He} puts down ${money(offered)}, less than your fee, and does not explain.`;
  const means = patientMeans(patient);
  if (means === 'modest') return `${He} counts ${money(offered)} out of ${his} purse in small coin.`;
  if (means === 'wealthy') return `${He} lays ${money(offered)} on the desk without looking at it.`;
  return `${He} sets ${money(offered)} on the desk.`;
}

function settledLine(patient, settlement) {
  const { He } = pronouns(patient);
  if (settlement.id === 'account') return 'Entered on account. The bill goes out with next month’s post.';
  if (settlement.id === 'waive') {
    return patientMeans(patient) === 'wealthy'
      ? `${He} pockets the money again, unsure whether to be grateful or offended.`
      : `${He} thanks you twice at the door.`;
  }
  return 'Entered as paid.';
}

function ledgerEntry(settlement, offered) {
  if (!settlement) return { text: '', className: '' };
  if (settlement.id === 'account') return { text: `acct. ${ledgerFigure(settlement.billed)}`, className: 'is-account' };
  if (settlement.id === 'waive') return { text: 'gratis', className: 'is-waived' };
  return { text: ledgerFigure(offered), className: 'is-paid' };
}

function usePurseCents() {
  const [cents, setCents] = useState(getPurseCents);
  useEffect(() => subscribePurse(() => setCents(getPurseCents())), []);
  return cents;
}

export default function DaybookResult({
  result,
  patient,
  patientLabel,
  offerPieces,
  settlement,
  collected,
  onSettle,
  onOpenMonth,
  renderMonth,
  onNextPatient,
  onWaitingRoom,
  onStreet,
}) {
  const immediate = result?.immediate || {};
  const identity = patient?.profile?.identity || {};
  const social = patient?.profile?.social || {};
  const offered = Number(immediate.paymentCents) || 0;
  const full = patient?.outcomeModel?.fee?.full ?? offered;
  const options = settlementOptions(patient, result);
  const purse = usePurseCents();
  const [page, setPage] = useState('today');
  const [seal, setSeal] = useState('sealed');
  const sealTimer = useRef(null);
  const firstOption = useRef(null);
  const nextButton = useRef(null);

  useEffect(() => () => clearTimeout(sealTimer.current), []);
  useEffect(() => {
    (settlement ? nextButton : firstOption).current?.focus({ preventScroll: true });
  }, [settlement]);

  const openMonth = () => {
    if (seal === 'open') return setPage(page === 'month' ? 'today' : 'month');
    if (seal === 'breaking') return undefined;
    setSeal('breaking');
    sealTimer.current = setTimeout(() => {
      setSeal('open');
      setPage('month');
      onOpenMonth();
    }, 380);
    return undefined;
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Enter' && event.target?.tagName === 'BUTTON') return;
      // Before the fee is settled the number keys choose how; after, they leave.
      const action = settlement || page === 'month'
        ? { 1: onNextPatient, 2: onWaitingRoom, 3: onStreet, Enter: onNextPatient }[event.key]
        : { 1: () => onSettle(options[0]), 2: () => onSettle(options[1]), 3: () => onSettle(options[2]), Enter: onNextPatient }[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exitKeys = Boolean(settlement) || page === 'month';
  const entry = ledgerEntry(settlement, offered);
  const rx = result.treatmentLabels?.length ? result.treatmentLabels.join('; ') : 'Nothing yet. To return.';
  const who = [identity.age, social.occupation].filter(Boolean).join(', ');

  return (
    <div className="gcon-result-backdrop" role="presentation">
      <section className="gcon-result-modal gcon-paper gdb" role="dialog" aria-modal="true" aria-labelledby="gdb-title">
        <header className="gdb-head">
          <span className="gdb-book">Day Book</span>
          <span className="gdb-folio">{page === 'today' ? 'Office patients' : 'One month later'}</span>
        </header>

        <div className="gdb-body">
          {page === 'today' ? (
            <div className="gcon-reveal" key="today">
              <div className="gdb-entry" style={{ '--step': 0 }}>
                <div className="gdb-lines">
                  <h2 id="gdb-title" className="gdb-ink gdb-name">{identity.fullName || patientLabel}</h2>
                  {who && <p className="gdb-ink gdb-who">{who}{social.residence ? ` · ${social.residence}` : ''}</p>}
                  <p className="gdb-ink gdb-rx"><b aria-hidden="true">℞</b>{rx}</p>
                </div>
                <div className="gdb-amount">
                  <span className="gdb-col-head">Cr.</span>
                  <span className={`gdb-figure ${entry.className}`} key={entry.text}>{entry.text}</span>
                </div>
              </div>

              <blockquote className="gdb-words" style={{ '--step': 1 }}>{immediate.departureLine}</blockquote>
              <p className="gdb-narrative" style={{ '--step': 2 }}>{immediate.narrative}</p>

              <section className={`gdb-settle ${settlement ? 'is-settled' : ''}`} style={{ '--step': 3 }} aria-live="polite">
                <div className="gdb-desk">
                  <div className={`gdb-coins ${settlement ? `is-${settlement.id}` : ''}`} aria-hidden="true">
                    {offerPieces.map((piece, index) => (
                      <img key={`${piece.id}-${index}`} src={piece.image} alt="" className={`is-${piece.kind}`} style={{ '--i': index }} />
                    ))}
                  </div>
                  <p>{settlement ? settledLine(patient, settlement) : offerLine(patient, offered, full)}</p>
                </div>
                {!settlement ? (
                  <div className="gdb-options" role="group" aria-label="Settle the fee">
                    {options.map((option, index) => (
                      <button key={option.id} type="button" ref={index === 0 ? firstOption : undefined} onClick={() => onSettle(option)}>
                        <kbd>{index + 1}</kbd>
                        <strong>{option.label}</strong>
                        <span>{option.hint}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="gdb-purse">Purse <strong>{money(purse)}</strong></p>
                )}
              </section>
            </div>
          ) : renderMonth(
            settlement?.id === 'account' && (
              <p className="gdb-account" style={{ '--step': 1 }}>
                <span>Account of {patientLabel} · billed {money(settlement.billed)}</span>
                {collected ? collected.line : 'The bill is in the post.'}
                {collected && <strong>{collected.cents > 0 ? `+${money(collected.cents)}` : 'Nothing received'}</strong>}
              </p>
            ),
          )}
        </div>

        <footer className="gdb-foot">
          <button
            type="button"
            className={`gdb-letter ${seal === 'open' ? '' : `is-sealed is-${seal}`}`}
            title={seal === 'open' ? undefined : 'Sealed. Opening it reads a month ahead.'}
            onClick={openMonth}
          >
            {seal !== 'open' && <i className="gcon-seal" aria-hidden="true" />}
            {page === 'month' ? 'Back to today' : 'One month later'}
          </button>
          <nav className="gdb-exits" aria-label="Where will you go now?">
            <button type="button" ref={nextButton} className="is-primary" onClick={onNextPatient}>
              <kbd>⏎</kbd>Next patient
            </button>
            <button type="button" onClick={onWaitingRoom}>{exitKeys && <kbd>2</kbd>}Waiting room</button>
            <button type="button" onClick={onStreet}>{exitKeys && <kbd>3</kbd>}Street</button>
          </nav>
        </footer>
      </section>
    </div>
  );
}
