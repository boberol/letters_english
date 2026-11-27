// The colours a child can be asked to name, shared by the arrows and the
// numbers so the two tools use the same names for the same colours.
//
// `color` is the bright fill a child names. It is too light to read as text on
// the pale `bgColor` (yellow on cream is about 2:1), so words and titles drawn
// in a colour use `text`, a darker shade of the same hue that clears 4.5:1.
export const ALL_COLORS = [
  { id: 'red', label: 'Czerwony', color: '#EF4444', bgColor: '#FEF2F2', text: '#B91C1C' },
  { id: 'blue', label: 'Niebieski', color: '#3B82F6', bgColor: '#EFF6FF', text: '#1D4ED8' },
  { id: 'green', label: 'Zielony', color: '#10B981', bgColor: '#ECFDF5', text: '#047857' },
  { id: 'yellow', label: 'Żółty', color: '#F59E0B', bgColor: '#FEF3C7', text: '#B45309' },
  { id: 'purple', label: 'Fioletowy', color: '#8B5CF6', bgColor: '#F5F3FF', text: '#6D28D9' },
  { id: 'pink', label: 'Różowy', color: '#EC4899', bgColor: '#FDF2F8', text: '#BE185D' },
  { id: 'orange', label: 'Pomarańczowy', color: '#F97316', bgColor: '#FFF7ED', text: '#C2410C' },
  { id: 'cyan', label: 'Turkusowy', color: '#06B6D4', bgColor: '#ECFEFF', text: '#0E7490' },
  { id: 'dark', label: 'Czarny', color: '#1E293B', bgColor: '#F1F5F9', text: '#1E293B' }
];
