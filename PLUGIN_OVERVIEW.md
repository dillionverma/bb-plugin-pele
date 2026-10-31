## What you get

Assistant replies draw their ` ```mermaid ` fences, and BB opens `.mmd` and `.mermaid` files, with [Pele](https://pele.run) instead of BB's built-in Mermaid renderer. Diagrams use BB's colors, fonts and radius, and recolor with the mode and palette.

- While a reply streams, the fence shows its source.
- When the fence closes, the diagram appears in a sandboxed frame.
- If a fence does not parse, or the reply ends before it closes, BB shows its own code block.
- Each diagram has buttons to show its source, copy the source, and open a large viewer.
- In the viewer, drag or scroll to pan. Pinch, Ctrl-scroll, the zoom buttons or `+` and `-` zoom. Escape closes the viewer.
- A diagram opens whole when its text stays readable. A very wide or tall diagram opens at a readable size at its start, and **Fit whole diagram** shows all of it. `0` or **Reset view** goes back to the first view.
- A `.mmd` or `.mermaid` file opens as a diagram with the same controls, and redraws when the file changes. If the file does not parse, BB shows its own preview.

## How to use it

Ask an agent for a diagram. Any ` ```mermaid ` fence in its reply renders with Pele, and so does any `.mmd` or `.mermaid` file you open. There are no settings or commands.

To change diagram colors, change BB's palette in **Settings → Appearance → Palette**, or set your own colors in a BB theme. Chart colors come from the palette's accent colors, such as `--file-accent`, `--success` and `--pr-merged`.

## Requirements

BB 0.47 or later. Each diagram is SVG in a sandboxed frame. No scripts run in the frame. Diagram links, images and other network loads are blocked. The frame can only load BB's own fonts.

## Credits

Pele is by kepano and released under the MIT license: [obsidianmd/pele](https://github.com/obsidianmd/pele).
