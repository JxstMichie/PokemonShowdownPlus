
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
      "tallest-point": "432.25,118.00" //Height of Pokemon
    },
    "back": { //exact same but for back-ani
      ...
    },
    "aerial": true // Determines if they levitate
```

## move
This is just saves a category of moves for some purpose 

lunge attack animations are specifically disabled as they look horrible will the custom attack animation
