import { useState, useRef } from 'react';
import { KeyRound, Loader2, AlertCircle, WifiOff, Download } from 'lucide-react';
import { license } from '../utils/license';
import { useLicense } from '../hooks/useLicense';
import { useInstall } from '../hooks/useInstall';
import { install } from '../utils/install';
import logoUrl from '../assets/logo-playgoo.svg';
import { normaliseCode, formatCode, CODE_LENGTH } from '../utils/licenseCode';

// The one screen in this app written for an adult.
//
// Everywhere else the rule is pictures before words, because the child cannot
// read. This is the exception and it is deliberate: it is seen once, by the
// parent setting the tablet up, before the child is handed it - and again a year
// later, when the licence runs out. So it may use sentences - and it should,
// because a code that will not activate is a support email, and the difference
// between "błędny kod" and a sentence saying which kind of wrong it is decides
// whether that email gets sent.

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || '';

// One sentence per failure, and each one says what to do next. The keys are the
// reason strings the store and the Worker agree on; anything unrecognised falls
// back to the last line rather than showing a child's tablet a raw error code.
const MESSAGES = {
  'invalid-code':
    'Ten kod wygląda na niepełny lub ma literówkę. Sprawdź, czy wszystkie znaki się zgadzają.',
  'unknown-code':
    'Nie rozpoznajemy tego kodu. Sprawdź go jeszcze raz - łatwo pomylić znaki podobne do siebie.',
  'device-limit':
    'Ten kod jest już użyty na dwóch urządzeniach. Jeśli zmieniasz tablet na nowy, napisz do nas - odblokujemy kod.',
  'code-disabled': 'Ten kod został wyłączony. Napisz do nas, sprawdzimy co się stało.',
  'code-expired':
    'Ten kod działał przez rok od pierwszej aktywacji i ten czas już minął. Aby dalej korzystać z aplikacji, potrzebny jest nowy kod.',
  'licence-expired':
    'Licencja na tym urządzeniu wygasła - kod działa przez rok od pierwszej aktywacji. Wpisz nowy kod, aby dalej korzystać z aplikacji. Jeśli data na tablecie jest nieprawidłowa, popraw ją i otwórz aplikację ponownie.',
  'clock-wrong':
    'Data lub godzina na tym urządzeniu jest nieprawidłowa, więc licencja wygląda na nieważną. Ustaw poprawną datę w ustawieniach tabletu i otwórz aplikację ponownie - kod nie musi być wpisywany drugi raz.',
  'rate-limited': 'Za dużo prób z tego urządzenia. Spróbuj ponownie za kilka minut.',
  offline:
    'Nie udało się połączyć z internetem. Aktywacja wymaga sieci - ale tylko ten jeden raz.',
  'bad-request': 'Coś poszło nie tak. Spróbuj ponownie za chwilę.',
  'server-error': 'Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.'
};

const messageFor = (reason) => MESSAGES[reason] || MESSAGES['server-error'];

