import { useMemo, useState } from 'react';
import { TREATMENT_CATEGORIES, resolveTreatment, treatmentsInCategory } from './treatments.js';

// What a patient of this standing can meet without the fee becoming the problem.
const AFFORDABLE_CENTS = 400;

function money(cents) {
  return cents ? `$${(cents / 100).toFixed(2)}` : 'free';
}

function Tile({ icon, name, note, badge, dear, chosen, style, onClick, onPreview }) {
  return (
    <button
      type="button"
      className={`gcon-shelf-tile${chosen ? ' is-chosen' : ''}`}
      onClick={onClick}
      onMouseEnter={onPreview}
      onFocus={onPreview}
    >
      {badge && <span className={`gcon-shelf-badge${dear ? ' is-dear' : ''}`}>{badge}</span>}
      {chosen && <span className="gcon-shelf-tick" aria-hidden="true">✓</span>}
      <span className="gcon-shelf-art"><img src={icon} alt="" style={style} /></span>
      <span className="gcon-shelf-name">{name}</span>
      {note && <span className="gcon-shelf-note">{note}</span>}
    </button>
  );
}

export default function TreatmentShelf({ patient, state, runtime }) {
  const [categoryId, setCategoryId] = useState(null);
  const [preview, setPreview] = useState(null);
  const chosen = state.treatmentIds || [];
  const category = TREATMENT_CATEGORIES.find((item) => item.id === categoryId) || null;

  const items = useMemo(() => (
    category && !category.custom
      ? treatmentsInCategory(category.id).map((base) => resolveTreatment(patient, base.id))
      : []
  ), [category, patient]);

  const chosenTreatments = useMemo(
    () => chosen.map((id) => resolveTreatment(patient, id)).filter(Boolean),
    [chosen, patient],
  );
  const total = chosenTreatments.reduce((sum, item) => sum + (item.feeCents || 0), 0);
  const shown = preview && items.find((item) => item.id === preview.id) ? preview : null;

  return (
    <div className="gcon-shelf">
      {!category && (
        <>
          <p className="gcon-eyebrow">Course of Treatment</p>
          <div className="gcon-shelf-grid">
            {TREATMENT_CATEGORIES.map((item) => (
              <Tile
                key={item.id}
                icon={item.icon}
                name={item.label}
                note={item.custom ? 'Write it' : `${treatmentsInCategory(item.id).length} available`}
                onClick={() => { setCategoryId(item.id); setPreview(null); }}
              />
            ))}
          </div>
        </>
      )}

      {category && (
        <>
          <div className="gcon-shelf-head">
            <button type="button" className="gcon-shelf-back" onClick={() => setCategoryId(null)}>
              ← All treatments
            </button>
            <h3>{category.label}</h3>
          </div>
          {category.custom ? (
            <div className="gcon-shelf-custom">
              <textarea
                rows={3}
                placeholder="A substance, a regimen, a combination of your own devising…"
                disabled
              />
              <p>Reading a written prescription is not yet wired up. Choose from the cabinet for now.</p>
            </div>
          ) : (
            <div className="gcon-shelf-grid">
              {items.map((item) => (
                <Tile
                  key={item.id}
                  icon={item.icon || category.icon}
                  name={item.label}
                  badge={money(item.feeCents)}
                  dear={item.feeCents > AFFORDABLE_CENTS}
                  chosen={chosen.includes(item.id)}
                  onClick={() => runtime.dispatch({ type: 'select-treatment', id: item.id })}
                  onPreview={() => setPreview(item)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div className="gcon-shelf-readout">
        {shown
          ? <span><b>{shown.label}.</b> {shown.detail}</span>
          : <span className="is-faint">{category ? category.lede : 'Choose where to begin.'}</span>}
        {shown && <span className="gcon-shelf-fee">{money(shown.feeCents)}</span>}
      </div>

      {chosenTreatments.length > 0 && (
        <div className="gcon-shelf-plan">
          <span className="gcon-shelf-plan-label">Prescribed</span>
          {chosenTreatments.map((item) => (
            <span key={item.id} className="gcon-shelf-pill">
              {item.label}
              <button
                type="button"
                aria-label={`Remove ${item.label}`}
                onClick={() => runtime.dispatch({ type: 'select-treatment', id: item.id })}
              >×</button>
            </span>
          ))}
          <span className="gcon-shelf-total">{money(total)}</span>
        </div>
      )}
    </div>
  );
}
