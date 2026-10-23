# Sprites txt

| Gen | Dex ID | Pokemon Name   | Hex 3-Bit mask |
|-----|--------|----------------|----------------|
| 01  | 0001   | _bulbasaur     | :fff           |
|     | 0003   | _venusaur-gmax | :0ff           |
| 02  | 0152   | _chikorita     | :fff           |

List that is used for to find the exact directories on github when pulling assets, the gen says which repo, and dex id says which folder it and the hex bit mask says which animations are available 

| Hex 3-Bit mask | physical | tap | idle |
|----------------|----------|-----|------|
| :fff           | f        | f   | f    |
| :0ff           | 0        | f   | f    |
| :fff           | f        | f   | f    |

The bits are the sum of the bit values

| Bit Value | Sprites     |
|-----------|-------------|
| 1         | Front       |
| 2         | back        |
| 4         | Front-Shiny |
| 8         | Back-Shiny  |

# Placement json

Relatively self-explanatory,list of pokemon's positions to make them seem right its because replaciting showdown's perspective is nearly impossible dynamically so a list is generated with positions to make the "perspective" of the sprites look correct
