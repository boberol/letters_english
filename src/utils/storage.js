// Every setting a tool remembers goes through here, so each localStorage touch
// is wrapped the same way. A browser in private mode, with site data blocked or
// out of quota, throws on access - and one unwrapped read in Słowa used to take
// the whole app down to a blank page with it.

// A saved value, or `fallback` when there is none, it cannot be read, or it
// fails `isValid`. Values are stored as JSON.
export const loadSetting = (key, fallback, isValid = () => true) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      const value = JSON.parse(raw);
      if (isValid(value)) return value;
    }
  } catch (e) {}
  return fallback;
};

export const saveSetting = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
};

// One of a fixed set of strings, stored bare rather than as JSON - the form the
// older per-tool keys (`letter_app_*_diff`, `_mode` and so on) were written in,
// so the settings families already have survive.
export const loadChoice = (key, allowed, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    if (saved != null && allowed.includes(saved)) return saved;
  } catch (e) {}
  return fallback;
};

export const saveChoice = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {}
};
