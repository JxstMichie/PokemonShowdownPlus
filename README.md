![](https://github.com/JxstMichie/PokemonShowdownPlus/blob/main/assets/github/logo.png)

A fan project that adds HD renders to Pokemon Showdown.

> [!IMPORTANT]
> - For sprite issues, such as incorrect rendering, please open an issue in this repository.
> - Issues reported in the sprite repositories will not be addressed.
> - This extension soly supports the new client in showdown, issues regarding old client won't be fixed
> - Issues in non-standard modes that aren't a form of team of 6 singles or doubles will not be supported

![](https://github.com/JxstMichie/PokemonShowdownPlus/blob/main/assets/github/showcase_preview.gif)

## How to Build
> [!NOTE]
> Currently only firefox is supported
>
> Side-loading extensions without a mozilla signature requires a special builds of firefox, check the section called ["**What are my options if I want to use an unsigned add-on? (advanced users)**"](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox) at the very bottom

Windows:
1. Install Python 3.x via Microsoft store or [here](https://www.python.org/downloads/)  
2. When installing python ensure the checkbox to **add to PATH** is ticked
3. Go to the PokemonshowdownPlus directory and right click open in terminal 
> `python3 scripts/build.py`
4. A folder called dist will be created and inside you can find the build

Linux:
Depending on your Distro you will have python by default (refer to your Distro docs) but it's essentially the same

Regarding issues with building, never be ashamed to open an issue and ask for help, if anyone is being rude they will be promptly removed

## Contributions
> [!NOTE]
> LLM-assisted code contributions are allowed, but you must review and thoroughly test the generated code. You should understand how your contribution works.  
>
> Any co-authors from AIs PRs will be blocked, as you should be the one to review and commit and not the AI.  
>
> AI-generated artwork is strictly forbidden.

Most of the code in this repository is plain JavaScript. Pokemon assets and links to the related asset repositories are in `assets`.
You can find the Showdown client and server repositories under [Important resources](#important-resources).

### Testing Code
Please test your changes on your own self-hosted Showdown instance whenever possible. This helps avoid account restrictions and disrupting other players on ladder.

See [Important resources](#important-resources) for the server repository for self hosting

### Important resources
- [Showdown Server](https://github.com/smogon/pokemon-showdown)
- [Showdown Client](https://github.com/smogon/pokemon-showdown-client)
- [Mozilla JS Docs](https://developer.mozilla.org/de/docs/Web/JavaScript)

