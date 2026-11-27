export const themes = {
  bee: {
    id: "bee",
    name: "Pszczółka",
    icon: "🐝",
    color: "#A16207", // yellow-700 - readable on the light tile background
    bgColor: "#FEF9C3", // yellow-100
    letters: ["a", "ą", "c", "ć", "d", "e", "ę", "g", "o", "ó", "s", "ś"]
  },
  dolphin: {
    id: "dolphin",
    name: "Delfin",
    icon: "🐬",
    color: "#0E7490", // cyan-700 - readable on the light tile background
    bgColor: "#CFFAFE", // cyan-100
    letters: ["r", "n", "ń", "m", "h", "p", "b"]
  },
  spider: {
    id: "spider",
    name: "Pająk",
    icon: "🕷️",
    color: "#7E22CE", // purple-700 - readable on the light tile background
    bgColor: "#F3E8FF", // purple-100
    letters: ["w", "z", "ź", "ż", "k"]
  },
  giraffe: {
    id: "giraffe",
    name: "Żyrafa",
    icon: "🦒",
    color: "#C2410C", // orange-700 - readable on the light tile background
    bgColor: "#FFEDD5", // orange-100
    letters: ["l", "ł", "t", "i", "u", "y", "j", "f"]
  }
};

export function getThemeForLetter(letter) {
  for (const key in themes) {
    if (themes[key].letters.includes(letter.toLowerCase())) {
      return themes[key];
    }
  }
  return themes.bee; // default
}
