// The two bits of chance every game uses. They used to be copied into each
// tool that needed them - eight copies across six files.

export const randomFrom = (list) => list[Math.floor(Math.random() * list.length)];

// Fisher-Yates, on a copy: the list passed in is left as it was.
export const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
