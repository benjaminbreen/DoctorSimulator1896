# Wardrobe character contract

The character reconstruction, likeness, structure-decomposition, texture,
and shading contracts were read before implementation.

The existing Renderer C skeleton and body remain authoritative. The dress is
a cross-joint skinned shell. New structural details must either inherit the
host garment's skin indices and weights or be expressed in its material. No
camera-facing or free-floating clothing panels are allowed.