export default function ActivationScreen({ unconfigured = false }) {
  const { busy, error, expired } = useLicense();
  const { canInstall } = useInstall();
  const [typed, setTyped] = useState('');
  const inputRef = useRef(null);

  const canonical = normaliseCode(typed);
  const complete = canonical.length === CODE_LENGTH;

  const handleChange = (e) => {
    // Re-format on every keystroke so the dashes appear as the parent types and
    // the box always shows the code in the same grouping as the card it was
    // read from. Everything not in the alphabet is dropped, so a pasted code
    // with spaces, dashes or lowercase lands correctly.
    const next = normaliseCode(e.target.value).slice(0, CODE_LENGTH);
    setTyped(formatCode(next));
    if (error) license.clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy || !complete) return;
    const ok = await license.activate(canonical);
    if (!ok) inputRef.current?.focus();
  };

  // Enter has to be handled here: the form's implicit submission does not fire
  // for this input, and without this the Go key on a tablet keyboard - which is
  // what a parent reaches for after the last character - does nothing at all.
  // Verified both ways in the browser before it was left in.
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handleSubmit(e);
  };

  if (unconfigured) {
    // Not a licence problem - a build problem. It says so plainly rather than
    // sending a parent hunting for a code that would never work anyway.
    return (
      <div className="activation-screen">
        <div className="activation-card glass-panel">
          <div className="activation-icon activation-icon-warn" aria-hidden="true">
            <AlertCircle size={30} />
          </div>
          <h1 className="activation-title">Aplikacja nie jest skonfigurowana</h1>
          <p className="activation-lead">
            Ta wersja aplikacji została zbudowana bez klucza licencji, więc nie potrafi
            sprawdzić żadnego kodu. To błąd instalacji, a nie Twojego kodu.
          </p>
          {SUPPORT_EMAIL && (
            <p className="activation-support">
              Napisz do nas: <span className="activation-email">{SUPPORT_EMAIL}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="activation-screen">
      <form className="activation-card glass-panel" onSubmit={handleSubmit}>
        <img className="app-logo activation-logo" src={logoUrl} alt="PlayGoo" width="312" height="106" />
        <div className={`activation-icon${expired ? ' activation-icon-warn' : ''}`} aria-hidden="true">
          <KeyRound size={30} />
        </div>

        {/* A parent coming back after a year is not setting a tablet up for the
            first time, and "this screen appears only once" would read as a bug. */}
        {expired ? (
          <>
            <h1 className="activation-title">Licencja wygasła</h1>
            <p className="activation-lead">
              Rok korzystania z aplikacji na tym urządzeniu dobiegł końca. Wpisz nowy kod,
              aby dziecko mogło dalej się uczyć.
            </p>
          </>
        ) : (
          <>
            <h1 className="activation-title">Aktywuj PlayGoo</h1>
            <p className="activation-lead">
              Ten ekran jest dla rodzica i pokaże się tylko raz. Wpisz kod otrzymany przy
              zakupie, a potem oddaj tablet dziecku.
            </p>
          </>
        )}

        <label className="activation-label" htmlFor="activation-code">
          Kod aktywacyjny
        </label>
        <input
          id="activation-code"
          ref={inputRef}
          className={`activation-input${error ? ' has-error' : ''}`}
          value={typed}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="XXXX-XXXX-XXXX"
          // A tablet keyboard would otherwise offer autocorrect and a lowercase
          // layout for a string that is neither a word nor lowercase.
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck="false"
          maxLength={CODE_LENGTH + 4}
          disabled={busy}
          autoFocus
          aria-describedby={error ? 'activation-error' : 'activation-help'}
          aria-invalid={error ? 'true' : 'false'}
        />

        {error && (
          <p className="activation-error" id="activation-error" role="alert">
            {error === 'offline' ? (
              <WifiOff size={16} aria-hidden="true" />
            ) : (
              <AlertCircle size={16} aria-hidden="true" />
            )}
            <span>{messageFor(error)}</span>
          </p>
        )}

        <button
          type="submit"
          className="action-btn btn-start activation-submit"
          disabled={busy || !complete}
          id="btn-activate"
        >
          {busy ? (
            <>
              <Loader2 size={18} className="activation-spinner" aria-hidden="true" />
              Sprawdzam...
            </>
          ) : (
            'Aktywuj'
          )}
        </button>

        <div className="activation-help" id="activation-help">
          <p>
            Aktywacja wymaga internetu <strong>tylko teraz</strong>. Później aplikacja
            działa bez sieci.
          </p>
          {/* The browser only offers this on a computer or board that can install
              the app. Installing and activating can happen in either order: the
              installed app shares this page's storage, so the licence carries over. */}
          {canInstall && (
            <p>
              Na komputerze lub tablicy interaktywnej aplikację można zainstalować - dostanie
              własną ikonę na pulpicie i otworzy się w osobnym oknie.
              <button
                type="button"
                className="action-btn activation-install"
                onClick={() => install.prompt()}
                id="btn-install-activation"
              >
                <Download size={18} aria-hidden="true" />
                Zainstaluj na tym komputerze
              </button>
            </p>
          )}
          <p>
            Jeden kod działa na dwóch urządzeniach, na przykład na tablecie i telefonie,
            przez <strong>rok od pierwszej aktywacji</strong>.
          </p>
          {SUPPORT_EMAIL && (
            <p className="activation-support">
              Kod nie działa? Napisz: <span className="activation-email">{SUPPORT_EMAIL}</span>
            </p>
          )}
          {/* Required by Google Play inside the app, and this is the one screen
              a parent rather than the child sees. A new tab, because in the
              Android app a same-tab link would take over the app itself. */}
          <p>
            <a
              className="activation-privacy"
              href="/polityka-prywatnosci.html"
              target="_blank"
              rel="noopener"
            >
              Polityka prywatności
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
