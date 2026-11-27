// The word bank behind every picture game: Rozsypanka, Sylaby, Pierwsza głoska
// and the picture mode of Pary liter.
//
// Each word has a drawing in src/assets/pictures/words/, found by the word's
// `id` - its spelling folded to ASCII (ŻÓŁW -> zolw.webp). The drawings are
// made by `node build_pictures.cjs <folder>`, which also checks that every word
// here has a picture and every picture a word.
//
// The word is the answer to the picture, so it names exactly what is drawn,
// including how many: two boots are BUTY, one sock would be a SKARPETA.
//
// This file imports nothing, on purpose: build_pictures.cjs loads it with Node.

export const wordsCategories = [
  { id: 'all', name: 'Wszystkie', icon: '🌟' },
  { id: 'animals', name: 'Zwierzęta', icon: '🐾' },
  { id: 'food', name: 'Jedzenie', icon: '🍎' },
  { id: 'objects', name: 'Przedmioty', icon: '🧸' },
  { id: 'nature', name: 'Przyroda', icon: '🌳' },
  { id: 'vehicles', name: 'Pojazdy', icon: '🚗' },
  { id: 'people', name: 'Ludzie', icon: '🧑' },
  { id: 'body', name: 'Ciało', icon: '✋' },
  { id: 'places', name: 'Miejsca', icon: '🏠' },
  { id: 'school', name: 'Szkoła', icon: '✏️' },
  { id: 'music', name: 'Muzyka', icon: '🎵' },
  { id: 'tools', name: 'Narzędzia', icon: '🔨' }
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

const FOLD = { Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z' };

// ŻÓŁW -> zolw. The same fold build_pictures.cjs applies to a file name.
export const slugOf = (word) =>
  word
    .toUpperCase()
    .replace(/[ĄĆĘŁŃÓŚŹŻ]/g, (c) => FOLD[c])
    .toLowerCase();

// Two letters that are one sound at the start of a word.
const DIGRAPHS = ['CH', 'CZ', 'DZ', 'DŻ', 'DŹ', 'RZ', 'SZ'];

/**
 * The sound a word starts with, as it is written - or null where the first
 * sound has no letter of its own to show.
 *
 * That is the soft sounds spelt with an I: SIEĆ starts with the sound Ś, NICI
 * with Ń, DZIK with DŹ. Asking a child for the first sound of "sieć" and then
 * marking S right would teach the wrong sound, and marking Ś right contradicts
 * the spelling they will meet later, so those words are simply not asked about
 * their first sound. They still appear everywhere a question is about letters.
 */
const firstSoundOf = (word) => {
  if (/^(DZ|S|C|Z|N)I/.test(word)) return null;
  const two = word.slice(0, 2);
  return DIGRAPHS.includes(two) ? two : word[0];
};

// Different spellings of one sound: ósemka and ul start alike, and so do
// chleb and hak, rzeka and żaba.
const SAME_SOUND = { Ó: 'U', CH: 'H', RZ: 'Ż' };
const soundKey = (sound) => SAME_SOUND[sound] || sound;

/**
 * Whether two first sounds are too close to sit on opposite sides of a
 * question: the same sound spelt differently (H and CH), or the same first
 * letter (C and CZ - a child shown the letter C may fairly point at a czapka).
 */
export const soundsClash = (a, b) => !!a && !!b && (soundKey(a) === soundKey(b) || a[0] === b[0]);

// Words a pre-reader may not know, or whose picture they will likely name as
// something else (a rider on a horse is "koń", a foal is "konik", a notebook
// could be either DZIENNIK or NOTES). With no voice and the word hidden until
// "Brawo", the child has to name the picture unaided, so these wait for the
// hardest setting of Pierwsza głoska and come last in Słowa and Sylaby.
const HARD_WORDS = new Set([
  'ĆMA', 'CYRKIEL', 'DZIENNIK', 'DŻIN', 'DŻOKEJ', 'EKIERKA', 'EKRAN', 'EKSPRES', 'EURO', 'IGŁA',
  'IMADŁO', 'IMBIR', 'JEŹDZIEC', 'NOGA', 'NOTES', 'RZEMYK', 'TELEFON', 'ŹREBAK'
]);

// Pictures a child can take for one another. Never offered side by side, or a
// child who taps the rider for K is marked wrong.
const PICTURE_GROUPS = [
  ['KOŃ', 'JEŹDZIEC', 'ŹREBAK', 'DŻOKEJ'],
  ['MOTYL', 'ĆMA'],
  ['NOGA', 'BUTY'],
  ['DZIENNIK', 'NOTES']
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

// Syllables follow the way a word is clapped out at przedszkole: a consonant
// pair in the middle of a word is split (LAM-PA, CZAP-KA), unless the second
// one is L, Ł or R after a stop, which start a syllable together (TY-GRYS,
// CE-GŁA, E-KRAN).
export const wordsData = [
  w('A-KOR-DE-ON', 'music', 'red', 'Instrument z klawiszami i miechem, który się rozciąga.'),
  w('A-NA-NAS', 'food', 'yellow', 'Słodki owoc z kolczastą skórką i zielonym pióropuszem.'),
  w('AR-BUZ', 'food', 'green', 'Wielki owoc, zielony z wierzchu i czerwony w środku.'),
  w('AR-MA-TA', 'objects', 'slate', 'Wielka lufa na kołach, która strzela kulami.'),
  w('AU-TO-BUS', 'vehicles', 'lime', 'Długi pojazd, który wozi wielu pasażerów po mieście.'),
  w('A-WO-KA-DO', 'food', 'green', 'Zielony owoc z wielką pestką w środku.'),
  w('BA-LO-NIK', 'objects', 'red', 'Dmuchana zabawka na sznurku, która leci do góry.'),
  w('BA-NAN', 'food', 'yellow', 'Żółty, podłużny owoc, przysmak małpek.'),
  w('BAŁ-WAN', 'objects', 'sky', 'Ulepiony ze śniegu, ma nos z marchewki.'),
  w('BOMB-KA', 'objects', 'blue', 'Błyszcząca ozdoba, którą wieszamy na choince.'),
  w('BU-RAK', 'food', 'pink', 'Ciemnoczerwone warzywo, z którego gotuje się barszcz.'),
  w('BU-TY', 'objects', 'brown', 'Zakładamy je na nogi, zanim wyjdziemy z domu.'),
  w('CE-BU-LA', 'food', 'orange', 'Warzywo, przy którego krojeniu lecą łzy.'),
  w('CE-GŁA', 'objects', 'orange', 'Czerwony klocek, z którego buduje się domy.'),
  w('CHLEB', 'food', 'amber', 'Pieczywo z chrupiącą skórką prosto z piekarni.'),
  w('CHO-IN-KA', 'nature', 'green', 'Zielone drzewko, które w grudniu stroimy bombkami.'),
  w('CHO-MIK', 'animals', 'orange', 'Mały gryzoń, który chowa jedzenie w policzkach.'),
  w('CHUS-TA', 'objects', 'red', 'Kawałek materiału, który wiąże się na głowie lub szyi.'),
  w('CU-KIE-REK', 'food', 'pink', 'Słodki smakołyk zawinięty w papierek.'),
  w('CYRK', 'places', 'red', 'Wielki namiot, w którym występują klauni i akrobaci.'),
  w('CYR-KIEL', 'school', 'slate', 'Przyrząd, którym rysuje się równe kółka.'),
  w('CY-TRY-NA', 'food', 'yellow', 'Bardzo kwaśny, żółty owoc.'),
  w('CZAJ-NIK', 'objects', 'red', 'Gotuje się w nim wodę na herbatę.'),
  w('CZAP-KA', 'objects', 'teal', 'Zakładamy ją na głowę, kiedy jest zimno.'),
  w('CZE-KO-LA-DA', 'food', 'brown', 'Słodka brązowa tabliczka z kakao.'),
  w('DEL-FIN', 'animals', 'sky', 'Mądry morski ssak, który wyskakuje nad fale.'),
  w('DES-KO-ROL-KA', 'objects', 'orange', 'Deska na czterech kółkach do jeżdżenia i skakania.'),
  w('DI-NO-ZAUR', 'animals', 'lime', 'Wielki gad, który żył na Ziemi bardzo dawno temu.'),
  w('DOM', 'places', 'red', 'Mieszkamy w nim razem z rodziną.'),
  w('DRA-BI-NA', 'tools', 'brown', 'Ma szczeble, po których wchodzi się wysoko.'),
  w('DRZE-WO', 'nature', 'green', 'Ma pień, gałęzie i zieloną koronę z liści.'),
  w('DZIA-DEK', 'people', 'teal', 'Tata mamy albo taty.'),
  w('DZIEN-NIK', 'school', 'blue', 'Zeszyt, w którym zapisuje się, co się wydarzyło.'),
  w('DZIK', 'animals', 'brown', 'Dziki kuzyn świni, który mieszka w lesie.'),
  w('DZWO-NEK', 'music', 'amber', 'Kiedy nim potrząsasz, robi dzyń, dzyń.'),
  w('DŹWIG', 'vehicles', 'yellow', 'Wielka maszyna, która podnosi ciężary na budowie.'),
  w('MI-KRO-FON', 'music', 'pink', 'Mówi się albo śpiewa do niego, żeby było głośniej.'),
  w('DŻEM', 'food', 'red', 'Słodki przysmak z owoców w słoiku, do smarowania chleba.'),
  w('DŻIN', 'people', 'purple', 'Wychodzi z lampy i spełnia trzy życzenia.'),
  w('DŻO-KEJ', 'people', 'purple', 'Jeździec, który ściga się na koniu.'),
  w('E-KIER-KA', 'school', 'sky', 'Trójkątna linijka do rysowania prostych kątów.'),
  w('E-KRAN', 'objects', 'slate', 'Na nim wyświetla się obraz z komputera.'),
  w('EKS-PRES', 'objects', 'slate', 'Maszyna, która parzy kawę.'),
  w('E-LEK-TRYK', 'people', 'blue', 'Naprawia gniazdka, kable i światło.'),
  w('ES-KI-MOS', 'people', 'brown', 'Mieszkaniec mroźnej północy w ciepłym futrze.'),
  w('EU-RO', 'objects', 'amber', 'Pieniądz, którym płaci się w wielu krajach Europy.'),
  w('FAR-TUCH', 'objects', 'pink', 'Zakładamy go do gotowania, żeby się nie pobrudzić.'),
  w('FI-GI', 'food', 'purple', 'Słodkie fioletowe owoce z mnóstwem drobnych pestek.'),
  w('FLA-GA', 'objects', 'red', 'Biało-czerwona, powiewa na maszcie.'),
  w('FO-KA', 'animals', 'slate', 'Morskie zwierzę z płetwami, które lubi leżeć na brzegu.'),
  w('FO-TEL', 'objects', 'green', 'Miękkie, wygodne siedzisko z oparciem.'),
  w('FRYT-KI', 'food', 'yellow', 'Chrupiące paski smażonych ziemniaków.'),
  w('GAR-NEK', 'objects', 'slate', 'Gotuje się w nim zupę.'),
  w('GA-ŁĄŹ', 'nature', 'lime', 'Wyrasta z pnia drzewa i ma na sobie liście.'),
  w('GI-TA-RA', 'music', 'brown', 'Instrument ze strunami, które szarpie się palcami.'),
  w('GLO-BUS', 'school', 'sky', 'Okrągła mapa całej Ziemi, którą można obracać.'),
  w('GO-RYL', 'animals', 'slate', 'Największa i najsilniejsza z małp.'),
  w('GRUSZ-KA', 'food', 'lime', 'Soczysty owoc, wąski u góry i szeroki na dole.'),
  w('GRZYB', 'nature', 'red', 'Rośnie w lesie, ma nóżkę i kapelusz.'),
  w('GU-ZIK', 'objects', 'brown', 'Mały krążek z dziurkami do zapinania ubrań.'),
  w('GWOŹ-DZIE', 'tools', 'slate', 'Wbija się je młotkiem w deskę.'),
  w('GÓ-RA', 'nature', 'slate', 'Bardzo wysoka i skalista, na szczycie często leży śnieg.'),
  w('GĘŚ', 'animals', 'amber', 'Duży ptak z długą szyją, który głośno gęga.'),
  w('HAK', 'tools', 'yellow', 'Zagięty kawałek metalu do zaczepiania i podnoszenia.'),
  w('HA-MAK', 'objects', 'red', 'Wisi między dwoma drzewami i można się w nim bujać.'),
  w('HE-LI-KOP-TER', 'vehicles', 'red', 'Lata dzięki wielkiemu śmigłu na dachu.'),
  w('HI-PO-PO-TAM', 'animals', 'purple', 'Wielkie, grube zwierzę, które lubi siedzieć w wodzie.'),
  w('HU-LAJ-NO-GA', 'vehicles', 'blue', 'Stoisz na niej jedną nogą, a drugą się odpychasz.'),
  w('HUŚ-TAW-KA', 'objects', 'brown', 'Bujasz się na niej na placu zabaw.'),
  w('I-GLO', 'places', 'sky', 'Domek zbudowany z bloków śniegu.'),
  w('I-GŁA', 'objects', 'pink', 'Cienka i ostra, z uszkiem na nitkę, służy do szycia.'),
  w('I-MA-DŁO', 'tools', 'red', 'Narzędzie, które mocno ściska i trzyma przedmioty.'),
  w('IM-BIR', 'food', 'amber', 'Ostry w smaku korzeń, dodawany do herbaty i pierników.'),
  w('IN-DIA-NIN', 'people', 'orange', 'Nosi pióropusz i mieszka w namiocie tipi.'),
  w('IN-DYK', 'animals', 'brown', 'Duży ptak z czerwonym koralem i ogonem jak wachlarz.'),
  w('JABŁ-KO', 'food', 'red', 'Okrągły, soczysty owoc, który rośnie na jabłoni.'),
  w('JA-BŁOŃ', 'nature', 'green', 'Drzewo, na którym rosną jabłka.'),
  w('JA-GO-DY', 'food', 'indigo', 'Małe granatowe owoce, które rosną w lesie.'),
  w('JAJ-KO', 'food', 'orange', 'Znosi je kura, a w środku ma żółtko.'),
  w('JA-RZĘ-BI-NA', 'nature', 'orange', 'Czerwone koraliki, które jesienią rosną na drzewie.'),
  w('JAS-KÓŁ-KA', 'animals', 'indigo', 'Ptak z rozwidlonym ogonem, który lepi gniazda pod dachem.'),
  w('JE-LEŃ', 'animals', 'brown', 'Leśne zwierzę z wielkim, rozłożystym porożem.'),
  w('JEŹ-DZIEC', 'people', 'green', 'Człowiek, który jedzie na koniu.'),
  w('JEŻ', 'animals', 'brown', 'Małe zwierzątko, które ma kolce na grzbiecie.'),
  w('KACZ-KA', 'animals', 'green', 'Ptak, który pływa po stawie i robi kwa, kwa.'),
  w('KA-RET-KA', 'vehicles', 'red', 'Samochód na sygnale, który wiezie chorych do szpitala.'),
  w('KASK', 'objects', 'red', 'Twarda czapka, która chroni głowę.'),
  w('KO-NEW-KA', 'tools', 'sky', 'Podlewa się nią kwiaty w ogrodzie.'),
  w('KOT', 'animals', 'slate', 'Mruczy, miauczy i łapie myszy.'),
  w('KOŃ', 'animals', 'brown', 'Ma grzywę i kopyta, rży i szybko galopuje.'),
  w('KOŚĆ', 'objects', 'amber', 'Przysmak każdego psa.'),
  w('KRO-WA', 'animals', 'slate', 'Robi muu i daje mleko.'),
  w('LAM-PA', 'objects', 'yellow', 'Świeci w pokoju, kiedy robi się ciemno.'),
  w('LE-ŻAK', 'objects', 'blue', 'Składane siedzisko do odpoczywania na plaży.'),
  w('LIST', 'objects', 'red', 'Wkłada się go do koperty i wysyła pocztą.'),
  w('LIŚĆ', 'nature', 'orange', 'Rośnie na gałęzi, a jesienią spada z drzewa.'),
  w('LO-DY', 'food', 'pink', 'Zimny, słodki deser w wafelku.'),
  w('LOR-NET-KA', 'objects', 'slate', 'Patrzysz przez nią i widzisz z bliska to, co daleko.'),
  w('LU-PA', 'school', 'amber', 'Szkło, które powiększa małe rzeczy.'),
  w('MA-LI-NY', 'food', 'pink', 'Słodkie różowe owoce, które rosną na krzaczkach.'),
  w('MA-PA', 'school', 'amber', 'Rysunek, który pokazuje drogi, miasta i kraje.'),
  w('MAR-CHEW-KA', 'food', 'orange', 'Pomarańczowe warzywo, przysmak królika.'),
  w('MO-TYL', 'animals', 'orange', 'Owad z kolorowymi skrzydłami, który lata nad kwiatami.'),
  w('MRÓW-KA', 'animals', 'slate', 'Malutki, pracowity owad, który mieszka w mrowisku.'),
  w('MUSZ-LA', 'nature', 'amber', 'Znajdziesz ją na plaży, a w środku szumi morze.'),
  w('MYSZ', 'animals', 'brown', 'Mały gryzoń z długim ogonkiem, który boi się kota.'),
  w('MĄ-KA', 'food', 'amber', 'Biały proszek, z którego piecze się chleb i ciasto.'),
  w('NA-MIOT', 'places', 'green', 'Domek z materiału, w którym śpi się na biwaku.'),
  w('NAR-TY', 'objects', 'sky', 'Dwie długie deski do zjeżdżania po śniegu.'),
  w('NI-CI', 'objects', 'blue', 'Cienkie i długie, nawinięte na szpulkę, do szycia.'),
  w('NIE-DŹWIEDŹ', 'animals', 'brown', 'Wielki, silny zwierz, który zimą śpi w gawrze.'),
  w('NO-GA', 'body', 'brown', 'Masz dwie i dzięki nim chodzisz, biegasz i skaczesz.'),
  w('NO-TES', 'school', 'slate', 'Mały zeszyt do zapisywania ważnych rzeczy.'),
  w('NO-ŻYCZ-KI', 'school', 'pink', 'Tnie się nimi papier.'),
  w('OD-KU-RZACZ', 'objects', 'red', 'Głośna maszyna, która wciąga kurz z podłogi.'),
  w('OG-NIS-KO', 'nature', 'orange', 'Pali się na polanie i można przy nim piec kiełbaski.'),
  w('O-GÓ-REK', 'food', 'green', 'Zielone, podłużne warzywo, dobre na kanapkę.'),
  w('OK-NO', 'objects', 'brown', 'Przez nie wpada do pokoju światło.'),
  w('O-KU-LA-RY', 'objects', 'sky', 'Nosi się je na nosie, żeby lepiej widzieć.'),
  w('O-LIW-KI', 'food', 'lime', 'Małe zielone i czarne owoce, z których robi się oliwę.'),
  w('PA-RA-SOL', 'objects', 'blue', 'Rozkładasz go, żeby schować się przed deszczem albo słońcem.'),
  w('PIE-NIĄ-DZE', 'objects', 'green', 'Banknoty i monety, którymi płaci się w sklepie.'),
  w('PIES', 'animals', 'amber', 'Szczeka, merda ogonem i jest przyjacielem człowieka.'),
  w('PIEŃ', 'nature', 'brown', 'Gruba część drzewa pokryta korą, w środku ma słoje.'),
  w('PIZ-ZA', 'food', 'red', 'Okrągły włoski placek z serem i sosem pomidorowym.'),
  w('PIÓR-KO', 'nature', 'teal', 'Lekkie jak puch, zgubił je ptak.'),
  w('PIÓR-NIK', 'school', 'blue', 'Trzymasz w nim kredki, ołówki i gumkę.'),
  w('PIŁ-KA', 'objects', 'red', 'Okrągła zabawka do rzucania, kopania i odbijania.'),
  w('PLAS-TER', 'objects', 'orange', 'Nakleja się go na skaleczenie.'),
  w('POMP-KA', 'tools', 'red', 'Pompuje się nią koła w rowerze.'),
  w('PĄ-CZEK', 'food', 'amber', 'Okrągłe słodkie ciastko z nadzieniem w środku.'),
  w('RA-DIO', 'music', 'brown', 'Gra muzykę i mówi wiadomości.'),
  w('RA-KIE-TA', 'vehicles', 'red', 'Leci w kosmos, aż do gwiazd.'),
  w('RE-KIN', 'animals', 'slate', 'Groźna morska ryba z ostrymi zębami.'),
  w('RO-BOT', 'objects', 'slate', 'Maszyna, która potrafi ruszać się jak człowiek.'),
  w('RO-GA-LIK', 'food', 'amber', 'Wygięte, chrupiące pieczywo w kształcie księżyca.'),
  w('RO-WER', 'vehicles', 'blue', 'Ma dwa koła, pedały i dzwonek.'),
  w('RY-BA', 'animals', 'teal', 'Pływa w wodzie, ma płetwy i łuski.'),
  w('RZE-KA', 'nature', 'sky', 'Woda, która płynie przez łąki i miasta aż do morza.'),
  w('RZE-MYK', 'objects', 'brown', 'Cienki skórzany pasek do wiązania.'),
  w('RZEŹ-BA', 'objects', 'slate', 'Postać wykuta z kamienia przez artystę.'),
  w('RĘ-KA', 'body', 'orange', 'Ma pięć palców, a ty masz dwie takie.'),
  w('SA-MO-CHÓD', 'vehicles', 'blue', 'Pojazd na czterech kołach z kierownicą i silnikiem.'),
  w('SAN-KI', 'objects', 'brown', 'Zjeżdża się na nich zimą z górki.'),
  w('SER', 'food', 'yellow', 'Żółty, z dziurami, robi się go z mleka.'),
  w('SIEĆ', 'objects', 'amber', 'Rybak łowi nią ryby.'),
  w('SKAR-PE-TY', 'objects', 'blue', 'Zakładasz je na stopy, zanim włożysz buty.'),
  w('SU-SZAR-KA', 'objects', 'orange', 'Dmucha ciepłym powietrzem i suszy mokre włosy.'),
  w('SZO-PA', 'places', 'brown', 'Mały drewniany domek na narzędzia i drewno.'),
  w('SZPI-NAK', 'food', 'green', 'Zielone liście pełne witamin.'),
  w('SZU-FLA-DA', 'objects', 'brown', 'Wysuwa się ją z szafki i chowa w niej różne rzeczy.'),
  w('SŁOŃ-CE', 'nature', 'yellow', 'Świeci na niebie i daje nam światło i ciepło.'),
  w('SŁOŃ', 'animals', 'slate', 'Olbrzym z długą trąbą i wielkimi uszami.'),
  w('TACZ-KA', 'tools', 'brown', 'Wózek z jednym kołem do wożenia ziemi.'),
  w('TA-LERZ', 'objects', 'blue', 'Nakłada się na niego obiad.'),
  w('TE-LE-FON', 'objects', 'slate', 'Dzwoni, a ty mówisz do słuchawki: halo!'),
  w('TRAK-TOR', 'vehicles', 'red', 'Silny pojazd z wielkimi kołami, który pracuje w polu.'),
  w('TU-LI-PAN', 'nature', 'red', 'Wiosenny kwiat w kształcie kielicha.'),
  w('TY-GRYS', 'animals', 'orange', 'Wielki dziki kot w czarne paski.'),
  w('U-CZEŃ', 'people', 'indigo', 'Chłopiec, który chodzi do szkoły i odrabia lekcje.'),
  w('U-FO', 'vehicles', 'indigo', 'Latający talerz z kosmosu.'),
  w('UL', 'objects', 'amber', 'Domek, w którym mieszkają pszczoły i robią miód.'),
  w('U-LI-CA', 'places', 'slate', 'Droga w mieście, po której jeżdżą samochody.'),
  w('U-MY-WAL-KA', 'objects', 'sky', 'Myjesz nad nią ręce i zęby.'),
  w('US-TA', 'body', 'red', 'Nimi mówisz, jesz i się uśmiechasz.'),
  w('WA-LIZ-KA', 'objects', 'teal', 'Pakujesz do niej ubrania, kiedy jedziesz w podróż.'),
  w('WAN-NA', 'objects', 'sky', 'Nalewasz do niej wody i bierzesz kąpiel.'),
  w('WI-DE-LEC', 'objects', 'purple', 'Ma ząbki i nabija się na niego jedzenie.'),
  w('WIER-TAR-KA', 'tools', 'green', 'Narzędzie, które wierci dziury w ścianie.'),
  w('WILK', 'animals', 'slate', 'Leśny drapieżnik, który wyje do księżyca.'),
  w('WRÓ-BEL', 'animals', 'brown', 'Mały szarobrązowy ptaszek, który ćwierka.'),
  w('WUL-KAN', 'nature', 'red', 'Góra, z której wypływa gorąca lawa.'),
  w('WĘD-KA', 'objects', 'brown', 'Długi kij z żyłką i haczykiem do łowienia ryb.'),
  w('ZA-JĄC', 'animals', 'amber', 'Ma długie uszy i szybko kica po polu.'),
  w('ZA-MEK', 'places', 'blue', 'Wielka budowla z wieżami, w której mieszka król.'),
  w('ZE-BRA', 'animals', 'slate', 'Wygląda jak koń w czarno-białe paski.'),
  w('ZE-GA-REK', 'objects', 'indigo', 'Nosi się go na ręce i pokazuje godzinę.'),
  w('ZJEŻ-DŻAL-NIA', 'objects', 'red', 'Wchodzisz po drabince i zjeżdżasz w dół na placu zabaw.'),
  w('ZŁO-DZIEJ', 'people', 'slate', 'Zabiera cudze rzeczy i ucieka z workiem.'),
  w('Ó-SEM-KA', 'objects', 'sky', 'Cyfra, która wygląda jak dwa kółka, jedno na drugim.'),
  w('ĆMA', 'animals', 'orange', 'Nocny motyl, który leci do światła.'),
  w('ŁA-BĘDŹ', 'animals', 'sky', 'Duży biały ptak z długą, wygiętą szyją.'),
  w('ŁAW-KA', 'school', 'brown', 'Siada się na niej w parku, żeby odpocząć.'),
  w('ŁO-PA-TA', 'tools', 'brown', 'Kopie się nią dołki w ziemi.'),
  w('ŁOŚ', 'animals', 'brown', 'Wielki leśny zwierz z rogami jak łopaty.'),
  w('ŁYŻ-WA', 'objects', 'sky', 'But z ostrzem do jazdy po lodzie.'),
  w('ŁÓD-KA', 'vehicles', 'brown', 'Pływa się nią po jeziorze, machając wiosłami.'),
  w('ŚRU-BA', 'tools', 'teal', 'Metalowy trzpień z gwintem, na który nakręca się nakrętkę.'),
  w('ŚWIECZ-KA', 'objects', 'yellow', 'Pali się małym płomykiem i daje światło.'),
  w('ŹRE-BAK', 'animals', 'brown', 'Dziecko konia.'),
  w('O-CZY', 'body', 'blue', 'Masz dwoje i nimi patrzysz.'),
  w('ŻA-BA', 'animals', 'green', 'Zielona, skacze i kumka nad stawem.'),
  w('ŻA-GLÓW-KA', 'vehicles', 'sky', 'Łódka z żaglem, którą popycha wiatr.'),
  w('ŻO-ŁĘ-DZIE', 'nature', 'brown', 'Owoce dębu w małych czapeczkach.'),
  w('ŻUBR', 'animals', 'brown', 'Największe zwierzę polskiej puszczy, kuzyn bizona.'),
  w('ŻY-RA-FA', 'animals', 'amber', 'Najwyższe zwierzę, z bardzo długą szyją.'),
  w('ŻÓŁW', 'animals', 'green', 'Powolne zwierzę, które nosi swój domek na grzbiecie.')
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

// Every letter of the Polish alphabet. The accented ones used to be missing,
// so any Ł or Ż on the board was certain to belong in the word.
const SCRAMBLE_LETTERS = Array.from('AĄBCĆDEĘFGHIJKLŁMNŃOÓPRSŚTUWYZŹŻ');

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
 * @param {string} word - Target word (e.g. "KOT")
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
