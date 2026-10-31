---
name: pele
description: Mermaid fences in assistant replies render as diagrams through the Pele plugin. Use when you draw a diagram for the user in BB.
---

# Pele

Write a diagram as a fenced code block with the `mermaid` language. When the
fence closes, BB draws it with [Pele](https://pele.run) in BB's colors and
fonts. While the reply streams, the fence shows its source.

- Pele supports every diagram type in Mermaid 12.1, with its own layout.
- In diagrams Pele draws, `click` links and image shapes render as plain
  shapes. Put links in normal text.
- If Pele cannot parse a fence, or the reply ends before the fence closes,
  BB shows its own code block instead. BB's renderer can show links and
  load remote images.
- Each diagram has show-source, copy and open buttons. The user can zoom
  and pan a diagram in the viewer, but very wide diagrams shrink to fit the
  column in the reply, so prefer narrower layouts such as `flowchart TD` for
  long chains.
- Only assistant replies change. User messages and file previews keep
  BB's own Mermaid renderer.

There are no settings or commands. Run `bb plugin disable pele` to go back to
BB's renderer.
