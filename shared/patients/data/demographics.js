/**
 * Shared compact demographic profiles for New York City in 1896.
 *
 * `cityWeight` describes the broad city population only approximately.
 * `access` then models who is likely to reach an expensive private specialist.
 * The separation is load-bearing: a clinic waiting room is not a census.
 * Values are explicit calibration assumptions, not claims of individual traits.
 */

const commonEyes = ['#2a1a12', '#3b2618', '#4c3020', '#68452c'];
const darkHair = ['#090706', '#17100d', '#251610', '#3b2418'];

export const ORIGIN_PROFILES = [
  {
    id: 'old-stock-american', label: 'old-stock American', birthplace: null, cityWeight: 24,
    access: { elite: 1.9, affluent: 1.55, comfortable: 1.15, sponsored: 0.65 },
    generations: [[3, 7], [4, 3]], heritage: [0.01, 0.01, 0.98],
    givenNames: ['Alice', 'Anne', 'Caroline', 'Charlotte', 'Clara', 'Edith', 'Eleanor', 'Elizabeth', 'Frances', 'Helen', 'Julia', 'Margaret', 'Mary', 'Sarah'],
    maleGivenNames: ['Albert', 'Charles', 'Edward', 'Frederick', 'George', 'Henry', 'James', 'John', 'Robert', 'Samuel', 'Theodore', 'Thomas', 'William'],
    surnames: ['Astor', 'Blackwell', 'Caldwell', 'Davenport', 'Ellsworth', 'Hale', 'Livingston', 'Merritt', 'Ostrander', 'Parker', 'Prescott', 'Stuyvesant', 'Van Alen', 'Whitney'],
    religions: [['Episcopalian', 6], ['Presbyterian', 3], ['Methodist', 2], ['Unitarian', 1]],
    languages: [['English', 1]],
    skinTones: ['#e1b49a', '#d2a085', '#c58f70', '#b87e61'], hairColors: [...darkHair, '#553625', '#806044', '#9a7654'],
    eyeColors: [...commonEyes, '#52665c', '#3e5a48', '#496678', '#6f8791'],
  },
  {
    id: 'german-american', label: 'German American', birthplace: 'Germany', cityWeight: 22,
    access: { elite: 1.2, affluent: 1.25, comfortable: 1.05, sponsored: 0.75 },
    generations: [[1, 4], [2, 5], [3, 2]], heritage: [0.01, 0.01, 0.98],
    givenNames: ['Adelheid', 'Anna', 'Bertha', 'Clara', 'Elise', 'Emma', 'Frieda', 'Gertrude', 'Helene', 'Johanna', 'Louise', 'Martha', 'Wilhelmina'],
    maleGivenNames: ['August', 'Carl', 'Friedrich', 'Gustav', 'Heinrich', 'Herman', 'Johann', 'Karl', 'Otto', 'Wilhelm'],
    surnames: ['Bauer', 'Becker', 'Fischer', 'Hoffmann', 'Klein', 'Koch', 'Meyer', 'Müller', 'Schmidt', 'Schneider', 'Wagner', 'Weber'],
    religions: [['Lutheran', 6], ['Roman Catholic', 3], ['Jewish', 1]], languages: [['English', 5], ['German', 4], ['English and German', 3]],
    skinTones: ['#e1b49a', '#d2a085', '#c58f70', '#b87e61'], hairColors: [...darkHair, '#553625', '#806044', '#a47b53'],
    eyeColors: [...commonEyes, '#52665c', '#3e5a48', '#496678', '#6f8791'],
  },
  {
    id: 'irish-american', label: 'Irish American', birthplace: 'Ireland', cityWeight: 25,
    access: { elite: 0.65, affluent: 0.8, comfortable: 0.9, sponsored: 1.25 },
    generations: [[0, 3], [1, 5], [2, 5], [3, 1]], heritage: [0.01, 0.01, 0.98],
    givenNames: ['Bridget', 'Catherine', 'Ellen', 'Honora', 'Julia', 'Kate', 'Margaret', 'Mary', 'Nora', 'Rose', 'Sarah', 'Theresa'],
    maleGivenNames: ['Daniel', 'Dennis', 'Edward', 'Francis', 'Hugh', 'James', 'John', 'Michael', 'Patrick', 'Thomas', 'William'],
    surnames: ['Brennan', 'Byrne', 'Daly', 'Doyle', 'Kelly', 'Kennedy', 'Lynch', 'Mahoney', 'Murphy', 'O’Brien', 'Reilly', 'Sullivan'],
    religions: [['Roman Catholic', 9], ['Protestant', 1]], languages: [['English', 8], ['English and Irish', 1]],
    skinTones: ['#e1b49a', '#d2a085', '#c58f70', '#b87e61'], hairColors: [...darkHair, '#553625', '#7a3822', '#9b4b2f'],
    eyeColors: [...commonEyes, '#52665c', '#3e5a48', '#496678', '#6f8791'],
  },
  {
    id: 'ashkenazi-jewish', label: 'Ashkenazi Jewish', birthplace: 'Eastern Europe', cityWeight: 11,
    access: { elite: 0.8, affluent: 0.9, comfortable: 0.95, sponsored: 1.05 },
    generations: [[0, 2], [1, 6], [2, 2]], heritage: [0.01, 0.02, 0.97],
    givenNames: ['Anna', 'Bessie', 'Esther', 'Fannie', 'Ida', 'Leah', 'Lena', 'Miriam', 'Rebecca', 'Rose', 'Sarah', 'Sophie'],
    maleGivenNames: ['Abraham', 'David', 'Isaac', 'Jacob', 'Joseph', 'Louis', 'Morris', 'Samuel', 'Solomon'],
    surnames: ['Adler', 'Cohen', 'Friedman', 'Goldberg', 'Katz', 'Levine', 'Rosenberg', 'Shapiro', 'Stein', 'Weinberg', 'Wolf'],
    religions: [['Jewish', 1]], languages: [['Yiddish', 5], ['English and Yiddish', 5], ['German and Yiddish', 1]],
    skinTones: ['#d2a085', '#c58f70', '#b87e61', '#a96f55'], hairColors: [...darkHair, '#553625'], eyeColors: [...commonEyes, '#52665c'],
  },
  {
    id: 'italian', label: 'Italian immigrant', birthplace: 'Italy', cityWeight: 7,
    access: { elite: 0.45, affluent: 0.55, comfortable: 0.7, sponsored: 1.1 },
    generations: [[0, 4], [1, 5], [2, 1]], heritage: [0.01, 0.02, 0.97],
    givenNames: ['Angela', 'Antonia', 'Carmela', 'Caterina', 'Francesca', 'Giuseppina', 'Lucia', 'Maria', 'Rosa', 'Teresa'],
    maleGivenNames: ['Antonio', 'Carlo', 'Domenico', 'Francesco', 'Giovanni', 'Giuseppe', 'Luigi', 'Marco', 'Paolo', 'Salvatore'],
    surnames: ['Bianchi', 'Conti', 'De Luca', 'Esposito', 'Ferraro', 'Gallo', 'Greco', 'Marino', 'Ricci', 'Romano', 'Russo'],
    religions: [['Roman Catholic', 1]], languages: [['Italian', 5], ['English and Italian', 3], ['Sicilian', 2]],
    skinTones: ['#d2a085', '#c58f70', '#b87e61', '#a96f55'], hairColors: darkHair, eyeColors: commonEyes,
  },
  {
    id: 'african-american', label: 'African American', birthplace: null, cityWeight: 3,
    access: { elite: 0.45, affluent: 0.55, comfortable: 0.65, sponsored: 1.15 },
    generations: [[3, 4], [4, 4], [5, 2]], heritage: [0.78, 0.01, 0.21],
    givenNames: ['Ada', 'Alice', 'Charlotte', 'Elizabeth', 'Frances', 'Harriet', 'Josephine', 'Louisa', 'Mary', 'Sarah'],
    maleGivenNames: ['Benjamin', 'Charles', 'Frederick', 'George', 'Henry', 'Isaac', 'James', 'John', 'Samuel', 'Thomas', 'William'],
    surnames: ['Brown', 'Davis', 'Green', 'Harris', 'Jackson', 'Johnson', 'Robinson', 'Taylor', 'Walker', 'Williams'],
    religions: [['African Methodist Episcopal', 5], ['Baptist', 4], ['Episcopalian', 1]], languages: [['English', 1]],
    skinTones: ['#3f281f', '#543425', '#704632', '#8b5a40', '#a06a4d'], hairColors: ['#090706', '#0d0908', '#17100d'], eyeColors: ['#21150f', '#2a1a12', '#3b2618'],
  },
  {
    id: 'eastern-european', label: 'Eastern European immigrant', birthplace: 'Eastern Europe', cityWeight: 6,
    access: { elite: 0.55, affluent: 0.65, comfortable: 0.8, sponsored: 1.05 },
    generations: [[0, 4], [1, 5], [2, 1]], heritage: [0.01, 0.02, 0.97],
    givenNames: ['Aniela', 'Anna', 'Elena', 'Katarzyna', 'Magdalena', 'Maria', 'Natalia', 'Stefania', 'Zofia'],
    maleGivenNames: ['Aleksander', 'Andrei', 'Jan', 'Józef', 'Mikhail', 'Nikolai', 'Piotr', 'Stanisław', 'Viktor'],
    surnames: ['Dąbrowska', 'Kowalska', 'Lewandowska', 'Nowak', 'Petrova', 'Sokolova', 'Volkova', 'Zielińska'],
    religions: [['Roman Catholic', 5], ['Eastern Orthodox', 3], ['Jewish', 2]], languages: [['Polish', 4], ['Russian', 2], ['English and Polish', 2], ['Yiddish', 2]],
    skinTones: ['#e1b49a', '#d2a085', '#c58f70', '#b87e61'], hairColors: [...darkHair, '#553625'], eyeColors: [...commonEyes, '#52665c', '#496678'],
  },
  {
    id: 'chinese-american', label: 'Chinese American', birthplace: 'China', cityWeight: 0.7,
    access: { elite: 0.25, affluent: 0.3, comfortable: 0.45, sponsored: 0.9 },
    generations: [[0, 5], [1, 4], [2, 1]], heritage: [0.02, 0.9, 0.08],
    givenNames: ['Ah Fong', 'Ah Lin', 'Fang', 'Lan', 'Mei', 'Xiu', 'Ying'], surnames: ['Chan', 'Chen', 'Lee', 'Li', 'Liu', 'Wong', 'Wu'],
    maleGivenNames: ['Ah Sing', 'Ah Toy', 'Chun', 'Fook', 'Lee', 'Ming', 'Wing'],
    religions: [['Chinese folk religion', 5], ['Buddhist', 3], ['Christian', 1]], languages: [['Cantonese', 6], ['English and Cantonese', 3]],
    skinTones: ['#e0ae87', '#d09b76', '#b8835f', '#a87352'], hairColors: ['#090706', '#0d0908', '#17100d'], eyeColors: ['#21150f', '#2a1a12', '#3b2618'],
  },
];

export const RESIDENCES = {
  elite: ['Fifth Avenue', 'Gramercy Park', 'Washington Square', 'Murray Hill'],
  affluent: ['Upper West Side', 'Murray Hill', 'Chelsea', 'Brooklyn Heights', 'Gramercy'],
  comfortable: ['Yorkville', 'Harlem', 'Greenwich Village', 'Williamsburg', 'Lower East Side'],
  sponsored: ['Lower East Side', 'Five Points', 'Hell’s Kitchen', 'Harlem', 'Williamsburg'],
};

export function getOriginProfile(id) {
  const profile = ORIGIN_PROFILES.find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`Unknown patient origin profile: ${id}`);
  return profile;
}
