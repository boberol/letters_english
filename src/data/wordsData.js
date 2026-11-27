// The word bank behind every picture game: Word Scramble, Syllables, First
// Sound and the picture mode of Letter Pairs.
//
// Each word has a drawing in src/assets/pictures/words/, found by the word's
// `id` - its spelling in lower case (TORTOISE -> tortoise.webp). The drawings
// are made by `node build_pictures.cjs <folder>`, which also checks that every
// word here has a picture and every picture a word.
//
// The word is the answer to the picture, so it names exactly what is drawn,
// including how many: two boots are BOOTS, one sock would be a SOCK.
//
// This file imports nothing, on purpose: build_pictures.cjs loads it with Node.

export const wordsCategories = [
  { id: 'all', name: 'All', icon: '🌟' },
  { id: 'animals', name: 'Animals', icon: '🐾' },
  { id: 'food', name: 'Food', icon: '🍎' },
  { id: 'objects', name: 'Things', icon: '🧸' },
  { id: 'nature', name: 'Nature', icon: '🌳' },
  { id: 'vehicles', name: 'Vehicles', icon: '🚗' },
  { id: 'people', name: 'People', icon: '🧑' },
  { id: 'body', name: 'Body', icon: '✋' },
  { id: 'places', name: 'Places', icon: '🏠' },
  { id: 'school', name: 'School', icon: '✏️' },
  { id: 'music', name: 'Music', icon: '🎵' },
  { id: 'tools', name: 'Tools', icon: '🔨' }
];

// [letters and borders, page background]. The first is dark enough to read as
// text on white.
const PALETTE = {
  red: ['#DC2626', '#FEF2F2'],
  orange: ['#C2410C', '#FFEDD5'],
  amber: ['#B45309', '#FEF3C7'],
  yellow: ['#A16207', '#FEFCE8'],
  lime: ['#4D7C0F', '#F7FEE7'],
  green: ['#047857', '#ECFDF5'],
  teal: ['#0E7490', '#ECFEFF'],
  sky: ['#0284C7', '#E0F2FE'],
  blue: ['#2563EB', '#EFF6FF'],
  indigo: ['#4338CA', '#EEF2FF'],
  purple: ['#7E22CE', '#F3E8FF'],
  pink: ['#DB2777', '#FDF2F8'],
  brown: ['#92400E', '#FEF3C7'],
  slate: ['#475569', '#F1F5F9']
};

// TORTOISE -> tortoise. The same name build_pictures.cjs gives a file.
export const slugOf = (word) => word.toLowerCase();

// Two letters that make one sound at the start of a word. WH is left out on
// purpose: WHEELBARROW starts with the sound of W, and W is the right answer.
const DIGRAPHS = ['CH', 'SH', 'TH'];

// Words whose first sound is not the sound their first letter is taught with
// in phonics: a soft C or G (CIRCUS, GIRAFFE), PH, and vowels that say their
// name or something else again (EIGHT, EYES, ONION, ACORNS, UFO). Marking the
// letter right would teach the wrong sound, and marking the sound right
// contradicts the spelling, so these words are not asked about their first
// sound. They still appear everywhere a question is about letters.
const NO_FIRST_SOUND = new Set([
  'ACCORDION', 'ACORNS', 'APRON', 'ARMCHAIR', 'CIRCUS', 'EIGHT', 'ELECTRICIAN', 'EYES', 'GENIE',
  'GINGER', 'GIRAFFE', 'ONION', 'PHONE', 'UFO'
]);

/**
 * The sound a word starts with, as it is written - or null where the first
 * sound is not the one its first letter stands for (see NO_FIRST_SOUND).
 */
const firstSoundOf = (word) => {
  if (NO_FIRST_SOUND.has(word)) return null;
  const two = word.slice(0, 2);
  return DIGRAPHS.includes(two) ? two : word[0];
};

// Different spellings of one sound: CAT and KETTLE start alike.
const SAME_SOUND = { C: 'K' };
const soundKey = (sound) => SAME_SOUND[sound] || sound;

/**
 * Whether two first sounds are too close to sit on opposite sides of a
 * question: the same sound spelt differently (C and K), or the same first
 * letter (S and SH - a child shown the letter S may fairly point at a shark).
 */
export const soundsClash = (a, b) => !!a && !!b && (soundKey(a) === soundKey(b) || a[0] === b[0]);

