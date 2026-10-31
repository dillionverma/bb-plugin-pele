## What you get

Assistant replies draw their ` ```mermaid ` fences with [Pele](https://pele.run) instead of BB's built-in Mermaid renderer. Diagrams use BB's colors, fonts and radius, and recolor with the mode and palette.

- While a reply streams, the fence shows its source.
- When the fence closes, the diagram appears in a sandboxed frame.
- If a fence does not parse, or the reply ends before it closes, BB shows its own code block.

## How to use it

Ask an agent for a diagram. Any ` ```mermaid ` fence in its reply renders with Pele. There are no settings or commands.

## Requirements

BB 0.47 or later. Each diagram is SVG in a sandboxed frame. No scripts run in the frame. Diagram links, images and other network loads are blocked. The frame can only load BB's own fonts.

## Limitations

- Only assistant replies change. User messages and file previews keep BB's renderer.
- Pele draws `click` links and image shapes as plain shapes. Fences that fall back to BB's block, and fences in user messages and file previews, use BB's renderer, which can show links and load remote images.
- Pele diagrams do not have BB's show-source, copy and zoom controls. Version 0.1 has no pan or zoom.
- Very wide diagrams shrink to fit the column, so their text can become very small.

## Credits

Pele is by kepano and released under the MIT license: [obsidianmd/pele](https://github.com/obsidianmd/pele).
