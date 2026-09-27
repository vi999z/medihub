import { createContext, useContext, useState, useCallback, useRef } from 'react';
import AnimatedModal from '../components/AnimatedModal';

const DialogContext = createContext(null);

// In-app replacement for window.confirm()/window.alert() — native browser
// dialogs look out of place next to the rest of the flat design system and
// can't be styled, so destructive/important confirmations and one-off
// notices go through this instead. Both return a Promise so call sites read
// almost the same as the native versions (`if (!(await confirm(...))) return;`).
export function DialogProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  function close(result) {
    setState(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }

  const confirm = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        mode: 'confirm',
        title: opts.title || 'Are you sure?',
        message: opts.message,
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        danger: Boolean(opts.danger),
      });
    });
  }, []);

  const alert = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        mode: 'alert',
        title: opts.title || 'Notice',
        message: opts.message,
        confirmLabel: opts.confirmLabel || 'OK',
      });
    });
  }, []);

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      <AnimatedModal isOpen={Boolean(state)} onClose={() => close(false)} className="confirm-modal">
        {state && (
          <div className="confirm-modal__body">
            <h2>{state.title}</h2>
            {typeof state.message === 'string'
              ? state.message.split('\n').map((line, i) => <p key={i}>{line}</p>)
              : <p>{state.message}</p>}
            <div className="confirm-modal__actions">
              {state.mode === 'confirm' && (
                <button type="button" className="flat-action-btn" onClick={() => close(false)}>{state.cancelLabel}</button>
              )}
              <button
                type="button"
                className={state.mode === 'confirm' && state.danger ? 'flat-btn-danger' : 'flat-btn-primary'}
                onClick={() => close(true)}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </AnimatedModal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  return useContext(DialogContext);
}