// Words a pre-reader may not know, or whose picture they will likely name as
// something else (a hare is "a rabbit", a foal "a horse", a bison "a cow").
// With no voice and the word hidden until "Well done", the child has to name
// the picture unaided, so these wait for the hardest setting of First Sound
// and come last in Word Scramble and Syllables.
const HARD_WORDS = new Set([
  'BAUBLE', 'BISON', 'BOLT', 'COIN', 'COMPASSES', 'DECKCHAIR', 'DIARY', 'FLOUR', 'FOAL', 'GENIE',
  'GINGER', 'HARE', 'JOCKEY', 'LEG', 'MOOSE', 'MOTH', 'NEEDLE', 'NOTEBOOK', 'PHONE', 'RIDER',
  'SCREEN', 'STUMP'
]);

// Pictures a child can take for one another. Never offered side by side, or a
// child who taps the rider for H is marked wrong.
const PICTURE_GROUPS = [
  ['HORSE', 'RIDER', 'FOAL', 'JOCKEY'],
  ['BUTTERFLY', 'MOTH'],
  ['LEG', 'BOOTS'],
  ['DIARY', 'NOTEBOOK'],
  ['DEER', 'MOOSE'],
  ['BISON', 'COW'],
  ['BOAT', 'YACHT'],
  ['COIN', 'MONEY']
];

export const picturesClash = (a, b) =>
  PICTURE_GROUPS.some((group) => group.includes(a.word) && group.includes(b.word));

// One row per word: its syllables (which spell it), category, colour, and a
// clue for the adult to read out.
const w = (syllables, category, colour, hint) => {
  const parts = syllables.split('-');
  const word = parts.join('');
  const firstSound = firstSoundOf(word);
  const [color, bgColor] = PALETTE[colour];
  return {
    id: slugOf(word),
    word,
    name: word[0] + word.slice(1).toLowerCase(),
    syllables: parts,
    length: word.length,
    firstSound,
    digraph: !!firstSound && firstSound.length > 1,
    category,
    hard: HARD_WORDS.has(word),
    color,
    bgColor,
    hint
  };
};

