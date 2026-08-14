# Landmark information cards

Landmark clicks use deterministic, authored location text and optional live
Wikipedia data. The simulation does not ask Wikipedia to decide what a
building is or where it stands.

The street scene is geographically compressed. `landmarkLocation` therefore
names the nearest historical cross streets rather than claiming a survey-precise
address. Wikipedia mappings are intentionally conservative: buildings without
an article about the structure itself remain location-only cards.

## Current Wikipedia mappings

| Scene landmark | Wikipedia title | Note |
| --- | --- | --- |
| New Netherland Hotel | `Hotel New Netherland` | Article describes the hotel represented in 1896. |
| The Plaza Hotel (1890) | `Plaza Hotel` | Article covers both hotels on the site. The card explicitly says that the scene shows the first hotel, completed in 1890. |
| Metropolitan Club | `Metropolitan Club (New York City)` | Article describes the surviving 1894 clubhouse. |
| Cornelius Vanderbilt II Mansion | `Cornelius Vanderbilt II House` | Wikipedia uses “House” in the title. |
| Elbridge T. Gerry Mansion | `Elbridge T. Gerry Mansion` | Article describes the 1895 house. |
| The Dairy | `The Dairy` | Article describes Vaux's 1871 building. |
| Central Park Carousel (1871) | `Central Park Carousel` | Article covers the successive carousels on the site; the card says that the game depicts the original. |
| The Arsenal | `Arsenal (Central Park)` | Article describes the 1851 building at Fifth Avenue and 64th Street. |
| The Pond and Hallett Peninsula | `The Pond and Hallett Nature Sanctuary` | Article covers both landscape features; the card uses the nineteenth-century peninsula name. |
| Gapstow Bridge | `The Pond and Hallett Nature Sanctuary` | No separate bridge article exists, so the card identifies the article as landscape context. |
| Central Park Menagerie | `Central Park Zoo` | The card says that the scene depicts the nineteenth-century predecessor of the modern zoo. |
| Fifth Avenue Plaza (later Grand Army Plaza) | `Grand Army Plaza (Manhattan)` | The scene predates the plaza's 1916 completion, which the card states explicitly. |

Hotel Savoy, the Bolkenhayn Apartments, Marble Row, the Collis P. Huntington
Mansion, and Navarro Flats currently have no exact article mapping. For example,
the `Savoy-Plaza Hotel` article opens by describing the 1927 successor, so using
its lead extract for the 1892 Savoy would be misleading.

The client queries the MediaWiki Action API for two plain-text lead sentences,
a canonical page URL, and a freely licensed PageImages thumbnail. Results are
presentation data only and fail back to the authored landmark name and location.

Sources:

- [MediaWiki example combining extracts and PageImages](https://www.mediawiki.org/wiki/API:Page_info_in_search_results)
- [MediaWiki PageImages API](https://www.mediawiki.org/wiki/Extension:PageImages#API)
- [Hotel New Netherland](https://en.wikipedia.org/wiki/Hotel_New_Netherland)
- [Plaza Hotel](https://en.wikipedia.org/wiki/Plaza_Hotel)
- [Metropolitan Club](https://en.wikipedia.org/wiki/Metropolitan_Club_(New_York_City))
- [Cornelius Vanderbilt II House](https://en.wikipedia.org/wiki/Cornelius_Vanderbilt_II_House)
- [Elbridge T. Gerry Mansion](https://en.wikipedia.org/wiki/Elbridge_T._Gerry_Mansion)
- [The Dairy](https://en.wikipedia.org/wiki/The_Dairy)
- [Central Park Carousel](https://en.wikipedia.org/wiki/Central_Park_Carousel)
- [Arsenal (Central Park)](https://en.wikipedia.org/wiki/Arsenal_(Central_Park))
- [The Pond and Hallett Nature Sanctuary](https://en.wikipedia.org/wiki/The_Pond_and_Hallett_Nature_Sanctuary)
- [Central Park Zoo](https://en.wikipedia.org/wiki/Central_Park_Zoo)
- [Grand Army Plaza (Manhattan)](https://en.wikipedia.org/wiki/Grand_Army_Plaza_(Manhattan))
