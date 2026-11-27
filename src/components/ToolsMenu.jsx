import React, { useState } from 'react';
import { sounds } from '../utils/audio';
import { progress } from '../utils/progress';
import { stickerScene } from '../utils/stickerScene';
import SettingsModal from './SettingsModal';
import ParentGate from './ParentGate';
import { purchase } from '../utils/purchase';
import { usePurchase } from '../hooks/usePurchase';
import logoUrl from '../assets/logo-playgoo.svg';
import ksztaltyIcon from '../assets/menu-icons/ksztalty.webp';
import szlaczkiIcon from '../assets/menu-icons/szlaczki.webp';
import strzalkiIcon from '../assets/menu-icons/strzalki.webp';
import metronomIcon from '../assets/menu-icons/metronom.webp';
import literyIcon from '../assets/menu-icons/litery.webp';
import znajdzIcon from '../assets/menu-icons/znajdz.webp';
import paryIcon from '../assets/menu-icons/pary.webp';
import gloskaIcon from '../assets/menu-icons/gloska.webp';
import sylabyIcon from '../assets/menu-icons/sylaby.webp';
import slowaIcon from '../assets/menu-icons/slowa.webp';
import wynikiIcon from '../assets/menu-icons/wyniki.webp';
import liczbyIcon from '../assets/menu-icons/liczby.webp';

// Bands the activities are grouped into. With four tools a flat grid was fine;
// past that a child has to scan the whole screen to find the one they want, so
// related activities sit together under a heading they can learn the shape of.
const SECTIONS = [
  { id: 'hand', label: 'Warm up your hand', order: 1 },
  { id: 'letters', label: 'Learn letters', order: 2 },
  { id: 'words', label: 'Sounds and words', order: 3 },
  { id: 'rewards', label: 'Rewards', order: 4 }
];

// Cards lead with the picture and a one or two word name: most of the children
// using this cannot read a paragraph yet, so anything longer is just noise.
// The pictures are one drawn set (assets/menu-icons/), not emoji, which every
// device drew in its own style.
const TOOLS_LIST = [
  {
    id: 'shapes',
    section: 'hand',
    name: 'Shapes',
    subtitle: 'Lines and shapes',
    icon: ksztaltyIcon,
    color: '#047857',
    bgColor: '#ECFDF5'
  },
  {
    id: 'patterns',
    section: 'hand',
    name: 'Patterns',
    subtitle: 'Pattern families',
    icon: szlaczkiIcon,
    color: '#B45309',
    bgColor: '#FEF3C7'
  },
  {
    id: 'arrows',
    section: 'hand',
    name: 'Arrows',
    subtitle: 'Learn directions',
    icon: strzalkiIcon,
    color: '#4D7C0F',
    bgColor: '#F7FEE7'
  },
  {
    id: 'numbers',
    section: 'hand',
    name: 'Numbers',
    subtitle: 'Numbers and colours',
    icon: liczbyIcon,
    color: '#1D4ED8',
    bgColor: '#EFF6FF'
  },
  {
    id: 'metronome',
    section: 'hand',
    name: 'Metronome',
    subtitle: 'Draw to the beat',
    icon: metronomIcon,
    color: '#0F766E',
    bgColor: '#F0FDFA'
  },
  {
    id: 'letters',
    section: 'letters',
    name: 'Letters',
    subtitle: 'Trace the letters',
    icon: literyIcon,
    color: '#4338CA',
    bgColor: '#EEF2FF'
  },
  {
    id: 'find-letter',
    section: 'letters',
    name: 'Find the letter',
    subtitle: 'Spot the same one',
    icon: znajdzIcon,
    color: '#0E7490',
    bgColor: '#ECFEFF'
  },
  {
    id: 'letter-pairs',
    section: 'letters',
    name: 'Letter pairs',
    subtitle: 'Find two the same',
    icon: paryIcon,
    color: '#7E22CE',
    bgColor: '#F3E8FF'
  },
  {
    id: 'first-sound',
    section: 'words',
    name: 'First sound',
    subtitle: 'Which letter?',
    icon: gloskaIcon,
    color: '#BE123C',
    bgColor: '#FFF1F2'
  },
  {
    id: 'syllables',
    section: 'words',
    name: 'Syllables',
    subtitle: 'Build from syllables',
    icon: sylabyIcon,
    color: '#C2410C',
    bgColor: '#FFEDD5'
  },
  {
    id: 'word-scramble',
    section: 'words',
    name: 'Words',
    subtitle: 'Spell with letters',
    icon: slowaIcon,
    color: '#A21CAF',
    bgColor: '#FDF4FF'
  },
  {
    id: 'sticker-book',
    section: 'rewards',
    name: 'My stickers',
    subtitle: 'Stick them on pictures',
    icon: wynikiIcon,
    color: '#BE185D',
    bgColor: '#FDF2F8'
  }
];

