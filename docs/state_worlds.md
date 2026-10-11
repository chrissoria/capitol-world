# State capitol worlds

Written 2026-10-10. California is built; this is what was done, what is left
for it, and how the other states could follow.

## What was done

The Capitol was the one world not written as a template: it was the default,
with Congress's addresses, names and buildings written in. It is now an
instance of "a legislature", and California is a second one.

- `src/data/load.ts` reads a legislature's files from a `Source` (a folder
  address and a few facts about it). Congress's is the default.
- `WorldDef.legislature` holds what a legislature calls its houses, its
  periods, its members and its official site, and the panel, the Stats tab and
  the roster take their words from it. Capitol World's are the ones it always
  had, so it reads exactly as before.
- `buildLayout(committees, plan)` takes the buildings across the top and the
  names of the shared ones from a `Plan`, and sets committees closer when a
  house has more than 24.
- "House" and "Senate" stayed as the names of the two wings in data and code.
  A state's lower house fills the House wing. Nothing on screen says so.
- `src/worlds/california.ts` is the whole of California: about 250 lines, most
  of them the notes on what each building does.

Each further state is a file like that one and data in the same shapes.

## Left to do for California

- Committee hearings. The dataset has every hearing a bill was set for, by day
  but with no time of day, so they are not shown as meetings yet. With the
  day's committee votes they could be: "AB 679: do pass, 10 to 3".
- Chairs and leadership. Not in the Legislature's export. The Assembly's and
  Senate's own sites have them.
- Photographs and contact details for members, likewise.
- The whole-session replay. Every move of every bill is in the history, so a
  session could be played from its first day; the map file would need the
  moves, which it leaves out today to stay small.
- A building of its own for the Governor's Office (it is a plain hall now),
  and California signs of the times on the lawns.
- The roster says "active bills" in a finished session, as it does for a
  finished Congress.

## Every other state

The definition is quick. The data is not: each state publishes its own way.
Two routes, to be chosen per state:

- the state's own export, as here (best where one exists; California, and to
  be checked: New York, Texas, Florida, Washington);
- Open States (Plural), which holds all fifty in one shape. To be checked
  before relying on it: its licence, its bulk downloads, and how current its
  roll calls are.

Either way the target is the seven tables `california-bills` has, so the
snapshot script and the app do not care which state they are reading.
