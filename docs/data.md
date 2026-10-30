
# Sprites

## Bit mask

List that is used for to find the exact directories on github when pulling assets, the gen says which repo, and dex id says which folder it and the hex bit mask says which animations are available 

| Gen | Dex ID | Pokemon Name   | (Hex) 12-Bit mask |
|-----|--------|----------------|-------------------|
| 01  | 0001   | _bulbasaur     | :fff              |
|     | 0003   | _venusaur-gmax | :0ff              |
| 02  | 0152   | _chikorita     | :fff              |

Definition:
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

## Alias
The alias asigns certian requests to a specific form wether it be because misspelling like mega-shapedo it maps it to the real mega-sharkpedo
`
gourgeist-large=gourgeist gourgeist-small=gourgeist
`
re-assigning to gourgeist as we don't have any gourgeitst-large model

# render metadata 
A pre-compiled meta data json that contains data mostly for calculations but primarly data that only the 3d model holds but gets lost

## Purpose:
Its survives as mostly meta data for details that is only possible via the 3d model, like center point as doing the center of apng with pokemon like marshadow
will lead to terrible results as its apng is big due to its elongated shadow effect

These get pre-gennerated by @NathanMichael 

```json
  "pidgeotto": {
    "front": {
      "x": 359.0,"y": 45.5, //sprite 

      /*
        The renders are mostly* (not always) twice as large then shown in showdown, this is done for mostly resolution reasons 
      */
      
      "w": 141.5, "h": 160.5,//sprite width and height for showdown (mostly redundent)
      
      "center": "433.97,147.93", //Center of torso 
      "origin": "434.09,198.16", //Point the Pokemon stands on, used to place it on the battlefield
      "tallest-point": "432.25,118.00", //Height of Pokemon
      "hitbox": [407.0, 106.5, 466.0, 178.5] //x1, y1, x2, y2 of the visible sprite in the same space as x/y/w/h (used to scale and place their tooltip on only the visible sprite)
    },
    "back": { //exact same but for back-ani
      ...
    },
    /*
    This is the hash of the Pkm's Data.json

    It's there to save unecessary bandwith, sometimes when a sprite is updated it can change the Data.json and makes the cords invalid but we also don't want to fetch it each time and verify it's updated so instead we do

    fetch apng 
    check hash
    check last hash stored in meta-data.json
    if match: continue 
    else: fetch new data.json
    */
    "hash": "62bffe9e" //first 8 hex characters of the SHA-256
```

## move
This is just saves a category of moves for some purpose 

lunge attack animations are specifically disabled as they look horrible will the custom attack animation