// The privacy policy is on Borys's website (store/privacy.html is the source),
// because Google Play needs it at a public address. In the Android app the link
// opens in the phone's browser.
const PRIVACY_URL = 'https://acentrum.pl/playgoo/privacy.html';

// "Remove ads": the one-time Google Play purchase (utils/purchase.js). Shown
// only where it can be bought - the Android app, with Play reachable - or once
// it is owned, so a family can see they have it.
function RemoveAdsSection() {
  const { available, price, owned, busy, message } = usePurchase();
  if (!available && !owned) return null;
  return (
    <div className="settings-section">
      <span className="settings-label">Ads</span>
      <p className="parent-panel-text">
        {owned
          ? 'Ads are removed. Thank you for supporting PlayGoo!'
          : 'PlayGoo is free with ads. One payment removes them for good on every device with this Google account.'}
      </p>
      {message && <p className="parent-panel-text">{message}</p>}
      {!owned && (
        <div className="parent-panel-actions">
          <button type="button" className="action-btn btn-start" disabled={busy} onClick={() => purchase.buy()}>
            {price ? `Remove ads (${price})` : 'Remove ads'}
          </button>
          <button type="button" className="action-btn btn-replay" disabled={busy} onClick={() => purchase.restore()}>
            Restore purchase
          </button>
        </div>
      )}
    </div>
  );
}

// Things for the adult: removing the ads, the privacy policy and starting the
// progress over (for a hand-me-down tablet or a younger sibling). Starting over
// asks twice. The whole panel sits behind ParentGate, since it holds a
// purchase and a link out of the app.
function ParentPanel({ onClose }) {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const resetProgress = () => {
    sounds.playClick();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    progress.reset();
    stickerScene.reset();
    setConfirming(false);
    setDone(true);
  };

  return (
    <SettingsModal title="For grown-ups" onClose={onClose} doneLabel="Close">
      <RemoveAdsSection />
      <div className="settings-section">
        <span className="settings-label">Stars and stickers</span>
        <p className="parent-panel-text">
          {done
            ? 'Progress cleared. Ready to start again.'
            : confirming
              ? 'Are you sure? All stars, stickers and sticker pictures will be deleted. This cannot be undone.'
              : 'Starts again from zero: handy when the tablet is passed on to a younger brother or sister.'}
        </p>
        {!done && (
          <button type="button" className={`action-btn ${confirming ? 'btn-clear' : 'btn-replay'}`} onClick={resetProgress}>
            {confirming ? 'Yes, clear it' : 'Clear progress'}
          </button>
        )}
      </div>
      <div className="settings-section">
        <span className="settings-label">Privacy</span>
        <p className="parent-panel-text">
          <a href={PRIVACY_URL} target="_blank" rel="noopener">
            Privacy policy
          </a>
        </p>
      </div>
    </SettingsModal>
  );
}

export default function ToolsMenu({ onSelectTool }) {
  // closed -> gate (a question a child cannot answer) -> panel.
  const [parentStep, setParentStep] = useState('closed');
  return (
    <div className="tools-menu-container">
      <img className="app-logo" src={logoUrl} alt="PlayGoo" width="312" height="106" />
      <h1 className="tools-main-title">What shall we play today?</h1>

      {SECTIONS.slice()
        .sort((a, b) => a.order - b.order)
        .map((section) => {
          const tools = TOOLS_LIST.filter((tool) => tool.section === section.id);
          if (tools.length === 0) return null;

          return (
            <section className="tools-section" key={section.id} aria-labelledby={`section-${section.id}`}>
              <h2 className="tools-section-title" id={`section-${section.id}`}>
                {section.label}
              </h2>

              <div className="tools-cards-grid">
                {tools.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    className="tool-card"
                    style={{
                      backgroundColor: tool.bgColor,
                      borderColor: tool.color
                    }}
                    onClick={() => {
                      sounds.playClick();
                      onSelectTool(tool.id);
                    }}
                  >
                    <img className="tool-card-icon" src={tool.icon} alt="" width="256" height="256" draggable="false" />
                    <span className="tool-card-title" style={{ color: tool.color }}>
                      {tool.name}
                    </span>
                    <span className="tool-card-subtitle">{tool.subtitle}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}

      {/* For the parent, so small and at the very bottom. Google Play wants the
          privacy policy reachable inside the app, not only on the activation
          screen a parent sees once; it used to be a link right here, one tap
          from a child and out of the app. Now it is a panel of words, which a
          child closes again, and the policy link and starting over live in it. */}
      <footer className="tools-footer">
        <button type="button" className="tools-footer-btn" onClick={() => { sounds.playClick(); setParentStep('gate'); }}>
          For grown-ups
        </button>
      </footer>

      {parentStep === 'gate' && (
        <ParentGate onPass={() => setParentStep('panel')} onClose={() => setParentStep('closed')} />
      )}
      {parentStep === 'panel' && <ParentPanel onClose={() => setParentStep('closed')} />}
    </div>
  );
}