// Syllables follow the way a word is clapped out in Reception: a double
// consonant is split (HAM-MOCK, BAL-LOON), and so is a pair in the middle of a
// word (WIN-DOW, HAM-STER), unless the two make one sound (DOL-PHIN, FEATH-ER).
export const wordsData = [
  w('AC-COR-DI-ON', 'music', 'red', 'You squeeze it in and out and press its keys to play a tune.'),
  w('A-CORNS', 'nature', 'brown', 'Little nuts from an oak tree, with tiny caps.'),
  w('AM-BU-LANCE', 'vehicles', 'red', 'It races to hospital with its siren on.'),
  w('ANT', 'animals', 'slate', 'A tiny, busy insect that lives in a big nest.'),
  w('AP-PLE', 'food', 'red', 'A round, crunchy fruit that grows on a tree.'),
  w('A-PRON', 'objects', 'pink', 'You wear it when you cook, to stay clean.'),
  w('ARM-CHAIR', 'objects', 'green', 'A soft, comfy seat with arms.'),
  w('AV-O-CA-DO', 'food', 'green', 'A green fruit with a big stone in the middle.'),
  w('BALL', 'objects', 'red', 'A round toy for throwing, kicking and bouncing.'),
  w('BAL-LOON', 'objects', 'red', 'You blow it up, tie it on a string and it floats.'),
  w('BA-NA-NA', 'food', 'yellow', 'A long yellow fruit that monkeys love.'),
  w('BATH', 'objects', 'sky', 'You fill it with water and have a soak.'),
  w('BAU-BLE', 'objects', 'blue', 'A shiny ball we hang on the Christmas tree.'),
  w('BEAR', 'animals', 'brown', 'A big, strong animal that sleeps all winter.'),
  w('BEE-HIVE', 'objects', 'amber', 'A little house where bees live and make honey.'),
  w('BEET-ROOT', 'food', 'pink', 'A dark red vegetable that turns your fingers pink.'),
  w('BELL', 'music', 'amber', 'Shake it and it goes ding-a-ling.'),
  w('BENCH', 'objects', 'brown', 'A long seat in the park.'),
  w('BIKE', 'vehicles', 'blue', 'It has two wheels, pedals and a bell.'),
  w('BI-NOC-U-LARS', 'objects', 'slate', 'Look through them to see far-away things up close.'),
  w('BI-SON', 'animals', 'brown', 'A huge, shaggy wild cow with horns.'),
  w('BLUE-BER-RIES', 'food', 'indigo', 'Tiny dark blue berries.'),
  w('BOAR', 'animals', 'brown', 'A wild, hairy pig that lives in the forest.'),
  w('BOAT', 'vehicles', 'brown', 'You row it across the lake with oars.'),
  w('BOLT', 'tools', 'teal', 'A metal rod with a thread that a nut screws onto.'),
  w('BONE', 'objects', 'amber', 'Every dog\'s favourite treat.'),
  w('BOOTS', 'objects', 'brown', 'You pull them on your feet before going out in the mud.'),
  w('BRANCH', 'nature', 'lime', 'It grows out of a tree trunk and holds the leaves.'),
  w('BREAD', 'food', 'amber', 'You slice it and make sandwiches with it.'),
  w('BRICK', 'objects', 'orange', 'A red block for building houses.'),
  w('BUS', 'vehicles', 'lime', 'A long vehicle that carries lots of people around town.'),
  w('BUT-TER-FLY', 'animals', 'orange', 'An insect with colourful wings that visits flowers.'),
  w('BUT-TON', 'objects', 'brown', 'A small round thing with holes for doing up clothes.'),
  w('CAMP-FIRE', 'nature', 'orange', 'A fire outdoors where you can toast marshmallows.'),
  w('CAN-DLE', 'objects', 'yellow', 'It burns with a small flame and gives light.'),
  w('CAN-NON', 'objects', 'slate', 'A big tube on wheels that fires heavy balls. Boom!'),
  w('CAR', 'vehicles', 'blue', 'It has four wheels, a steering wheel and an engine.'),
  w('CAR-ROT', 'food', 'orange', 'An orange vegetable that rabbits love.'),
  w('CAS-TLE', 'places', 'blue', 'A big building with towers where a king lives.'),
  w('CAT', 'animals', 'slate', 'It purrs, miaows and chases mice.'),
  w('CHEESE', 'food', 'yellow', 'Yellow, with holes, and made from milk.'),
  w('CHIPS', 'food', 'yellow', 'Hot, crunchy sticks of fried potato.'),
  w('CHOC-O-LATE', 'food', 'brown', 'A sweet brown bar made from cocoa.'),
  w('CIR-CUS', 'places', 'red', 'A big striped tent with clowns and acrobats.'),
  w('COIN', 'objects', 'amber', 'A round piece of money.'),
  w('COM-PASS-ES', 'school', 'slate', 'You use it to draw perfect circles.'),
  w('COW', 'animals', 'slate', 'It says moo and gives us milk.'),
  w('CRANE', 'vehicles', 'yellow', 'A tall machine that lifts heavy things on a building site.'),
  w('CROIS-SANT', 'food', 'amber', 'A flaky, curved pastry shaped like the moon.'),
  w('CU-CUM-BER', 'food', 'green', 'A long green vegetable, nice in a sandwich.'),
  w('DECK-CHAIR', 'objects', 'blue', 'A folding chair for relaxing on the beach.'),
  w('DEER', 'animals', 'brown', 'A forest animal with big branching antlers.'),
  w('DI-A-RY', 'school', 'blue', 'A book where you write what happened each day.'),
  w('DI-NO-SAUR', 'animals', 'lime', 'A huge animal that lived a very, very long time ago.'),
  w('DOG', 'animals', 'amber', 'It barks, wags its tail and is our best friend.'),
  w('DOL-PHIN', 'animals', 'sky', 'A clever sea animal that leaps over the waves.'),
  w('DOUGH-NUT', 'food', 'amber', 'A round sweet bun with jam inside.'),
  w('DRAW-ER', 'objects', 'brown', 'It slides out of a cupboard and you keep things in it.'),
  w('DRILL', 'tools', 'green', 'A tool that makes holes in the wall.'),
  w('DUCK', 'animals', 'green', 'A bird that swims on the pond and says quack.'),
  w('EGG', 'food', 'orange', 'A hen lays it, and it has a yellow yolk inside.'),
  w('EIGHT', 'objects', 'sky', 'The number that looks like two circles, one on top of the other.'),
  w('E-LEC-TRI-CIAN', 'people', 'blue', 'Someone who fixes plugs, wires and lights.'),
  w('EL-E-PHANT', 'animals', 'slate', 'A giant with a long trunk and huge ears.'),
  w('EN-VE-LOPE', 'objects', 'red', 'You put a letter in it and post it.'),
  w('EYES', 'body', 'blue', 'You have two and you see with them.'),
  w('FEATH-ER', 'nature', 'teal', 'Light and soft, a bird dropped it.'),
  w('FIGS', 'food', 'purple', 'Sweet purple fruits full of tiny seeds.'),
  w('FISH', 'animals', 'teal', 'It swims in water and has fins and scales.'),
  w('FLOUR', 'food', 'amber', 'White powder for baking bread and cakes.'),
  w('FOAL', 'animals', 'brown', 'A baby horse.'),
  w('FORK', 'objects', 'purple', 'It has prongs for picking up food.'),
  w('FROG', 'animals', 'green', 'It is green, hops and croaks by the pond.'),
  w('GE-NIE', 'people', 'purple', 'It pops out of a lamp and grants three wishes.'),
  w('GIN-GER', 'food', 'amber', 'A spicy root that goes in biscuits and tea.'),
  w('GI-RAFFE', 'animals', 'amber', 'The tallest animal, with a very long neck.'),
  w('GLASS-ES', 'objects', 'sky', 'You wear them on your nose to see better.'),
  w('GLOBE', 'school', 'sky', 'A round map of the whole Earth that spins.'),
  w('GOOSE', 'animals', 'amber', 'A big bird with a long neck that honks loudly.'),
  w('GO-RIL-LA', 'animals', 'slate', 'The biggest and strongest ape.'),
  w('GRAN-DAD', 'people', 'teal', 'Your mum\'s or your dad\'s dad.'),
  w('GUI-TAR', 'music', 'brown', 'You strum its strings with your fingers.'),
  w('HAIR-DRY-ER', 'objects', 'orange', 'It blows warm air to dry wet hair.'),
  w('HAM-MOCK', 'objects', 'red', 'It hangs between two trees and you swing in it.'),
  w('HAM-STER', 'animals', 'orange', 'A small furry pet that stuffs food in its cheeks.'),
  w('HAND', 'body', 'orange', 'It has five fingers, and you have two.'),
  w('HARE', 'animals', 'amber', 'It has long ears and races across the fields.'),
  w('HAT', 'objects', 'teal', 'A woolly one keeps your head warm.'),
  w('HEDGE-HOG', 'animals', 'brown', 'A small animal with prickles on its back.'),
  w('HEL-I-COP-TER', 'vehicles', 'red', 'It flies with big spinning blades on top.'),
  w('HEL-MET', 'objects', 'red', 'A hard hat that protects your head.'),
  w('HIP-PO', 'animals', 'purple', 'A huge, heavy animal that loves wallowing in water.'),
  w('HOOK', 'tools', 'yellow', 'A bent piece of metal for hanging and lifting.'),
  w('HORSE', 'animals', 'brown', 'It has a mane and hooves, neighs and gallops.'),
  w('HOUSE', 'places', 'red', 'We live in it with our family.'),
  w('IG-LOO', 'places', 'sky', 'A little house built from blocks of snow.'),
  w('JAM', 'food', 'red', 'Sweet fruit in a jar for spreading on toast.'),
  w('JOCK-EY', 'people', 'purple', 'A rider who races horses.'),
  w('KET-TLE', 'objects', 'red', 'It boils water for a cup of tea.'),
  w('LAD-DER', 'tools', 'brown', 'It has rungs you climb to get up high.'),
  w('LAMP', 'objects', 'yellow', 'It lights up the room when it gets dark.'),
  w('LEAF', 'nature', 'orange', 'It grows on a branch and falls off in autumn.'),
  w('LEG', 'body', 'brown', 'You have two, for walking, running and jumping.'),
  w('LEM-ON', 'food', 'yellow', 'A very sour yellow fruit.'),
  w('LIPS', 'body', 'red', 'You smile and blow kisses with them.'),
  w('MAP', 'school', 'amber', 'A drawing that shows roads, towns and countries.'),
  w('MI-CRO-PHONE', 'music', 'pink', 'You sing or talk into it to sound louder.'),
  w('MON-EY', 'objects', 'green', 'Notes and coins you pay with in a shop.'),
  w('MOOSE', 'animals', 'brown', 'A huge forest animal with wide, flat antlers.'),
  w('MOTH', 'animals', 'orange', 'It flies at night and loves bright lights.'),
  w('MOUN-TAIN', 'nature', 'slate', 'Very high and rocky, often with snow on top.'),
  w('MOUSE', 'animals', 'brown', 'A small animal with a long tail that is scared of cats.'),
  w('MUSH-ROOM', 'nature', 'red', 'It grows in the forest and has a stalk and a cap.'),
  w('NAILS', 'tools', 'slate', 'You bang them into wood with a hammer.'),
  w('NEE-DLE', 'objects', 'pink', 'Thin and sharp, with a hole for thread, for sewing.'),
  w('NET', 'objects', 'amber', 'Fishermen catch fish with it.'),
  w('NOTE-BOOK', 'school', 'slate', 'A little book for writing important things down.'),
  w('OL-IVES', 'food', 'lime', 'Small green and black fruits that make oil.'),
  w('ON-ION', 'food', 'orange', 'Cutting this vegetable makes you cry.'),
  w('PEAR', 'food', 'lime', 'A juicy fruit, thin at the top and round at the bottom.'),
  w('PHONE', 'objects', 'slate', 'It rings and you say: hello!'),
  w('PINE-AP-PLE', 'food', 'yellow', 'A sweet fruit with prickly skin and a spiky green top.'),
  w('PIZ-ZA', 'food', 'red', 'A round flat bread with cheese and tomato on top.'),
  w('PLAS-TER', 'objects', 'orange', 'You stick it on a cut.'),
  w('PLATE', 'objects', 'blue', 'You put your dinner on it.'),
  w('POT', 'objects', 'slate', 'You cook soup in it.'),
  w('PUMP', 'tools', 'red', 'You blow up bike tyres with it.'),
  w('RA-DI-O', 'music', 'brown', 'It plays music and tells the news.'),
  w('RASP-BER-RIES', 'food', 'pink', 'Soft red berries that grow on bushes.'),
  w('RI-DER', 'people', 'green', 'A person riding a horse.'),
  w('RIV-ER', 'nature', 'sky', 'Water that flows through fields and towns to the sea.'),
  w('ROB-BER', 'people', 'slate', 'Someone who takes other people\'s things and runs off with a sack.'),
  w('RO-BOT', 'objects', 'slate', 'A machine that can move like a person.'),
  w('ROCK-ET', 'vehicles', 'red', 'It blasts off into space, up to the stars.'),
  w('SCIS-SORS', 'school', 'pink', 'You cut paper with them.'),
  w('SCOO-TER', 'vehicles', 'blue', 'Stand on it with one foot and push with the other.'),
  w('SCREEN', 'objects', 'slate', 'The computer shows its pictures on this.'),
  w('SEAL', 'animals', 'slate', 'A sea animal with flippers that likes lying on rocks.'),
  w('SHARK', 'animals', 'slate', 'A big sea fish with sharp teeth.'),
  w('SHED', 'places', 'brown', 'A little wooden hut for tools in the garden.'),
  w('SHELL', 'nature', 'amber', 'You find it on the beach. Hold it to your ear!'),
  w('SINK', 'objects', 'sky', 'You wash your hands and brush your teeth over it.'),
  w('SKATE', 'objects', 'sky', 'A boot with a blade for gliding on ice.'),
  w('SKATE-BOARD', 'objects', 'orange', 'A board on four wheels for rolling and jumping.'),
  w('SKIS', 'objects', 'sky', 'Two long boards for sliding down snowy hills.'),
  w('SLEDGE', 'objects', 'brown', 'You whizz down snowy hills on it.'),
  w('SLIDE', 'objects', 'red', 'Climb the steps and whoosh down in the playground.'),
  w('SNOW-MAN', 'objects', 'sky', 'Made of snow, with a carrot for a nose.'),
  w('SOCKS', 'objects', 'blue', 'You put them on your feet before your shoes.'),
  w('SPADE', 'tools', 'brown', 'You dig holes in the ground with it.'),
  w('SPAR-ROW', 'animals', 'brown', 'A small brown bird that chirps.'),
  w('SPIN-ACH', 'food', 'green', 'Green leaves full of vitamins.'),
  w('STREET', 'places', 'slate', 'A road in town where cars drive.'),
  w('STUMP', 'nature', 'brown', 'What is left in the ground when a tree is cut down.'),
  w('SUIT-CASE', 'objects', 'teal', 'You pack your clothes in it to go on holiday.'),
  w('SUN', 'nature', 'yellow', 'It shines in the sky and keeps us warm.'),
  w('SWAL-LOW', 'animals', 'indigo', 'A bird with a forked tail that nests under roofs.'),
  w('SWAN', 'animals', 'sky', 'A big white bird with a long curved neck.'),
  w('SWEET', 'food', 'pink', 'A little treat wrapped in shiny paper.'),
  w('SWING', 'objects', 'brown', 'You go back and forth on it in the playground.'),
  w('TENT', 'places', 'green', 'A house made of cloth that you sleep in when camping.'),
  w('THREAD', 'objects', 'blue', 'Long and thin, wound on a reel, for sewing.'),
  w('TI-GER', 'animals', 'orange', 'A big wild cat with black stripes.'),
  w('TOR-TOISE', 'animals', 'green', 'A slow animal that carries its house on its back.'),
  w('TRAC-TOR', 'vehicles', 'red', 'A strong vehicle with big wheels that works on the farm.'),
  w('TREE', 'nature', 'green', 'It has a trunk, branches and lots of leaves.'),
  w('TU-LIP', 'nature', 'red', 'A spring flower shaped like a cup.'),
  w('TUR-KEY', 'animals', 'brown', 'A big bird with a red wattle and a tail like a fan.'),
  w('U-FO', 'vehicles', 'indigo', 'A flying saucer from outer space.'),
  w('UM-BREL-LA', 'objects', 'blue', 'You open it to keep the rain off.'),
  w('VAC-UUM', 'objects', 'red', 'A noisy machine that sucks dust off the floor.'),
  w('VOL-CA-NO', 'nature', 'red', 'A mountain that pours out hot lava.'),
  w('WATCH', 'objects', 'indigo', 'You wear it on your wrist to tell the time.'),
  w('WA-TER-MEL-ON', 'food', 'green', 'A huge fruit, green outside and red and juicy inside.'),
  w('WHEEL-BAR-ROW', 'tools', 'brown', 'A cart with one wheel for carrying soil.'),
  w('WIN-DOW', 'objects', 'brown', 'Light comes into the room through it.'),
  w('WOLF', 'animals', 'slate', 'A wild animal that howls at the moon.'),
  w('YACHT', 'vehicles', 'sky', 'A boat with a sail that the wind pushes along.'),
  w('ZE-BRA', 'animals', 'slate', 'It looks like a horse with black and white stripes.')
];

