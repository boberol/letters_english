import React, { useState } from 'react';
import { sounds } from '../utils/audio';
import { progress } from '../utils/progress';
import { stickerScene } from '../utils/stickerScene';
import SettingsModal from './SettingsModal';
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
  { id: 'hand', label: 'Ćwicz rękę', order: 1 },
  { id: 'letters', label: 'Poznaj litery', order: 2 },
  { id: 'words', label: 'Dźwięki i słowa', order: 3 },
  { id: 'rewards', label: 'Nagrody', order: 4 }
];

// Cards lead with the picture and a one or two word name: most of the children
// using this cannot read a paragraph yet, so anything longer is just noise.
// The pictures are one drawn set (assets/menu-icons/), not emoji, which every
// device drew in its own style.
const TOOLS_LIST = [
  {
    id: 'shapes',
    section: 'hand',
    name: 'Kształty',
    subtitle: 'Linie i figury',
    icon: ksztaltyIcon,
    color: '#047857',
    bgColor: '#ECFDF5'
  },
  {
    id: 'patterns',
    section: 'hand',
    name: 'Szlaczki',
    subtitle: 'Rodziny wzorków',
    icon: szlaczkiIcon,
    color: '#B45309',
    bgColor: '#FEF3C7'
  },
  {
    id: 'arrows',
    section: 'hand',
    name: 'Strzałki',
    subtitle: 'Poznaj kierunki',
    icon: strzalkiIcon,
    color: '#4D7C0F',
    bgColor: '#F7FEE7'
  },
  {
    id: 'numbers',
    section: 'hand',
    name: 'Liczby',
    subtitle: 'Liczby i kolory',
    icon: liczbyIcon,
    color: '#1D4ED8',
    bgColor: '#EFF6FF'
  },
  {
    id: 'metronome',
    section: 'hand',
    name: 'Metronom',
    subtitle: 'Rysuj w rytm',
    icon: metronomIcon,
    color: '#0F766E',
    bgColor: '#F0FDFA'
  },
  {
    id: 'letters',
    section: 'letters',
    name: 'Litery',
    subtitle: 'Pisz po śladzie',
    icon: literyIcon,
    color: '#4338CA',
    bgColor: '#EEF2FF'
  },
  {
    id: 'find-letter',
    section: 'letters',
    name: 'Znajdź literę',
    subtitle: 'Wskaż taką samą',
    icon: znajdzIcon,
    color: '#0E7490',
    bgColor: '#ECFEFF'
  },
  {
    id: 'letter-pairs',
    section: 'letters',
    name: 'Pary liter',
    subtitle: 'Odkryj dwie takie same',
    icon: paryIcon,
    color: '#7E22CE',
    bgColor: '#F3E8FF'
  },
  {
    id: 'first-sound',
    section: 'words',
    name: 'Pierwsza głoska',
    subtitle: 'Na jaką literę?',
    icon: gloskaIcon,
    color: '#BE123C',
    bgColor: '#FFF1F2'
  },
  {
    id: 'syllables',
    section: 'words',
    name: 'Sylaby',
    subtitle: 'Ułóż z sylab',
    icon: sylabyIcon,
    color: '#C2410C',
    bgColor: '#FFEDD5'
  },
  {
    id: 'word-scramble',
    section: 'words',
    name: 'Słowa',
    subtitle: 'Układaj literki',
    icon: slowaIcon,
    color: '#A21CAF',
    bgColor: '#FDF4FF'
  },
  {
    id: 'sticker-book',
    section: 'rewards',
    name: 'Moje naklejki',
    subtitle: 'Przyklejaj na obrazki',
    icon: wynikiIcon,
    color: '#BE185D',
    bgColor: '#FDF2F8'
  }
];

// Things for the adult: the privacy policy and starting the progress over
// (for a hand-me-down tablet or a younger sibling). Starting over asks twice.
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
    <SettingsModal title="Dla rodzica" onClose={onClose} doneLabel="Zamknij">
      <div className="settings-section">
        <span className="settings-label">Gwiazdki i naklejki</span>
        <p className="parent-panel-text">
          {done
            ? 'Postępy wyzerowane. Można zaczynać od nowa.'
            : confirming
              ? 'Na pewno? Znikną wszystkie gwiazdki, naklejki i obrazki z naklejkami. Tego nie da się cofnąć.'
              : 'Zaczyna od zera: przydaje się, gdy tablet dostaje młodsze rodzeństwo.'}
        </p>
        {!done && (
          <button type="button" className={`action-btn ${confirming ? 'btn-clear' : 'btn-replay'}`} onClick={resetProgress}>
            {confirming ? 'Tak, wyzeruj' : 'Wyzeruj postępy'}
          </button>
        )}
      </div>
      <div className="settings-section">
        <span className="settings-label">Prywatność</span>
        <p className="parent-panel-text">
          <a href="/polityka-prywatnosci.html" target="_blank" rel="noopener">
            Polityka prywatności
          </a>
        </p>
      </div>
    </SettingsModal>
  );
}

export default function ToolsMenu({ onSelectTool }) {
  const [parentOpen, setParentOpen] = useState(false);
  return (
    <div className="tools-menu-container">
      <img className="app-logo" src={logoUrl} alt="PlayGoo" width="312" height="106" />
      <h1 className="tools-main-title">W co dziś gramy?</h1>

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
        <button type="button" className="tools-footer-btn" onClick={() => { sounds.playClick(); setParentOpen(true); }}>
          Dla rodzica
        </button>
      </footer>

      {parentOpen && <ParentPanel onClose={() => setParentOpen(false)} />}
    </div>
  );
}
