## What you get

Assistant replies draw their ` ```mermaid ` fences with [Pele](https://pele.run) instead of BB's built-in Mermaid renderer. Diagrams use BB's colors, fonts and radius, and recolor with the mode and palette.

- While a reply streams, the fence shows its source.
- When the fence closes, the diagram appears in a sandboxed frame.
- If a fence does not parse, or the reply ends before it closes, BB shows its own code block.

## How to use it

Ask an agent for a diagram. Any ` ```mermaid ` fence in its reply renders with Pele. There are no settings or commands.

## Requirements

BB 0.47 or later. Only assistant replies change. User messages and file previews keep BB's renderer. Diagrams render as SVG with no scripts and no network access, so `click` links and image shapes do not render.

## Credits

Pele is by kepano and released under the MIT license: [obsidianmd/pele](https://github.com/obsidianmd/pele).
