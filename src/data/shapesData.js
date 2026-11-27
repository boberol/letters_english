export const shapesCategories = [
  { id: 'lines', name: 'Linie i kąty', icon: '📏' },
  { id: 'geometry', name: 'Figury geometryczne', icon: '📐' },
  { id: 'patterns', name: 'Fale i zygzaki', icon: '〰️' },
  { id: 'fun', name: 'Kształty i symbole', icon: '⭐' }
];

// Closed figures go anticlockwise, the same way round as the letter "o": the
// ones with a point on top - triangle, romb, star - start on that point and
// set off to the left; the square and the rectangle start at the top left
// corner and go down; the heart starts in the dip at the top and goes left;
// the circle starts where the "c" and the "o" do, a little right of twelve.
// Lines go top to bottom and left to right, like a letter's strokes.
//
// A shape may also be drawn a side at a time, each side top to bottom or left
// to right (writingPieces in utils/strokeDirection.js), so the stored path is
// the way round the animation shows, not the only one accepted.
export const shapesData = [
  // --- Linie i kąty ---
  {
    id: 'line-h',
    name: 'Linia pozioma',
    category: 'lines',
    icon: '➖',
    viewBox: '0 0 100 100',
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    strokes: [
      { path: 'M 15,50 L 85,50' }
    ]
  },
  {
    id: 'line-v',
    name: 'Linia pionowa',
    category: 'lines',
    icon: '│',
    viewBox: '0 0 100 100',
    color: '#10B981',
    bgColor: '#ECFDF5',
    strokes: [
      { path: 'M 50,15 L 50,85' }
    ]
  },
  {
    id: 'line-diag-r',
    name: 'Linia ukośna w prawo',
    category: 'lines',
    icon: '╱',
    viewBox: '0 0 100 100',
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
    strokes: [
      { path: 'M 80,20 L 20,80' }
    ]
  },
  {
    id: 'line-diag-l',
    name: 'Linia ukośna w lewo',
    category: 'lines',
    icon: '╲',
    viewBox: '0 0 100 100',
    color: '#EC4899',
    bgColor: '#FDF2F8',
    strokes: [
      { path: 'M 20,20 L 80,80' }
    ]
  },
  {
    id: 'cross-plus',
    name: 'Plus',
    category: 'lines',
    icon: '➕',
    viewBox: '0 0 100 100',
    color: '#F59E0B',
    bgColor: '#FEF3C7',
    strokes: [
      { path: 'M 50,20 L 50,80' },
      { path: 'M 20,50 L 80,50' }
    ]
  },
  {
    id: 'cross-x',
    name: 'Krzyżyk',
    category: 'lines',
    icon: '✖️',
    viewBox: '0 0 100 100',
    color: '#EF4444',
    bgColor: '#FEF2F2',
    strokes: [
      { path: 'M 25,25 L 75,75' },
      { path: 'M 75,25 L 25,75' }
    ]
  },

  // --- Figury geometryczne ---
  {
    id: 'circle',
    name: 'Koło',
    category: 'geometry',
    icon: '⭕',
    viewBox: '0 0 100 100',
    color: '#06B6D4',
    bgColor: '#ECFEFF',
    strokes: [
      { path: 'M 74.57,32.79 A 30,30 0 0,0 25.43,67.21 A 30,30 0 0,0 74.57,32.79' }
    ]
  },
  {
    id: 'square',
    name: 'Kwadrat',
    category: 'geometry',
    icon: '⬛',
    viewBox: '0 0 100 100',
    color: '#3B82F6',
    bgColor: '#EFF6FF',
    strokes: [
      { path: 'M 25,25 L 25,75 L 75,75 L 75,25 Z' }
    ]
  },
  {
    id: 'triangle',
    name: 'Trójkąt',
    category: 'geometry',
    icon: '🔺',
    viewBox: '0 0 100 100',
    color: '#F97316',
    bgColor: '#FFF7ED',
    strokes: [
      { path: 'M 50,20 L 20,75 L 80,75 Z' }
    ]
  },
  {
    id: 'diamond',
    name: 'Romb',
    category: 'geometry',
    icon: '💠',
    viewBox: '0 0 100 100',
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
    strokes: [
      { path: 'M 50,18 L 18,50 L 50,82 L 82,50 Z' }
    ]
  },
  {
    id: 'rectangle',
    name: 'Prostokąt',
    category: 'geometry',
    icon: '▭',
    viewBox: '0 0 100 100',
    color: '#10B981',
    bgColor: '#ECFDF5',
    strokes: [
      { path: 'M 15,30 L 15,70 L 85,70 L 85,30 Z' }
    ]
  },

  // --- Szlaczki i fale ---
  {
    id: 'wave',
    name: 'Fala',
    category: 'patterns',
    icon: '🌊',
    viewBox: '0 0 100 100',
    color: '#0284C7',
    bgColor: '#E0F2FE',
    strokes: [
      { path: 'M 15,50 Q 32.5,25 50,50 T 85,50' }
    ]
  },
  {
    id: 'zigzag',
    name: 'Zygzak',
    category: 'patterns',
    icon: '⚡',
    viewBox: '0 0 100 100',
    color: '#EAB308',
    bgColor: '#FEFCE8',
    strokes: [
      { path: 'M 15,65 L 32.5,35 L 50,65 L 67.5,35 L 85,65' }
    ]
  },
  {
    id: 'arc',
    name: 'Łuk / Tęcza',
    category: 'patterns',
    icon: '🌈',
    viewBox: '0 0 100 100',
    color: '#EC4899',
    bgColor: '#FDF2F8',
    strokes: [
      { path: 'M 20,70 Q 50,25 80,70' }
    ]
  },
  {
    id: 'loop',
    name: 'Pętelka',
    category: 'patterns',
    icon: '➰',
    viewBox: '0 0 100 100',
    color: '#6366F1',
    bgColor: '#EEF2FF',
    strokes: [
      { path: 'M 20,70 C 35,70 65,25 50,25 C 35,25 65,70 80,70' }
    ]
  },

  // --- Kształty i symbole ---
  {
    id: 'star',
    name: 'Gwiazdka',
    category: 'fun',
    icon: '⭐',
    viewBox: '0 0 100 100',
    color: '#F59E0B',
    bgColor: '#FEF3C7',
    strokes: [
      { path: 'M 50,15 L 39,38 L 15,40 L 33,56 L 28,80 L 50,68 L 72,80 L 67,56 L 85,40 L 61,38 Z' }
    ]
  },
  {
    id: 'heart',
    name: 'Serduszko',
    category: 'fun',
    icon: '❤️',
    viewBox: '0 0 100 100',
    color: '#EF4444',
    bgColor: '#FEF2F2',
    strokes: [
      { path: 'M 50,33 C 48,28 44,16 32,24 C 15,35 20,55 50,78 C 80,55 85,35 68,24 C 56,16 52,28 50,33 Z' }
    ]
  }
];

export const getDefaultShapeIds = () => shapesData.map(s => s.id);
