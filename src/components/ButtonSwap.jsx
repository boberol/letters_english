// A row of buttons that changes with the mode - "Odtwórz" while the animation
// plays, "Wyczyść" and "Sprawdź" while drawing - used to change width with it,
// and the ◀ ▶ buttons either side slid sideways under the child's finger every
// time the tab changed. Every option is rendered into the same grid cell and
// only the active one is visible, so the slot is always as wide as the widest
// option and nothing around it moves. The hidden ones are inert: no taps, no
// focus, not read out.
export default function ButtonSwap({ active, options }) {
  return (
    <div className="button-swap">
      {Object.entries(options).map(([key, node]) => {
        const on = key === active;
        return (
          <div key={key} className={on ? 'button-swap-item' : 'button-swap-item is-off'} inert={!on}>
            {node}
          </div>
        );
      })}
    </div>
  );
}
