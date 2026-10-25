![](https://github.com/JxstMichie/PokemonShowdownPlus/blob/main/assets/github/logo.png)

A fan project that adds HD renders to Pokémon Showdown. 
<p>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/pokemon-showdown-plus/"><img src="https://raw.githubusercontent.com/JxstMichie/PokemonShowdownPlus/main/assets/github/firefox-store-icon.png" alt="Get for Firefox" width="150"></a>
  <img src="https://raw.githubusercontent.com/JxstMichie/PokemonShowdownPlus/main/assets/github/chrome-store-icon-disabled.png" alt="Chrome (unavailable)" width="150">
</p>

> [!IMPORTANT]
> - For sprite issues, such as incorrect rendering, please open an issue in this repository.
> - Issues reported in the sprite repositories will not be addressed.
> - This extension only supports the new Showdown client. Issues with the old client will not be fixed.
> - Non-standard modes that do not use teams of six in singles or doubles battles are not supported.

![](https://github.com/JxstMichie/PokemonShowdownPlus/blob/main/assets/github/showcase_preview.gif)

## How to Build

> [!NOTE]
> Currently, only Firefox is supported.
>
> Sideloading extensions without a Mozilla signature requires a special build of Firefox. See the section titled [“What are my options if I want to use an unsigned add-on? (advanced users)”](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox) at the bottom of the page.

### Windows

1. Install Python 3.x through the Microsoft Store or from the [Python website](https://www.python.org/downloads/).
2. When installing Python, ensure that the **Add to PATH** checkbox is selected.
3. Open the PokemonShowdownPlus directory, right-click, select **Open in Terminal**, and run:

   ```sh
   python3 scripts/build.py
   ```

4. A folder called `dist` will be created. You can find the build inside it.

### Linux

Depending on your distribution, Python may already be installed. Refer to your distribution’s documentation for installation instructions. The build process is otherwise the same.

If you encounter issues while building, never be ashamed to open an issue and ask for help. Anyone who is rude to others will be promptly removed.

## Contributions

> [!NOTE]
> LLM-assisted code contributions are allowed, but you must review and thoroughly test the generated code. You should understand how your contribution works.
>
> Pull requests that list AI tools as co-authors will be blocked. You should review and commit the code yourself.
>
> AI-generated artwork is strictly forbidden.

Most of the code in this repository is plain JavaScript. Pokémon assets and links to the related asset repositories are in `assets`.

You can find the Showdown client and server repositories under [Important Resources](#important-resources).

### Testing Code

Please test your changes on your own self-hosted Showdown instance whenever possible. This helps you avoid account restrictions and prevents disruption to other players on the ladder.

See [Important Resources](#important-resources) for the server repository, which you can use to host your own instance.

### Important Resources

- [Showdown Server](https://github.com/smogon/pokemon-showdown)
- [Showdown Client](https://github.com/smogon/pokemon-showdown-client)
- [Showdown Auth Server](https://github.com/smogon/pokemon-showdown-loginserver)
- [Mozilla JavaScript Documentation](https://developer.mozilla.org/de/docs/Web/JavaScript)
