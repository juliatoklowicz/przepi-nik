import { useId, useRef } from 'react'
import { useDialog } from '../lib/useDialog'

interface Props {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Pytanie przed nieodwracalnym krokiem. Bezpieczna odpowiedź jest domyślna. */
export default function ConfirmDialog({ title, message, confirmLabel, cancelLabel = 'Anuluj', danger, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const msgId = useId()
  useDialog(ref, onCancel)

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        ref={ref}
        className="modal confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? msgId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        {message && <p id={msgId}>{message}</p>}
        <div className="confirm-actions">
          <button className="btn" onClick={onCancel} data-autofocus>
            {cancelLabel}
          </button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
