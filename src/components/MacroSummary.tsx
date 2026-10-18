import type { Macros } from '../lib/ingredients'

const fmt = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1).replace('.', ','))

export default function MacroSummary({ macros, label }: { macros: Macros; label: string }) {
  const kcalFromMacros = macros.protein * 4 + macros.fat * 9 + macros.carbs * 4 || 1
  const parts = [
    { key: 'protein', name: 'Białko', value: macros.protein, kcal: macros.protein * 4 },
    { key: 'fat', name: 'Tłuszcz', value: macros.fat, kcal: macros.fat * 9 },
    { key: 'carbs', name: 'Węglowodany', value: macros.carbs, kcal: macros.carbs * 4 },
  ]
  return (
    <div className="macros">
      <div className="macros-kcal">
        <span className="macros-kcal-num">{Math.round(macros.kcal)}</span>
        <span className="macros-kcal-unit">kcal</span>
        <span className="macros-label">{label}</span>
      </div>
      <div className="macros-bar" aria-hidden="true">
        {parts.map((p) => (
          <span key={p.key} className={`seg seg-${p.key}`} style={{ flexGrow: p.kcal / kcalFromMacros }} />
        ))}
      </div>
      <dl className="macros-grid">
        {parts.map((p) => (
          <div key={p.key}>
            <dt>
              <i className={`dot seg-${p.key}`} />
              {p.name}
            </dt>
            <dd>{fmt(p.value)} g</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
