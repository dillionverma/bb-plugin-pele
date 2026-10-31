---
name: pele
description: Mermaid fences in assistant replies, and .mmd and .mermaid files, render as diagrams through the Pele plugin. Use when you draw a diagram for the user in BB.
---

# Pele

Write a diagram as a fenced code block with the `mermaid` language. When the
fence closes, BB draws it with [Pele](https://pele.run) in BB's colors and
fonts. While the reply streams, the fence shows its source.

- Pele supports every diagram type in Mermaid 12.1, with its own layout.
- In diagrams Pele draws, `click` links and image shapes render as plain
  shapes. Put links in normal text.
- If Pele cannot parse a fence, or the reply ends before the fence closes,
  BB shows its own code block instead.
- Each diagram has show-source, copy and open buttons, and the user can pan
  and zoom it in the viewer. In the reply, a very wide diagram shrinks to fit
  the column, so prefer narrower layouts such as `flowchart TD` for long
  chains.
- For a large diagram the user will come back to, write it to a `.mmd` file
  and link the file. BB opens it as a diagram with the same controls and
  redraws it when the file changes.

There are no settings or commands. Run `bb plugin disable pele` to go back to
BB's renderer.