/**
 * A fresh order for a tool that steps through words with ◀ ▶: easiest group
 * first, shuffled inside each group. Without the shuffle a child opening the
 * game met the same first word every single time.
 *
 * @param words   the pool
 * @param tierOf  how hard a word is - words with the same tier are mixed
 */
export const shuffledByTier = (words, tierOf) => {
  // Words a child may not be able to name (HARD_WORDS) come after all the rest.
  const keyed = words.map((word) => ({
    word,
    tier: tierOf(word) + (word.hard ? 1000 : 0),
    roll: Math.random()
  }));
  keyed.sort((a, b) => a.tier - b.tier || a.roll - b.roll);
  return keyed.map((entry) => entry.word);
};

// Every letter of the alphabet, so no letter on the board is certain to belong
// in the word just because it is unusual.
const SCRAMBLE_LETTERS = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');

const shuffleCopy = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Generates scrambled letter tiles for a word with exact extra distractor letters.
 * @param {string} word - Target word (e.g. "CAT")
 * @param {number} extraCount - Number of distractor letters
 * @returns {Array<{id: string, char: string, isExtra: boolean}>}
 */
export function generateScramble(word, extraCount = 2) {
  const upperWord = word.toUpperCase();
  const wordChars = upperWord.split('');

  // Never a letter the word already uses: a second A among the tiles would
  // look like a piece the child needs.
  const availableLetters = SCRAMBLE_LETTERS.filter(l => !wordChars.includes(l));
  const shuffledAvailable = shuffleCopy(availableLetters);
  const extraLetters = shuffledAvailable.slice(0, extraCount);

  // If word has almost all letters, fallback
  while (extraLetters.length < extraCount) {
    extraLetters.push(SCRAMBLE_LETTERS[Math.floor(Math.random() * SCRAMBLE_LETTERS.length)]);
  }

  // Create tile objects
  const tiles = [
    ...wordChars.map((char, index) => ({
      id: `tile-w-${index}-${char}-${Math.random().toString(36).substr(2, 4)}`,
      char,
      isExtra: false
    })),
    ...extraLetters.map((char, index) => ({
      id: `tile-e-${index}-${char}-${Math.random().toString(36).substr(2, 4)}`,
      char,
      isExtra: true
    }))
  ];

  // Fisher-Yates Shuffle
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  return tiles;
}
